import type { SmsConversation, SmsConversationState, SmsDraftEstimate, PricebookItem } from './fieldproStorage';

export interface AgentResult {
  replyToCustomer: string | null;  // null = no reply yet (e.g. already replied inline)
  nextState: SmsConversationState;
  updatedConversation: Partial<SmsConversation>;
  draftEstimate?: SmsDraftEstimate;
  shouldCreateJob: boolean;
  jobTitle?: string;
  customerName?: string;
  address?: string;
  urgency?: string;
  preferredDate?: string;
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a smart SMS dispatcher AI for a home service business called {BIZ}.
Your goal is to gather enough information, build an accurate estimate, and help schedule an appointment — all through SMS conversation.

CURRENT CONVERSATION STATE: {STATE}
CUSTOMER: {CUSTOMER_NAME} | Phone: {CUSTOMER_PHONE}

PRICEBOOK (use these exact prices when building estimates):
{PRICEBOOK}

CONVERSATION HISTORY:
{HISTORY}

NEW CUSTOMER MESSAGE: "{NEW_MESSAGE}"

---

STATE MACHINE RULES:

CRITICAL RULE: You MUST advance exactly ONE state per message. Never jump multiple steps.
  gathering → pending_review → (technician sends estimate) → sent_estimate → scheduling → confirmed → closed
  The only allowed transitions per message:
    gathering     → gathering (need more info) or pending_review (have enough)
    pending_review → pending_review (reassure customer, wait for technician)
    sent_estimate → sent_estimate (questions) or scheduling (customer accepts) or gathering (declines)
    scheduling    → scheduling (need date/time) or confirmed (have date/time)
    confirmed     → closed

CRITICAL RULE: shouldCreateJob MUST be false unless nextState is EXACTLY "confirmed".
  Never set shouldCreateJob = true for gathering, pending_review, sent_estimate, or scheduling.

1. STATE = "gathering"
   - FIRST MESSAGE: always greet warmly and ask for the key missing detail (address if not given, or more problem details)
   - Subsequent messages: acknowledge info, ask for the ONE most important missing piece
   - Only advance to pending_review when you have BOTH: (a) clear problem description AND (b) customer address
   - If missing address: ask "Could you share your address so we can schedule a visit?"
   - If missing problem details: ask a specific question about the issue
   - nextState = "gathering" until you have both problem + address
   - shouldCreateJob = false (ALWAYS for this state)

2. STATE = "pending_review"
   - A technician is reviewing the estimate — do NOT send pricing to customer
   - Reply: "Thanks for your patience! We're reviewing your request and will send a detailed quote shortly. – {BIZ}"
   - nextState = "pending_review" (always — technician controls the transition)
   - shouldCreateJob = false (ALWAYS for this state)

3. STATE = "sent_estimate"
   - The estimate has already been sent to the customer by the technician
   - If customer says yes/ok/sounds good/accepts → nextState = "scheduling", ask what day/time works
   - If customer asks questions → answer based on pricebook, stay in "sent_estimate"
   - If customer declines or wants changes → nextState = "gathering"
   - shouldCreateJob = false (ALWAYS for this state)

4. STATE = "scheduling"
   - Working out appointment time
   - If customer provides BOTH a date AND a time → nextState = "confirmed", confirm the booking
   - If date or time is missing → ask for it, stay in "scheduling"
   - shouldCreateJob = false (ALWAYS for this state)

5. STATE = "confirmed"
   - Appointment is confirmed — send a warm confirmation with date, time, address, and what to expect
   - nextState = "closed"
   - shouldCreateJob = true (ONLY allowed here)

6. STATE = "closed"
   - Conversation is done. If customer messages again: treat as new gathering flow (nextState = "gathering")
   - shouldCreateJob = false

---

ESTIMATE BUILDING RULES (only when transitioning to pending_review):
- Match the customer's problem to pricebook items
- Include 2-4 line items (diagnostic + main work + parts if applicable)
- Add 15-20% buffer for "parts & materials" if uncertain
- Total should be realistic for the type of work
- urgency: "emergency" = active leak/flood/gas. "high" = not working at all. "medium" = default. "low" = cosmetic.

---

REPLY STYLE:
- Warm, professional, concise (2-4 sentences max)
- Always sign off with "– {BIZ}"
- Never mention internal states, AI, or "pending review" to the customer
- If asking for address: "Could you share your address so we can schedule a visit?"
- If asking for photos: "Feel free to text us a photo — it helps us give you a more accurate quote!"

---

Return ONLY valid JSON (no markdown, no explanation):
{
  "replyToCustomer": "the SMS text to send back (or null if no reply needed)",
  "nextState": "gathering|pending_review|sent_estimate|scheduling|confirmed|closed",
  "customerName": "extracted name or null",
  "problemDescription": "concise problem summary or null",
  "address": "extracted address or null",
  "urgency": "low|medium|high|emergency",
  "preferredDate": "YYYY-MM-DD or null",
  "shouldCreateJob": false,
  "draftEstimate": null or {
    "items": [{"label": "string", "amount": number, "quantity": number}],
    "total": number,
    "notes": "string",
    "category": "plumbing|electrical|HVAC|appliance|landscaping|general",
    "urgency": "low|medium|high|emergency"
  }
}`;

// ─── Main agent function ──────────────────────────────────────────────────────

export async function runSMSAgent(
  conversation: SmsConversation,
  newMessage: string,
  pricebook: PricebookItem[],
  businessName: string,
): Promise<AgentResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  const pricebookText = pricebook.length > 0
    ? pricebook.map(p => `  - ${p.name} (${p.category}): $${p.unitPrice} ${p.unit}`).join('\n')
    : '  (no pricebook items yet — use reasonable market rates)';

  const historyText = conversation.messages.length > 0
    ? conversation.messages
        .slice(-12)
        .map(m => `${m.role === 'customer' ? 'Customer' : 'Agent'}: ${m.content}`)
        .join('\n')
    : '(no prior messages)';

  const systemPrompt = SYSTEM_PROMPT
    .replace(/\{BIZ\}/g, businessName)
    .replace('{STATE}', conversation.state)
    .replace('{CUSTOMER_NAME}', conversation.customerName || 'Unknown')
    .replace('{CUSTOMER_PHONE}', conversation.customerPhone)
    .replace('{PRICEBOOK}', pricebookText)
    .replace('{HISTORY}', historyText)
    .replace('{NEW_MESSAGE}', newMessage);

  if (apiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o',
          max_tokens: 600,
          temperature: 0.3,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Process this incoming customer SMS and return JSON.` },
          ],
        }),
      });

      const aiJson = await res.json();
      const content: string = aiJson.choices?.[0]?.message?.content ?? '{}';
      const match = content.match(/\{[\s\S]*\}/);
      const ex = match ? JSON.parse(match[0]) : {};

      return buildResult(ex, conversation.state);
    } catch (err) {
      console.error('[SMS Agent] OpenAI error:', err);
    }
  }

  // ── Fallback (no API key) ─────────────────────────────────────────────────
  return buildFallback(conversation, newMessage, businessName);
}

