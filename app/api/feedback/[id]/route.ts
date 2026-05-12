import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/** PATCH /api/feedback/[id]  — claim or update status */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { claimedBy, status } = await request.json() as {
      claimedBy?: string;
      status?: 'open' | 'in_progress' | 'done';
    };

    const updates: Record<string, string | null> = {};

    if (claimedBy !== undefined) {
      updates.claimed_by = claimedBy || null;
      updates.claimed_at = claimedBy ? new Date().toISOString() : null;
      updates.status     = 'in_progress';
    }

    if (status) {
      updates.status = status;
      if (status === 'done')  updates.resolved_at = new Date().toISOString();
      if (status === 'open')  { updates.claimed_by = null; updates.claimed_at = null; updates.resolved_at = null; }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('feedback_reports')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('[Feedback PATCH] error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Feedback PATCH] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
