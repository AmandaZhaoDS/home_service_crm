// ─── Types ───────────────────────────────────────────────────────────────────

export type SMSIntent =
  | 'new_request'   // customer describing a new service need
  | 'follow_up'     // checking on an existing job
  | 'scheduling'    // wants to book / change a time
  | 'question'      // general question, pricing, availability
  | 'confirmation'  // short positive reply ("yes", "that works")
  | 'other';

export interface SMSJobExtraction {
  customerPhone: string;
  customerName: string;
  problemDescription: string;
  urgency: 'low' | 'medium' | 'high' | 'emergency';
  address?: string;
  estimatedCategory?: string;
  photoUrls?: string[];
  intent: SMSIntent;
  jobStatus: 'estimate' | 'scheduled';
  preferredDate?: string;
  /** The SMS reply to send back to the customer. */
  replyMessage: string;
  /** Whether to create a new CRM job for this message. */
  createJob: boolean;
}

export interface SMSContext {
  from: string;
  body: string;
  mediaUrls: string[];
  businessName: string;
  existingCustomer?: {
    name: string;
    recentJobs: Array<{ title: string; status: string; date: string }>;
  };
}

// ─── Agent prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an AI SMS dispatcher for a home service business called {BIZ}.

A customer texted the business. Your job:
1. Understand what they need
2. Extract all relevant information
3. Decide what action to take
4. Write a natural, helpful SMS reply the business will send back

INTENT:
- new_request: describing a problem or requesting a quote
- follow_up: asking about an existing job status
- scheduling: wants to book or change an appointment time
- question: pricing, availability, general info
- confirmation: short affirmative ("yes", "ok", "sounds good", "that works")
- other: unclear or unrelated

REPLY RULES:
- Warm, professional, concise (2–4 sentences)
- new_request + address given → "Thanks [name]! We received your [service] request at [address]. Our team will reach out within 2 hours to confirm details and pricing."
- new_request + no address → "Thanks for reaching out! We'd love to help with your [service issue]. Could you share your address so we can schedule a visit?"
- scheduling → confirm or propose specific times; if no time given, ask "What day/time works best for you?"
- follow_up → "I'll have our team follow up with you shortly on [job description]." If job context available, give status update.
- question → answer helpfully or "Someone from our team will call you shortly with more details."
- confirmation → "Perfect! We'll see you [then/soon]."
- Always end with "– {BIZ}"

EXTRACTION RULES:
- customerName: extract first/full name from the message. If not mentioned, set to null.
- urgency: "emergency" = active leak/flood/gas/no power. "high" = won't work at all. "medium" = default. "low" = cosmetic/maintenance.
- createJob: true for new_request and scheduling (new booking). false for follow_up, question, confirmation, other.
- jobStatus: "scheduled" only if customer gives a specific date/time. Otherwise "estimate".

Return ONLY valid JSON:
{
  "customerName": "string or null",
  "problemDescription": "concise description of the service need",
  "urgency": "low|medium|high|emergency",
  "address": "string or null",
  "estimatedCategory": "plumbing|electrical|HVAC|appliance|landscaping|general",
  "intent": "new_request|follow_up|scheduling|question|confirmation|other",
  "jobStatus": "estimate|scheduled",
  "preferredDate": "YYYY-MM-DD or null",
  "replyMessage": "the SMS text to send back",
  "createJob": true or false
}`;

// ─── Main agent ───────────────────────────────────────────────────────────────

export async function processIncomingSMS(ctx: SMSContext): Promise<SMSJobExtraction> {
  const apiKey = process.env.OPENAI_API_KEY;
  const systemPrompt = SYSTEM_PROMPT.replace(/\{BIZ\}/g, ctx.businessName);

  const customerCtx = ctx.existingCustomer
    ? `\nKNOWN CUSTOMER: ${ctx.existingCustomer.name}\nRECENT JOBS:\n${
        ctx.existingCustomer.recentJobs.slice(0, 3)
          .map(j => `  - ${j.title} (${j.status}, ${j.date})`).join('\n')
      }`
    : '\nNEW CUSTOMER (no existing record).';

  const userMsg = `Customer phone: ${ctx.from}${customerCtx}