function buildResult(ex: Record<string, unknown>, currentState: SmsConversationState): AgentResult {
  const nextState = (ex.nextState as SmsConversationState) || currentState;

  // Hard guard: AI cannot create a job unless it reaches 'confirmed' state.
  // Also prevent illegal state jumps — only allow 1-step transitions.
  const ALLOWED: Record<SmsConversationState, SmsConversationState[]> = {
    gathering:      ['gathering', 'pending_review'],
    pending_review: ['pending_review'],
    sent_estimate:  ['sent_estimate', 'scheduling', 'gathering'],
    scheduling:     ['scheduling', 'confirmed'],
    confirmed:      ['closed'],
    closed:         ['gathering'],
  };
  const safeNext = (ALLOWED[currentState] ?? [currentState]).includes(nextState)
    ? nextState
    : currentState;

  return {
    replyToCustomer: (ex.replyToCustomer as string) || null,
    nextState: safeNext,
    updatedConversation: {
      state: safeNext,
      customerName: (ex.customerName as string) || undefined,
      problemDescription: (ex.problemDescription as string) || undefined,
      address: (ex.address as string) || undefined,
      urgency: (ex.urgency as string) || undefined,
      preferredDate: (ex.preferredDate as string) || undefined,
    },
    draftEstimate: safeNext === 'pending_review' ? (ex.draftEstimate as SmsDraftEstimate | undefined) : undefined,
    shouldCreateJob: safeNext === 'confirmed',  // enforced — ignores AI's value
    jobTitle: (ex.problemDescription as string) || undefined,
    customerName: (ex.customerName as string) || undefined,
    address: (ex.address as string) || undefined,
    urgency: (ex.urgency as string) || undefined,
    preferredDate: (ex.preferredDate as string) || undefined,
  };
}

function buildFallback(conversation: SmsConversation, message: string, biz: string): AgentResult {
  const lower = message.toLowerCase();
  const isFirstMessage = conversation.messages.length === 0;

  if (isFirstMessage) {
    return {
      replyToCustomer: `Hi! Thanks for reaching out to ${biz}. We'd love to help! Could you tell us a bit more about the issue and share your address so we can schedule a visit? – ${biz}`,
      nextState: 'gathering',
      updatedConversation: { state: 'gathering', problemDescription: message },
      shouldCreateJob: false,
      urgency: lower.includes('emergency') || lower.includes('flood') ? 'emergency'
              : lower.includes('leak') || lower.includes('asap') ? 'high' : 'medium',
    };
  }

  return {
    replyToCustomer: `Thanks for the update! Our team will be in touch shortly to confirm the details. – ${biz}`,
    nextState: conversation.state,
    updatedConversation: {},
    shouldCreateJob: false,
  };
}

// ─── Format estimate for sending to customer ─────────────────────────────────

export function formatEstimateMessage(
  estimate: SmsDraftEstimate,
  customerName: string | undefined,
  businessName: string,
): string {
  const name = customerName ? `, ${customerName.split(' ')[0]}` : '';
  const itemLines = estimate.items
    .map(i => `• ${i.label}: $${(i.amount * (i.quantity || 1)).toFixed(0)}`)
    .join('\n');

  return `Hi${name}! Here's our estimate for your ${estimate.category} service:\n\n${itemLines}\n\nTotal: $${estimate.total.toFixed(0)}\n${estimate.notes ? `\n${estimate.notes}\n` : ''}\nReply YES to schedule or ask any questions. – ${businessName}`;
}
