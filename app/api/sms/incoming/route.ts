import { NextRequest, NextResponse } from 'next/server';
import {
  extractJobFromSMS,
  generateConfirmationSMS,
  createJobFromExtraction,
  createCustomerFromExtraction,
} from '@/lib/smsProcessing';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * POST /api/sms/incoming
 * Twilio webhook for inbound SMS.
 *
 * Routing priority:
 *   1. ?userId= query param  (dev/testing override)
 *   2. MessagingServiceSid   → twilio_numbers table lookup  (production)
 *   3. To (phone number)     → twilio_numbers table lookup  (production fallback)
 *
 * This lets multiple users share one webhook URL. Each user registers their
 * Twilio number / messaging service SID in the twilio_numbers table.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const from = formData.get('From') as string;
    const body = formData.get('Body') as string;
    const to = formData.get('To') as string;
    const messagingServiceSid = formData.get('MessagingServiceSid') as string;
    const mediaCount = parseInt(formData.get('NumMedia') as string) || 0;

    const mediaUrls: string[] = [];
    for (let i = 0; i < mediaCount; i++) {
      const mediaUrl = formData.get(`MediaUrl${i}`) as string;
      if (mediaUrl) mediaUrls.push(mediaUrl);
    }

    if (!from || !body) {
      return new Response('<?xml version="1.0"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // ── Route to the right user ──────────────────────────────────────────────
    let userId: string | null = request.nextUrl.searchParams.get('userId');

    if (!userId) {
      const supabase = getSupabaseAdmin();

      // Try MessagingServiceSid first (most stable identifier)
      if (messagingServiceSid) {
        const { data } = await supabase
          .from('twilio_numbers')
          .select('user_id')
          .eq('messaging_service_sid', messagingServiceSid)
          .maybeSingle();
        userId = data?.user_id ?? null;
      }

      // Fallback: look up by To phone number
      if (!userId && to) {
        const { data } = await supabase
          .from('twilio_numbers')
          .select('user_id')
          .eq('phone_number', to)
          .maybeSingle();
        userId = data?.user_id ?? null;
      }
    }

    if (!userId) {
      console.warn(`[SMS] No user found for MessagingServiceSid=${messagingServiceSid} To=${to}. Add a row to twilio_numbers.`);
      // Return TwiML 200 so Twilio doesn't retry
      return new Response('<?xml version="1.0"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    console.log(`[SMS] Routing to user=${userId} | From=${from} | Body=${body.slice(0, 80)}`);

    // ── AI extraction ────────────────────────────────────────────────────────
    const extraction = await extractJobFromSMS(from, body, mediaUrls);

    // ── Load + update CRM data ───────────────────────────────────────────────
    const supabase = getSupabaseAdmin();
    const { data: userData, error: fetchError } = await supabase
      .from('user_crm_data')
      .select('data')
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      console.error('[SMS] Error fetching user data:', fetchError);
      return new Response('<?xml version="1.0"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    const crmData = userData?.data ?? {
      jobs: [], customers: [], invoices: [], appointments: [], pricebook: [], reminders: [],
    };

    // Upsert customer by phone number
    let customer = crmData.customers.find((c: any) => c.phone === extraction.customerPhone);
    if (!customer) {
      customer = createCustomerFromExtraction(extraction);
      crmData.customers.push(customer);
      console.log(`[SMS] New customer: ${customer.name}`);
    }

    // Create job
    const newJob = createJobFromExtraction(extraction, userId);
    newJob.customer = customer.name;
    crmData.jobs.push(newJob);

    const { error: updateError } = await supabase
      .from('user_crm_data')
      .update({ data: crmData, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (updateError) {
      console.error('[SMS] Error saving CRM data:', updateError);
    }

    // ── Confirmation SMS ─────────────────────────────────────────────────────
    const confirmationMessage = generateConfirmationSMS(extraction);
    try {
      await fetch(
        new URL('/api/sms/send', request.nextUrl.origin).toString(),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: extraction.customerPhone, message: confirmationMessage }),
        }
      );
    } catch (smsErr) {
      console.warn('[SMS] Confirmation send failed:', smsErr);
    }

    // Return empty TwiML (Twilio expects XML, not JSON, from webhooks)
    return new Response('<?xml version="1.0"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('[SMS] Unhandled error:', error);
    return new Response('<?xml version="1.0"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}
