import { NextRequest, NextResponse } from 'next/server';

interface CustomerCtx { id: string; name: string; email: string; phone: string; }
interface JobCtx { id: string; title: string; customer: string; status: string; date: string; amount: number; notes: string; }

const SYSTEM = `You are an AI assistant for a home service CRM app called JobPilot.
The user speaks a voice command in any language.

RESPOND ONLY with valid JSON, no markdown, no explanation.

CRITICAL LANGUAGE RULE:
- The context includes a "Language" hint (e.g. "zh", "es", "fr") indicating the user's chosen language.
- The "message" field MUST be written in THAT language, not English.
- If Language=zh → message in Chinese (简体中文). If Language=es → message in Spanish. If Language=fr → message in French. Etc.
- Default to English ONLY when Language=en or language is unknown.
- Examples:
  Language=zh, command="查找客户" → message: "找到以下客户："
  Language=es, command="buscar trabajo" → message: "Trabajos encontrados:"
  Language=ko, command="고객 찾기" → message: "고객을 찾았습니다:"
NEVER default to English when a non-English language code is provided.

Actions:
SEARCH & NAVIGATION:
1. search_customers - list matching customers by search term
2. search_jobs - list matching jobs by search term or status
3. open_customer - open a specific customer profile (user says open/show/view/go to [name])
4. open_job - open a specific job record
5. navigate - go to a page (customers, jobs, invoices, schedule, dashboard/home)

TECHNICIAN ACTIONS (for on-site use):
6. update_job_status - change job status (extract current job context from nearby actions, options: "on-site", "done")
7. add_note - add a note to a specific job (extract note text and job target)
8. request_price_approval - request/confirm customer price approval (extract price amount and job)
9. mark_job_done - complete job and optionally generate invoice
10. attach_photo - open a job and attach a photo (user says "take photo", "attach photo for [job]")

FALLBACK:
11. info - general question or fallback

JSON format:
{
  "action": "search_customers" | "search_jobs" | "open_customer" | "open_job" | "update_job_status" | "add_note" | "request_price_approval" | "mark_job_done" | "attach_photo" | "navigate" | "info",
  "query": "search term for search_* | note text for add_note | status/amount for update_job_status/request_price_approval | page name for navigate",
  "targetName": "specific customer or job name (for open_*, add_note, *_job_status actions)",
  "priceAmount": "extracted price amount (for request_price_approval, e.g., '450' or '450.00')",
  "message": "MUST be in the same language the user spoke — never default to English"
}`;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { transcript, lang, customers, jobs } = body as {
    transcript: string;
    lang: string;
    customers: CustomerCtx[];
    jobs: JobCtx[];
  };

  const apiKey = process.env.OPENAI_API_KEY;
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

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 512,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: context },
        ],
      }),
    });

    const aiJson = await aiRes.json();
    const text = aiJson.choices?.[0]?.message?.content ?? '{}';
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

    if (action === 'update_job_status') {
      const name = (targetName || query || '').toLowerCase();
      const status = (query || 'on-site').toLowerCase();
      const found = jobs.find(j => j.title.toLowerCase().includes(name))
        ?? jobs.find(j => j.customer.toLowerCase().includes(name));
      if (found) {
        return NextResponse.json({
          type: 'update_job_status',
          jobId: found.id,
          jobTitle: found.title,
          newStatus: status.includes('done') ? 'done' : 'on-site',
          message: message || `Updated job status`,
        });
      }
      return NextResponse.json({ type: 'info', message: `Job not found: ${targetName || query}` });
    }

    if (action === 'request_price_approval') {
      const name = (targetName || '').toLowerCase();
      const priceStr = query || '';
      let jobId: string | undefined;
      let jobTitle: string | undefined;
      if (name) {
        const found = jobs.find(j => j.title.toLowerCase().includes(name))
          ?? jobs.find(j => j.customer.toLowerCase().includes(name));
        if (found) { jobId = found.id; jobTitle = found.title; }
      }
      return NextResponse.json({
        type: 'request_price_approval',
        jobId,
        jobTitle,
        approvedPrice: parseFloat(priceStr) || undefined,
        message: message || (jobTitle ? `Price confirmed for ${jobTitle}` : 'Price recorded'),
      });
    }

    if (action === 'mark_job_done') {
      const name = (targetName || query || '').toLowerCase();
      const found = jobs.find(j => j.title.toLowerCase().includes(name))
        ?? jobs.find(j => j.customer.toLowerCase().includes(name));
      if (found) {
        return NextResponse.json({
          type: 'mark_job_done',
          jobId: found.id,
          jobTitle: found.title,
          message: message || `Job marked complete`,
        });
      }
      return NextResponse.json({ type: 'info', message: `Job not found: ${targetName || query}` });
    }

    if (action === 'attach_photo') {
      const name = (targetName || query || '').toLowerCase();
      let jobId: string | undefined;
      let jobTitle: string | undefined;
      if (name) {
        const found = jobs.find(j => j.title.toLowerCase().includes(name))
          ?? jobs.find(j => j.customer.toLowerCase().includes(name));
        if (found) { jobId = found.id; jobTitle = found.title; }
      }
      return NextResponse.json({
        type: 'attach_photo',
        jobId,
        jobTitle,
        message: message || (jobTitle ? `Opening ${jobTitle} — tap camera to attach photo` : 'Open a job to attach a photo'),
      });
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
