import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ connected: false });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('user_google_tokens')
      .select('user_id')
      .eq('user_id', userId)
      .single();

    return NextResponse.json({ connected: !!data });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
