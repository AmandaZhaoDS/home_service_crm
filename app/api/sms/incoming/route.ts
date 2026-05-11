import { NextRequest } from 'next/server';
import {
  extractJobFromSMS,
  generateConfirmationSMS,
  createJobFromExtraction,
  createCustomerFromExtraction,
} from '@/lib/smsProcessing';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const TWIML_OK = new Response('<?xml version="1.0"?><Response></Response>', {
  headers: { 'Content-Type': 'text/xml' },
});

/**
 * POST /api/sms/incoming
 * Twilio webhook — single shared number for all JobPilot users.
 *
 * Routing strategy:
 *   1. ?userId= query param        → dev/testing override
 *   2. From phone number match     → find which user already has this customer
 *   3. MessagingServiceSid / To    → twilio_numbers table (if per-user numbers ever added)
 *   4. DEFAULT_USER_ID env var     → catch-all for unrecognized senders (single-tenant / demo)
 *
 * This means new users never need to configure anything — messages route
 * automatically based on who the sender already is.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const from        = formData.get('From')               as string;
    const body        = formData.get('Body')               as string;
    const to          = formData.get('To')                 as string;
    const msgSvcSid   = formData.get('MessagingServiceSid') as string;
    const mediaCount  = parseInt(formData.get('NumMedia') as string) || 0;

    const mediaUrls: string[] = [];
    for (let i = 0; i < mediaCount; i++) {
      const url = formData.get(`MediaUrl${i}`) as string;
      if (url) mediaUrls.push(url);
    }

    if (!from || !body) return TWIML_OK;

    const supabase = getSupabaseAdmin();
    let userId: string | null = request.nextUrl.searchParams.get('userId');

    // ── 1. Route by customer phone match (shared-number model) ─────────────
    if (!userId) {
      // Fetch all users' CRM data and find who has this customer phone
      const { data: allRows } = await supabase
        .from('user_crm_data')
        .select('user_id, data');

      if (allRows) {
        for (const row of allRows) {
          const customers: Array<{ phone?: string }> = row.data?.customers ?? [];
          const match = customers.find(c => c.phone && normalizePhone(c.phone) === normalizePhone(from));
          if (match) {
            userId = row.user_id;
            break;
          }
        }
      }
    }

    // ── 2. Route by twilio_numbers table (per-user number model) ───────────
    if (!userId && (msgSvcSid || to)) {
      const col = msgSvcSid ? 'messaging_service_sid' : 'phone_number';
      const val = msgSvcSid ?? to;
      const { data } = await supabase
        .from('twilio_numbers')
        .select('user_id')
        .eq(col, val)
        .maybeSingle();
      userId = data?.user_id ?? null;
    }

    // ── 3. Default catch-all (single-tenant / demo mode) ───────────────────
    if (!userId) {
      userId = process.env.DEFAULT_SMS_USER_ID ?? null;
    }

    if (!userId) {
      console.warn(`[SMS] No user found for From=${from}. Set DEFAULT_SMS_USER_ID env var as catch-all.`);
      return TWIML_OK;
    }

    console.log(`[SMS] Routed to user=${userId} | From=${from} | Body=${body.slice(0, 80)}`);

    // ── AI extraction + CRM update ─────────────────────────────────────────
    const extraction = await extractJobFromSMS(body, from, mediaUrls);

    const { data: userData } = await supabase
      .from('user_crm_data')
      .select('data')
      .eq('user_id', userId)
      .single();

    const crmData = userData?.data ?? {
      jobs: [], customers: [], invoices: [], appointments: [], pricebook: [], reminders: [],
    };

    // Upsert customer
    let customer = crmData.customers.find(
      (c: { phone?: string }) => c.phone && normalizePhone(c.phone) === normalizePhone(from)
    );
    if (!customer) {
      customer = createCustomerFromExtraction(extraction);
      crmData.customers.push(customer);
    }

    // Create job
    const newJob = createJobFromExtraction(extraction, userId);
    newJob.customer = customer.name;
    crmData.jobs.push(newJob);

    const { error: saveErr } = await supabase
      .from('user_crm_data')
      .update({ data: crmData })
      .eq('user_id', userId);
    if (saveErr) console.error('[SMS] Failed to save CRM data:', saveErr.message);

    // ── Confirmation SMS ───────────────────────────────────────────────────
    const confirmMsg = generateConfirmationSMS(extraction);
    fetch(new URL('/api/sms/send', request.nextUrl.origin).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: from, message: confirmMsg }),
    }).catch(err => console.warn('[SMS] Confirmation failed:', err));

    return TWIML_OK;
  } catch (err) {
    console.error('[SMS] Unhandled error:', err);
    return TWIML_OK;
  }
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}