Customer SMS: "${ctx.body}"${
    ctx.mediaUrls.length > 0
      ? `\n\nCustomer sent ${ctx.mediaUrls.length} photo(s) — typically indicates a visible issue, treat as higher urgency.`
      : ''
  }`;

  if (apiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o',
          max_tokens: 500,
          temperature: 0.3,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMsg },
          ],
        }),
      });

      const aiJson = await res.json();
      const content: string = aiJson.choices?.[0]?.message?.content ?? '{}';
      const match = content.match(/\{[\s\S]*\}/);
      const ex = match ? JSON.parse(match[0]) : {};

      return {
        customerPhone: ctx.from,
        customerName: ex.customerName || `Customer ${ctx.from.slice(-4)}`,
        problemDescription: ex.problemDescription || ctx.body,
        urgency: ex.urgency || 'medium',
        address: ex.address || undefined,
        estimatedCategory: ex.estimatedCategory || 'general',
        photoUrls: ctx.mediaUrls,
        intent: ex.intent || 'new_request',
        jobStatus: ex.jobStatus || 'estimate',
        preferredDate: ex.preferredDate || undefined,
        replyMessage: ex.replyMessage || fallbackReply(ctx.businessName),
        createJob: ex.createJob !== false,
      };
    } catch (err) {
      console.error('[SMS Agent] OpenAI error:', err);
    }
  }

  // ── Fallback: no API key ──────────────────────────────────────────────────
  const lower = ctx.body.toLowerCase();
  return {
    customerPhone: ctx.from,
    customerName: `Customer ${ctx.from.slice(-4)}`,
    problemDescription: ctx.body,
    urgency: lower.includes('emergency') || lower.includes('flood') ? 'emergency'
           : lower.includes('asap') || lower.includes('leak') ? 'high'
           : 'medium',
    estimatedCategory: 'general',
    photoUrls: ctx.mediaUrls,
    intent: 'new_request',
    jobStatus: 'estimate',
    replyMessage: fallbackReply(ctx.businessName),
    createJob: true,
  };
}

function fallbackReply(biz: string) {
  return `Thanks for reaching out! We received your message and will contact you within 2 hours to confirm details and pricing. – ${biz}`;
}

// ─── CRM record builders ──────────────────────────────────────────────────────

export function createJobFromExtraction(
  extraction: SMSJobExtraction,
  _userId?: string,
): Record<string, unknown> {
  return {
    id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title: extraction.problemDescription.substring(0, 60),
    customer: extraction.customerName,
    address: extraction.address || 'To be confirmed',
    date: extraction.preferredDate ?? new Date().toISOString().split('T')[0],
    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
    status: extraction.jobStatus,
    amount: 0,
    estimate: 0,
    technician: '',
    items: [],
    notes: `[SMS] ${extraction.problemDescription}\nPhone: ${extraction.customerPhone}\nUrgency: ${extraction.urgency}`,
    photos: extraction.photoUrls || [],
    smsSource: true,
    incomingMessageText: extraction.problemDescription,
    urgencyLevel: extraction.urgency,
  };
}

export function createCustomerFromExtraction(
  extraction: SMSJobExtraction,
): Record<string, unknown> {
  return {
    id: `customer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: extraction.customerName,
    email: '',
    phone: extraction.customerPhone,
    address: extraction.address || 'To be confirmed',
    totalJobs: 0,
    totalSpent: 0,
    lastService: '',
    customerPhoneVerified: true,
    source: 'sms',
  };
}

// ── Legacy shims ──────────────────────────────────────────────────────────────

/** @deprecated Use processIncomingSMS */
export async function extractJobFromSMS(
  smsBody: string,
  customerPhone: string,
  mediaUrls?: string[],
): Promise<SMSJobExtraction> {
  return processIncomingSMS({ from: customerPhone, body: smsBody, mediaUrls: mediaUrls ?? [], businessName: 'JobStack' });
}

/** @deprecated replyMessage is now part of SMSJobExtraction */
export function generateConfirmationSMS(extraction: SMSJobExtraction, businessName = 'JobStack'): string {
  return extraction.replyMessage || fallbackReply(businessName);
}
