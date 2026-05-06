import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createOAuth2Client } from '@/lib/google';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (error) {
    return NextResponse.redirect(`${appUrl}/schedule?google_error=${error}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/schedule?google_error=invalid_callback`);
  }

  const cookieStore = await cookies();
  const savedCookie = cookieStore.get('google_oauth')?.value;

  if (!savedCookie) {
    return NextResponse.redirect(`${appUrl}/schedule?google_error=session_expired`);
  }

  let savedState: { state: string; userId: string };
  try {
    savedState = JSON.parse(savedCookie);
  } catch {
    return NextResponse.redirect(`${appUrl}/schedule?google_error=invalid_session`);
  }

  if (savedState.state !== state) {
    return NextResponse.redirect(`${appUrl}/schedule?google_error=state_mismatch`);
  }

  // Clear the cookie
  cookieStore.delete('google_oauth');

  try {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    const supabase = getSupabaseAdmin();
    await supabase.from('user_google_tokens').upsert({
      user_id: savedState.userId,
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token ?? null,
      token_type: tokens.token_type ?? 'Bearer',
      expiry_date: tokens.expiry_date ?? null,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.redirect(`${appUrl}/schedule?google_connected=true`);
  } catch (err) {
    console.error('Token exchange error:', err);
    return NextResponse.redirect(`${appUrl}/schedule?google_error=token_exchange_failed`);
  }
}
