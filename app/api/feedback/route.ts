import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/*
 * Run this SQL once in Supabase to create the feedback_reports table:
 *
 * CREATE TABLE IF NOT EXISTS feedback_reports (
 *   id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
 *   user_id      text,
 *   user_email   text,
 *   description  text,
 *   screenshot   text,
 *   page_url     text,
 *   browser_info text,
 *   created_at   timestamptz DEFAULT now(),
 *   status       text        DEFAULT 'open' CHECK (status IN ('open','in_progress','done')),
 *   claimed_by   text,
 *   claimed_at   timestamptz,
 *   resolved_at  timestamptz
 * );
 * ALTER TABLE feedback_reports ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "service role full access" ON feedback_reports USING (true) WITH CHECK (true);
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, userEmail, description, screenshot, pageUrl, browserInfo } = body;

    if (!description?.trim() && !screenshot) {
      return NextResponse.json({ error: 'Need at least a description or screenshot' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('feedback_reports')
      .insert({
        user_id:      userId ?? null,
        user_email:   userEmail ?? null,
        description:  description?.trim() ?? '',
        screenshot:   screenshot ?? null,
        page_url:     pageUrl ?? null,
        browser_info: browserInfo ?? null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[Feedback] Insert failed:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    console.error('[Feedback] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('feedback_reports')
      .select('id, user_id, user_email, description, screenshot, page_url, created_at, status, claimed_by, claimed_at, resolved_at')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('[Feedback] GET error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { reports: data ?? [] },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('[Feedback] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
