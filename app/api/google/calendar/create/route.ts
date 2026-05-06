import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthenticatedClient } from '@/lib/google';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

function parseTime24(timeStr: string): string {
  // Convert "09:00 AM" or "14:30" to "09:00" or "14:30"
  const match = timeStr.match(/(\d+):(\d+)(?:\s*(AM|PM))?/i);
  if (!match) return '09:00';

  let hour = parseInt(match[1]);
  const min = match[2];
  const period = match[3]?.toUpperCase();

  if (period === 'PM' && hour !== 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;

  return `${hour.toString().padStart(2, '0')}:${min}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, job, syncToGoogle } = body;

    if (!syncToGoogle || !userId || !job) {
      return NextResponse.json({ success: false });
    }

    const supabase = getSupabaseAdmin();
    const { data: tokenData } = await supabase
      .from('user_google_tokens')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!tokenData) {
      return NextResponse.json({ error: 'Not connected to Google' }, { status: 401 });
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

    const startTime24 = parseTime24(job.time);
    const startDateTime = `${job.date}T${startTime24}:00`;

    // End time: 1 hour after start
    const startDate = new Date(`${startDateTime}`);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    const endDateTime = endDate.toISOString().slice(0, 19);

    const event = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: `[FieldPro] ${job.title} - ${job.customer}`,
        description: job.notes || `Service appointment for ${job.customer}`,
        location: job.address,
        start: {
          dateTime: `${startDateTime}`,
          timeZone: 'America/Los_Angeles',
        },
        end: {
          dateTime: `${endDateTime}`,
          timeZone: 'America/Los_Angeles',
        },
        colorId: '1', // Blue
      },
    });

    return NextResponse.json({
      success: true,
      eventId: event.data.id,
      eventLink: event.data.htmlLink,
    });
  } catch (err) {
    console.error('Calendar create error:', err);
    return NextResponse.json({ error: 'Failed to create calendar event' }, { status: 500 });
  }
}
