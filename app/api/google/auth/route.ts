import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createOAuth2Client, GOOGLE_SCOPES } from '@/lib/google';

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const returnTo = request.nextUrl.searchParams.get('returnTo') ?? '/schedule';
  const state = crypto.randomUUID();
  const cookieStore = await cookies();

  // Store state, userId and returnTo in httpOnly cookie for verification in callback
  cookieStore.set('google_oauth', JSON.stringify({ state, userId, returnTo }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600, // 10 minutes
    path: '/',
    sameSite: 'lax',
  });

  const oauth2Client = createOAuth2Client();
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GOOGLE_SCOPES,
    state,
    prompt: 'consent',
  });

  return NextResponse.redirect(authUrl);
}
