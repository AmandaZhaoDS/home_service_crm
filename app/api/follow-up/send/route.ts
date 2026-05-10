import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function sendSMS(to: string, message: string, origin: string) {
  try {
    await fetch(`${origin}/api/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, message }),
    });
  } catch {
    console.warn(`[follow-up] SMS to ${to} failed`);
  }
}

/**
 * POST /api/follow-up/send
 * Send automated follow-up messages:
 *  - "unpaid_invoices": remind customers with overdue invoices
 *  - "post_completion": request a review from recently completed jobs
 *  - "all": run both
 */
export async function POST(req: NextRequest) {
  const body = await req.json() as { userId: string; type?: 'unpaid_invoices' | 'post_completion' | 'all' };
  const { userId, type = 'all' } = body;

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: userData, error } = await supabase
    .from('user_crm_data')
    .select('data')
    .eq('user_id', userId)
    .single();

  if (error || !userData?.data) {
    return NextResponse.json({ error: 'User data not found' }, { status: 404 });
  }

  const crmData = userData.data as {
    invoices: Array<{ id: string; customer: string; amount: number; status: string; dueDate: string; jobTitle: string }>;
    jobs: Array<{ id: string; customer: string; title: string; status: string; date: string; amount: number }>;
    customers: Array<{ id: string; name: string; phone: string }>;
  };

  const today = localDateStr();
  const origin = req.nextUrl.origin;
  const sent: string[] = [];
  const skipped: string[] = [];

  // Helper to look up customer phone
  const getPhone = (customerName: string) =>
    crmData.customers.find(c => c.name === customerName)?.phone ?? '';

  // ── Overdue invoice reminders ─────────────────────────────────────────────
  if (type === 'unpaid_invoices' || type === 'all') {
    const overdue = crmData.invoices.filter(
      inv => (inv.status === 'sent' || inv.status === 'draft') && inv.dueDate < today
    );

    for (const inv of overdue) {
      const phone = getPhone(inv.customer);
      if (!phone) { skipped.push(`invoice:${inv.id} (no phone)`); continue; }

      const msg = `Hi ${inv.customer.split(' ')[0]}, this is a reminder that invoice #${inv.id.slice(-6).toUpperCase()} for ${inv.jobTitle} ($${inv.amount.toFixed(2)}) was due on ${inv.dueDate}. Please reply or call us to settle. Thank you!`;
      await sendSMS(phone, msg, origin);
      sent.push(`invoice:${inv.id} → ${phone}`);
    }
  }

  // ── Post-completion review requests ───────────────────────────────────────
  if (type === 'post_completion' || type === 'all') {
    const threeDaysAgo = localDateStr(new Date(Date.now() - 3 * 86400000));
    const sevenDaysAgo = localDateStr(new Date(Date.now() - 7 * 86400000));

    const recentlyDone = crmData.jobs.filter(
      j =>
        (j.status === 'done' || j.status === 'paid') &&
        j.date >= sevenDaysAgo &&
        j.date <= threeDaysAgo
    );

    for (const job of recentlyDone) {
      const phone = getPhone(job.customer);
      if (!phone) { skipped.push(`job:${job.id} (no phone)`); continue; }

      const msg = `Hi ${job.customer.split(' ')[0]}, thank you for choosing us for your recent ${job.title}! We'd love your feedback. A quick Google review helps us a lot — just search "[Your Business Name]" and leave a review. Thanks!`;
      await sendSMS(phone, msg, origin);
      sent.push(`job:${job.id} → ${phone}`);
    }
  }

  return NextResponse.json({
    success: true,
    sent: sent.length,
    skipped: skipped.length,
    details: { sent, skipped },
  });
}
