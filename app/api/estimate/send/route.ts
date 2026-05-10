import { NextRequest, NextResponse } from 'next/server';
import { formatEstimateAsSMS, EstimateLineItem } from '@/lib/estimateTemplates';

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    jobTitle: string;
    customerName: string;
    customerPhone: string;
    items: EstimateLineItem[];
    notes?: string;
    businessName?: string;
  };

  const { jobTitle, customerName, customerPhone, items, notes, businessName } = body;

  if (!customerPhone || !jobTitle) {
    return NextResponse.json({ error: 'Missing customerPhone or jobTitle' }, { status: 400 });
  }

  const message = formatEstimateAsSMS({ jobTitle, customerName, items, notes, businessName });

  try {
    const sendRes = await fetch(new URL('/api/sms/send', req.nextUrl.origin).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: customerPhone, message }),
    });

    if (!sendRes.ok) {
      const err = await sendRes.json();
      return NextResponse.json({ error: err.error ?? 'SMS send failed' }, { status: sendRes.status });
    }

    return NextResponse.json({ success: true, message });
  } catch (err) {
    console.error('[estimate/send]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
