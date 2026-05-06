import { NextRequest, NextResponse } from 'next/server';

interface CustomerCtx { id: string; name: string; email: string; phone: string; }
interface JobCtx { id: string; title: string; customer: string; status: string; date: string; amount: number; notes: string; }

const SYSTEM = `You are an AI assistant for a home service CRM app called FieldPro Jobs.
The user speaks a voice command (in any language) and you must parse the intent and search the provided data.

RESPOND ONLY with valid JSON, no markdown, no explanation.

Actions you can take:
1. search_customers - when user wants to find/search customers
2. search_jobs - when user wants to find/search jobs or work orders
3. add_note - when user wants to add a note (extract the note text)
4. info - for general info or navigation requests

JSON format:
{
  "action": "search_customers" | "search_jobs" | "add_note" | "info",
  "query": "extracted search term or note text",
  "message": "brief response message in same language as user's input"
}`;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { transcript, lang, customers, jobs } = body as {
    transcript: string;
    lang: string;
    customers: CustomerCtx[];
    jobs: JobCtx[];
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(clientSearch(transcript, customers, jobs));
  }

  try {
    const context = `
Customers in system (${customers.length} total):
${customers.slice(0, 50).map(c => `- ${c.name} | ${c.email} | ${c.phone}`).join('\n')}

Jobs in system (${jobs.length} total):
${jobs.slice(0, 50).map(j => `- [${j.status}] ${j.title} | Customer: ${j.customer} | $${j.amount}`).join('\n')}

User language code: ${lang}
User voice command: "${transcript}"`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: SYSTEM,
        messages: [{ role: 'user', content: context }],
      }),
    });

    const aiJson = await aiRes.json();
    const text = aiJson.content?.[0]?.text ?? '{}';
    let parsed: { action: string; query: string; message: string };
    try { parsed = JSON.parse(text); } catch { return NextResponse.json(clientSearch(transcript, customers, jobs)); }

    const { action, query, message } = parsed;

    if (action === 'search_customers') {
      const q = query.toLowerCase();
      const matched = customers.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.includes(q)
      ).slice(0, 5);
      return NextResponse.json({ type: 'customers', message, customers: matched });
    }

    if (action === 'search_jobs') {
      const q = query.toLowerCase();
      const matched = jobs.filter(j =>
        j.title.toLowerCase().includes(q) ||
        j.customer.toLowerCase().includes(q) ||
        j.status.toLowerCase().includes(q)
      ).slice(0, 5);
      return NextResponse.json({ type: 'jobs', message, jobs: matched });
    }

    if (action === 'add_note') {
      return NextResponse.json({ type: 'note', message, noteAdded: query });
    }

    return NextResponse.json({ type: 'info', message: message || transcript });

  } catch {
    return NextResponse.json(clientSearch(transcript, customers, jobs));
  }
}

function clientSearch(transcript: string, customers: CustomerCtx[], jobs: JobCtx[]) {
  const q = transcript.toLowerCase();
  const custKeywords = ['customer','client','contact','顾客','客户','cliente','клиент','顧客','고객','عميل'];
  const jobKeywords = ['job','work','task','order','工单','作业','工作','trabajo','tâche','aufgabe','lavoro','مهمة','작업'];

  const isCustomer = custKeywords.some(k => q.includes(k));
  const isJob = jobKeywords.some(k => q.includes(k));

  const words = transcript.split(/\s+/).filter(w => w.length > 1);

  if (isJob || (!isCustomer && q.length > 3)) {
    const matched = jobs.filter(j =>
      words.some(w => j.title.toLowerCase().includes(w.toLowerCase()) || j.customer.toLowerCase().includes(w.toLowerCase()))
    ).slice(0, 5);
    if (matched.length) return { type: 'jobs', message: '', jobs: matched };
  }

  const matched = customers.filter(c =>
    words.some(w => c.name.toLowerCase().includes(w.toLowerCase()) || c.email.toLowerCase().includes(w.toLowerCase()))
  ).slice(0, 5);
  if (matched.length) return { type: 'customers', message: '', customers: matched };

  const matchedJobs = jobs.filter(j =>
    words.some(w => j.title.toLowerCase().includes(w.toLowerCase()))
  ).slice(0, 5);
  if (matchedJobs.length) return { type: 'jobs', message: '', jobs: matchedJobs };

  return { type: 'info', message: transcript };
}
