import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * POST /api/twilio/provision
 * Purchase a dedicated local US Twilio number for a user and store it in
 * twilio_numbers. Called automatically after registration (fire-and-forget)
 * and can also be called from the dashboard for existing users.
 *
 * Idempotent — returns the existing number if one is already assigned.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json() as { userId?: string };
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      return NextResponse.json({ error: 'Twilio not configured' }, { status: 500 });
    }

    const supabase = getSupabaseAdmin();
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const friendlyName = `JobPilot-${userId.slice(0, 8)}`;
    const webhookUrl = `${request.nextUrl.origin}/api/sms/incoming`;

    // ── Layer 1: DB idempotency check ──────────────────────────────────────
    const { data: existing } = await supabase
      .from('twilio_numbers')
      .select('phone_number')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing?.phone_number) {
      return NextResponse.json({ phoneNumber: existing.phone_number });
    }

    // ── Layer 2: Twilio-direct check (prevents double-purchase if DB insert
    //    failed on a previous attempt, e.g. table didn't exist yet) ─────────
    const listRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?FriendlyName=${encodeURIComponent(friendlyName)}`,
      { headers: { Authorization: `Basic ${auth}` } }
    );
    if (listRes.ok) {
      const listData = await listRes.json();
      const already = listData.incoming_phone_numbers?.[0];
      if (already) {
        // Number already purchased in Twilio — re-sync to DB and return
        await supabase.from('twilio_numbers').upsert(
          { user_id: userId, phone_number: already.phone_number, twilio_sid: already.sid, label: 'Business Line' },
          { onConflict: 'user_id' }
        );
        await supabase.from('profiles').update({ sms_phone: already.phone_number }).eq('id', userId);
        console.log(`[Provision] Re-synced existing number ${already.phone_number} → user ${userId}`);
        return NextResponse.json({ phoneNumber: already.phone_number });
      }
    }

    // ── Find an available local US number ─────────────────────────────────
    const searchRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/AvailablePhoneNumbers/US/Local.json?SmsEnabled=true&Limit=1`,
      { headers: { Authorization: `Basic ${auth}` } }
    );

    if (!searchRes.ok) {
      const err = await searchRes.json();
      console.error('[Provision] Search failed:', err);
      return NextResponse.json({ error: 'Could not search available numbers — check Twilio credentials' }, { status: 502 });
    }

    const searchData = await searchRes.json();
    const availableNumber: string | undefined = searchData.available_phone_numbers?.[0]?.phone_number;

    if (!availableNumber) {
      return NextResponse.json({ error: 'No available numbers in region' }, { status: 404 });
    }

    // ── Purchase ───────────────────────────────────────────────────────────
    const purchaseBody = new URLSearchParams({
      PhoneNumber: availableNumber,
      FriendlyName: friendlyName,
      SmsUrl: webhookUrl,
      SmsMethod: 'POST',
    });

    const purchaseRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json`,
      {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: purchaseBody.toString(),
      }
    );

    if (!purchaseRes.ok) {
      const err = await purchaseRes.json();
      console.error('[Provision] Purchase failed:', err);
      return NextResponse.json({ error: err.message ?? 'Purchase failed — check Twilio account balance' }, { status: 502 });
    }

    const purchased = await purchaseRes.json();
    const phoneNumber: string = purchased.phone_number;
    const twilioSid: string   = purchased.sid;

    // ── Persist (upsert to survive race conditions) ────────────────────────
    const { error: dbErr } = await supabase.from('twilio_numbers').upsert(
      { user_id: userId, phone_number: phoneNumber, twilio_sid: twilioSid, label: 'Business Line' },
      { onConflict: 'user_id' }
    );
    if (dbErr) console.error('[Provision] DB upsert failed:', dbErr.message, '— run the twilio_numbers SQL migration');

    // Also store in profiles so fetchUserRecord can read it without RLS timing issues
    await supabase.from('profiles').update({ sms_phone: phoneNumber }).eq('id', userId);

    console.log(`[Provision] Assigned ${phoneNumber} (${twilioSid}) → user ${userId}`);
    return NextResponse.json({ phoneNumber });
  } catch (err) {
    console.error('[Provision] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
