import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthenticatedClient } from '@/lib/google';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ events: [] });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: tokenData } = await supabase
      .from('user_google_tokens')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!tokenData) {
      return NextResponse.json({ events: [] });
    }

    const oauth2Client = getAuthenticatedClient({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expiry_date: tokenData.expiry_date,
    });

    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        await supabase.from('user_google_tokens').update({
          access_token: tokens.access_token,
          expiry_date: tokens.expiry_date ?? null,
          updated_at: new Date().toISOString(),
        }).eq('user_id', userId);
      }
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const now = new Date();
    const timeMin = new Date(now);
    timeMin.setDate(timeMin.getDate() - 7);
    const timeMax = new Date(now);
    timeMax.setDate(timeMax.getDate() + 30);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100,
    });

    const events = (response.data.items ?? []).map(event => ({
      id: event.id ?? '',
      title: event.summary ?? '(No Title)',
      start: event.start?.dateTime ?? event.start?.date ?? '',
      end: event.end?.dateTime ?? event.end?.date ?? '',
      description: event.description ?? '',
      location: event.location ?? '',
      htmlLink: event.htmlLink ?? '',
    }));

    return NextResponse.json({ events });
  } catch (err) {
    console.error('Calendar events fetch error:', err);
    return NextResponse.json({ events: [] });
  }
}
