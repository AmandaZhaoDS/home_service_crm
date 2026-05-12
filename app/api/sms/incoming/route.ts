import { NextRequest } from 'next/server';
import {
  processIncomingSMS,
  createJobFromExtraction,
  createCustomerFromExtraction,
} from '@/lib/smsProcessing';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const TWIML_OK = new Response('<?xml version="1.0"?><Response></Response>', {
  headers: { 'Content-Type': 'text/xml' },
});

/**
 * POST /api/sms/incoming
 * Twilio webhook — receives customer SMS messages.
 *
 * Routing strategy (first match wins):
 *   1. ?userId= query param             → dev/testing override
 *   2. From phone match in customer list → route to owner of that customer
 *   3. MessagingServiceSid / To          → twilio_numbers table lookup
 *   4. DEFAULT_SMS_USER_ID env var       → single-tenant / demo catch-all
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const from      = formData.get('From')                as string;
    const body      = formData.get('Body')                as string;
    const to        = formData.get('To')                  as string;
    const msgSvcSid = formData.get('MessagingServiceSid') as string;
    const mediaCount = parseInt(formData.get('NumMedia') as string) || 0;

    const mediaUrls: string[] = [];
    for (let i = 0; i < mediaCount; i++) {
      const url = formData.get(`MediaUrl${i}`) as string;
      if (url) mediaUrls.push(url);
    }

    if (!from || !body) return TWIML_OK;

    const supabase = getSupabaseAdmin();
    let userId: string | null = request.nextUrl.searchParams.get('userId');

    // ── 1. Route by customer phone match ──────────────────────────────────────
    if (!userId) {
      const { data: allRows } = await supabase.from('user_crm_data').select('user_id, data');
      if (allRows) {
        for (const row of allRows) {
          const customers: Array<{ phone?: string }> = row.data?.customers ?? [];
          if (customers.find(c => c.phone && normalizePhone(c.phone) === normalizePhone(from))) {
            userId = row.user_id;
            break;
          }
        }
      }
    }

    // ── 2. Route by twilio_numbers table ─────────────────────────────────────
    if (!userId && (msgSvcSid || to)) {
      const col = msgSvcSid ? 'messaging_service_sid' : 'phone_number';
      const { data } = await supabase
        .from('twilio_numbers').select('user_id').eq(col, msgSvcSid ?? to).maybeSingle();
      userId = data?.user_id ?? null;
    }

    // ── 3. Catch-all ──────────────────────────────────────────────────────────
    if (!userId) userId = process.env.DEFAULT_SMS_USER_ID ?? null;

    if (!userId) {
      console.warn(`[SMS] No user found for From=${from}. Set DEFAULT_SMS_USER_ID as catch-all.`);
      return TWIML_OK;
    }

    console.log(`[SMS] Routed → user=${userId} | From=${from} | "${body.slice(0, 80)}"`);

    // ── Load CRM data ─────────────────────────────────────────────────────────
    const { data: userData } = await supabase
      .from('user_crm_data').select('data').eq('user_id', userId).single();

    const crmData: {
      jobs: Record<string, unknown>[];
      customers: Record<string, unknown>[];
      invoices: Record<string, unknown>[];
      appointments: Record<string, unknown>[];
      pricebook: Record<string, unknown>[];
      reminders: Record<string, unknown>[];
    } = userData?.data ?? { jobs: [], customers: [], invoices: [], appointments: [], pricebook: [], reminders: [] };

    // ── Resolve existing customer for context ─────────────────────────────────
    const existingCustomer = crmData.customers.find(
      (c: Record<string, unknown>) =>
        c.phone && normalizePhone(c.phone as string) === normalizePhone(from),
    ) as Record<string, unknown> | undefined;

    const existingCustomerCtx = existingCustomer
      ? {
          name: existingCustomer.name as string,
          recentJobs: (crmData.jobs as Array<Record<string, unknown>>)
            .filter(j => j.customer === existingCustomer.name)
            .slice(0, 3)
            .map(j => ({
              title: j.title as string,
              status: j.status as string,
              date: j.date as string,
            })),
        }
      : undefined;

    // ── Run AI agent ──────────────────────────────────────────────────────────
    const extraction = await processIncomingSMS({
      from,
      body,
      mediaUrls,
      businessName: 'JobStack',
      existingCustomer: existingCustomerCtx,
    });

    console.log(`[SMS] Intent=${extraction.intent} createJob=${extraction.createJob} urgency=${extraction.urgency}`);

    // ── Upsert customer ───────────────────────────────────────────────────────
    let customer = existingCustomer;
    if (!customer) {
      customer = createCustomerFromExtraction(extraction) as Record<string, unknown>;
      crmData.customers.push(customer);
    } else if (
      // Update name if it was "Unknown Customer" and we now have a real name
      (customer.name as string).startsWith('Unknown Customer') &&
      !extraction.customerName.startsWith('Customer ')
    ) {
      (customer as Record<string, unknown>).name = extraction.customerName;
    }

    // ── Create job if appropriate ─────────────────────────────────────────────
    if (extraction.createJob) {
      const newJob = createJobFromExtraction(extraction) as Record<string, unknown>;
      newJob.customer = customer.name;
      crmData.jobs.push(newJob);
    }

    // ── Persist ───────────────────────────────────────────────────────────────
    const { error: saveErr } = await supabase
      .from('user_crm_data').update({ data: crmData }).eq('user_id', userId);
    if (saveErr) console.error('[SMS] Save failed:', saveErr.message);

    // ── Send reply ────────────────────────────────────────────────────────────
    fetch(new URL('/api/sms/send', request.nextUrl.origin).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: from, message: extraction.replyMessage }),
    }).catch(err => console.warn('[SMS] Reply send failed:', err));

    return TWIML_OK;
  } catch (err) {
    console.error('[SMS] Unhandled error:', err);
    return TWIML_OK;
  }
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}
