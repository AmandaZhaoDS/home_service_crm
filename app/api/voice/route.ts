import { NextRequest, NextResponse } from 'next/server';

interface CustomerCtx { id: string; name: string; email: string; phone: string; }
interface JobCtx { id: string; title: string; customer: string; status: string; date: string; amount: number; notes: string; }

const SYSTEM = `You are an AI assistant for a home service CRM app called FieldPro Jobs.
The user speaks a voice command (in any language) and you must parse the intent.

RESPOND ONLY with valid JSON, no markdown, no explanation.

Actions:
1. search_customers - list matching customers by search term
2. search_jobs - list matching jobs by search term or status
3. open_customer - open a specific customer profile (user says "open/show/view/go to [name]")
4. open_job - open a specific job record (user says "open/show/view [job name]")
5. add_note - add a note to a specific job (extract note text and job target)
6. navigate - go to a page (customers, jobs, invoices, schedule, dashboard/home)
7. info - general question or fallback

JSON format:
{
  "action": "search_customers" | "search_jobs" | "open_customer" | "open_job" | "add_note" | "navigate" | "info",
  "query": "search term for search_* actions | note text for add_note | page name for navigate",
  "targetName": "specific customer or job name (required for open_customer, open_job, add_note)",
  "message": "brief response in same language as user input"
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
Customers (${customers.length} total):
${customers.slice(0, 50).map(c => `[${c.id}] ${c.name} | ${c.email} | ${c.phone}`).join('\n')}

Jobs (${jobs.length} total):
${jobs.slice(0, 50).map(j => `[${j.id}] [${j.status}] ${j.title} | ${j.customer} | $${j.amount}`).join('\n')}

Language: ${lang}
Voice command: "${transcript}"`;

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
    let parsed: { action: string; query: string; targetName?: string; message: string };
    try { parsed = JSON.parse(text); } catch { return NextResponse.json(clientSearch(transcript, customers, jobs)); }

    const { action, query, targetName, message } = parsed;

    if (action === 'search_customers') {
      const q = (query || '').toLowerCase();
      const matched = customers.filter(c =>
        c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.phone.includes(q)
      ).slice(0, 5);
      return NextResponse.json({ type: 'customers', message, customers: matched });
    }

    if (action === 'search_jobs') {
      const q = (query || '').toLowerCase();
      const matched = jobs.filter(j =>
        j.title.toLowerCase().includes(q) || j.customer.toLowerCase().includes(q) || j.status.toLowerCase().includes(q)
      ).slice(0, 5);
      return NextResponse.json({ type: 'jobs', message, jobs: matched });
    }

    if (action === 'open_customer') {
      const name = (targetName || query || '').toLowerCase();
      const found = customers.find(c => c.name.toLowerCase().includes(name))
        ?? customers.find(c => name.split(' ').some(w => w.length > 1 && c.name.toLowerCase().includes(w)));
      if (found) return NextResponse.json({ type: 'open_customer', customerId: found.id, customerName: found.name, message: message || `Opening ${found.name}` });
      return NextResponse.json({ type: 'info', message: `Customer not found: ${targetName || query}` });
    }

    if (action === 'open_job') {
      const name = (targetName || query || '').toLowerCase();
      const found = jobs.find(j => j.title.toLowerCase().includes(name))
        ?? jobs.find(j => name.split(' ').some(w => w.length > 1 && j.title.toLowerCase().includes(w)));
      if (found) return NextResponse.json({ type: 'open_job', jobId: found.id, jobTitle: found.title, message: message || `Opening ${found.title}` });
      return NextResponse.json({ type: 'info', message: `Job not found: ${targetName || query}` });
    }

    if (action === 'add_note') {
      const name = (targetName || '').toLowerCase();
      const note = query || '';
      let jobId: string | undefined;
      let jobTitle: string | undefined;
      if (name) {
        const found = jobs.find(j => j.title.toLowerCase().includes(name))
          ?? jobs.find(j => j.customer.toLowerCase().includes(name));
        if (found) { jobId = found.id; jobTitle = found.title; }
      }
      return NextResponse.json({ type: 'add_note', jobId, jobTitle, note, message: message || (jobTitle ? `Adding note to ${jobTitle}` : 'Note ready') });
    }

    if (action === 'navigate') {
      const dest = (query || '').toLowerCase();
      const pathMap: Record<string, string> = {
        dashboard: '/', home: '/', main: '/',
        customers: '/customers', customer: '/customers', contacts: '/customers',
        jobs: '/jobs', job: '/jobs', work: '/jobs',
        invoices: '/invoices', invoice: '/invoices', billing: '/invoices',
        schedule: '/schedule', calendar: '/schedule',
      };
      const path = Object.entries(pathMap).find(([k]) => dest.includes(k))?.[1] ?? '/';
      return NextResponse.json({ type: 'navigate', path, message: message || `Navigating...` });
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
