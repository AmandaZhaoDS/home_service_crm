import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function DELETE(request: NextRequest) {
  const { userId } = await request.json();
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('user_google_tokens').delete().eq('user_id', userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Disconnect error:', err);
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
  }
}
