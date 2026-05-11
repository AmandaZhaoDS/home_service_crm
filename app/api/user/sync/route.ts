import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/user/sync
 * Server-side read of a user's profile + CRM data using the admin client,
 * which bypasses RLS entirely. This avoids the auth-init timing issue where
 * the anon client's auth.uid() is not yet set when fetchUserRecord runs on
 * page load.
 *
 * Authorization: Bearer <supabase-access-token>
 */
export async function GET(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseAdmin();

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const [{ data: profile }, { data: crmRow }, { data: phoneRow }] = await Promise.all([
    supabase.from('profiles').select('name').eq('id', user.id).single(),
    supabase.from('user_crm_data').select('data').eq('user_id', user.id).single(),
    supabase.from('twilio_numbers').select('phone_number').eq('user_id', user.id).maybeSingle(),
  ]);

  return NextResponse.json(
    {
      name: profile?.name ?? user.email!.split('@')[0],
      crmData: crmRow?.data ?? null,
      smsPhone: phoneRow?.phone_number ?? null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
