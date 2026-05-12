import { NextRequest } from 'next/server';
import { runSMSAgent } from '@/lib/smsAgent';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import type { SmsConversation, FieldProData, PricebookItem } from '@/lib/fieldproStorage';

const TWIML_OK = new Response('<?xml version="1.0"?><Response></Response>', {
  headers: { 'Content-Type': 'text/xml' },
});

const BIZ_NAME = 'JobStack';

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
    const formData   = await request.formData();
    const from       = formData.get('From')                as string;
    const body       = formData.get('Body')                as string;
    const to         = formData.get('To')                  as string;
    const msgSvcSid  = formData.get('MessagingServiceSid') as string;
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
          if (customers.find(c => c.phone && norm(c.phone) === norm(from))) {
            userId = row.user_id;
            break;
          }
          // Also check open conversations
          const convos: Array<{ customerPhone?: string }> = row.data?.smsConversations ?? [];
          if (convos.find(cv => cv.customerPhone && norm(cv.customerPhone) === norm(from))) {
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

    const crmData: FieldProData = userData?.data ?? {
      jobs: [], customers: [], invoices: [], appointments: [], pricebook: [], reminders: [], smsConversations: [],
    };
    if (!crmData.smsConversations) crmData.smsConversations = [];

    // ── Find or create conversation ───────────────────────────────────────────
    const normFrom = norm(from);
    let conversation = crmData.smsConversations.find(
      cv => norm(cv.customerPhone) === normFrom && cv.state !== 'closed',
    );

    if (!conversation) {
      // Look up existing customer for pre-filled name
      const existingCustomer = crmData.customers.find(
        c => c.phone && norm(c.phone) === normFrom,
      );
      conversation = {
        id: `sms-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        customerPhone: from,
        customerName: existingCustomer?.name,
        state: 'gathering',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      crmData.smsConversations.push(conversation);
      console.log(`[SMS] New conversation ${conversation.id} for ${from}`);
    }

    // Append customer message
    conversation.messages.push({ role: 'customer', content: body, ts: new Date().toISOString() });
    if (mediaUrls.length > 0) {
      conversation.messages.push({
        role: 'customer',
        content: `[Sent ${mediaUrls.length} photo(s): ${mediaUrls.join(', ')}]`,
        ts: new Date().toISOString(),
      });
    }

    // ── Run stateful agent ────────────────────────────────────────────────────
    const pricebook: PricebookItem[] = crmData.pricebook ?? [];
    const result = await runSMSAgent(conversation, body, pricebook, BIZ_NAME);

    console.log(`[SMS] Agent: ${conversation.state} → ${result.nextState} | reply=${!!result.replyToCustomer} | job=${result.shouldCreateJob}`);

    // ── Merge agent updates back into conversation ────────────────────────────
    conversation.state     = result.nextState;
    conversation.updatedAt = new Date().toISOString();
    if (result.updatedConversation.customerName) conversation.customerName = result.updatedConversation.customerName;
    if (result.updatedConversation.problemDescription) conversation.problemDescription = result.updatedConversation.problemDescription;
    if (result.updatedConversation.address) conversation.address = result.updatedConversation.address;
    if (result.updatedConversation.urgency) conversation.urgency = result.updatedConversation.urgency;
    if (result.updatedConversation.preferredDate) conversation.preferredDate = result.updatedConversation.preferredDate;
    if (result.draftEstimate) conversation.draftEstimate = result.draftEstimate;

    // ── Upsert / update customer record ──────────────────────────────────────
    const customerName = conversation.customerName || `Customer ${from.slice(-4)}`;
    let customer = crmData.customers.find(c => c.phone && norm(c.phone) === normFrom);
    if (!customer) {
      customer = {
        id: `customer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: customerName,
        email: '',
        phone: from,
        address: conversation.address || 'To be confirmed',
        totalJobs: 0,
        totalSpent: 0,
        lastService: '',
        customerPhoneVerified: true,
        source: 'sms',
      };
      crmData.customers.push(customer);
    } else if (customer.name.startsWith('Unknown Customer') || customer.name.startsWith('Customer ')) {
      if (!customerName.startsWith('Customer ')) customer.name = customerName;
    }

    // ── Create job when confirmed ─────────────────────────────────────────────
    // Hard guard: job creation only allowed when agent explicitly reaches 'confirmed'.
    // Prevents AI from jumping gathering→confirmed in one message and fragmenting records.
    if (result.shouldCreateJob && result.nextState === 'confirmed') {
      const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const newJob = {
        id: jobId,
        title: (conversation.problemDescription || body).substring(0, 60),
        customer: customer.name,
        address: conversation.address || 'To be confirmed',
        date: conversation.preferredDate ?? new Date().toISOString().split('T')[0],
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        status: (conversation.preferredDate ? 'scheduled' : 'estimate') as 'scheduled' | 'estimate',
        amount: conversation.draftEstimate?.total ?? 0,
        estimate: conversation.draftEstimate?.total ?? 0,
        technician: '',
        items: (conversation.draftEstimate?.items ?? []).map((it, idx) => ({
          id: `item-${idx}`,
          label: it.label,
          amount: it.amount,
          quantity: it.quantity,
        })),
        notes: `[SMS] ${conversation.problemDescription || body}\nPhone: ${from}\nUrgency: ${conversation.urgency || 'medium'}`,
        photos: mediaUrls,
        smsSource: true,
        incomingMessageText: conversation.problemDescription || body,
        urgencyLevel: (conversation.urgency || 'medium') as 'low' | 'medium' | 'high' | 'emergency',
      };
      crmData.jobs.push(newJob);
      conversation.jobId  = jobId;
      conversation.state  = 'closed';
      console.log(`[SMS] Created job ${jobId} from conversation ${conversation.id}`);
    }

    // ── Append agent reply to history ─────────────────────────────────────────
    if (result.replyToCustomer) {
      conversation.messages.push({ role: 'agent', content: result.replyToCustomer, ts: new Date().toISOString() });
    }

    // ── Persist (upsert so a missing row doesn't silently drop data) ──────────
    const { error: saveErr } = await supabase
      .from('user_crm_data')
      .upsert({ user_id: userId, data: crmData }, { onConflict: 'user_id' });
    if (saveErr) console.error('[SMS] Save failed:', saveErr.message);
    else console.log(`[SMS] Saved: conversations=${crmData.smsConversations?.length} customers=${crmData.customers.length}`);

    // ── Send reply (awaited — fire-and-forget dies in Vercel serverless) ──────
    if (result.replyToCustomer) {
      try {
        const sendRes = await fetch(new URL('/api/sms/send', request.nextUrl.origin).toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: from, message: result.replyToCustomer }),
        });
        const sendJson = await sendRes.json().catch(() => ({}));
        if (!sendRes.ok) {
          console.error('[SMS] Send failed:', sendJson);
        } else {
          console.log(`[SMS] Reply sent → ${from} | SID=${sendJson.messageSid}`);
        }
      } catch (err) {
        console.error('[SMS] Send error:', err);
      }
    }

    return TWIML_OK;
  } catch (err) {
    console.error('[SMS] Unhandled error:', err);
    return TWIML_OK;
  }
}

function norm(phone: string): string {
  return phone.replace(/\D/g, '');
}
