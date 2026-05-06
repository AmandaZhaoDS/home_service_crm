import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthenticatedClient } from '@/lib/google';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: tokenData, error } = await supabase
      .from('user_google_tokens')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !tokenData) {
      return NextResponse.json({ error: 'Not connected to Google' }, { status: 401 });
    }

    const oauth2Client = getAuthenticatedClient({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expiry_date: tokenData.expiry_date,
    });

    // Handle token refresh
    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        await supabase.from('user_google_tokens').update({
          access_token: tokens.access_token,
          expiry_date: tokens.expiry_date ?? null,
          updated_at: new Date().toISOString(),
        }).eq('user_id', userId);
      }
    });

    const people = google.people({ version: 'v1', auth: oauth2Client });
    const response = await people.people.connections.list({
      resourceName: 'people/me',
      pageSize: 200,
      personFields: 'names,emailAddresses,phoneNumbers,addresses',
    });

    const contacts = (response.data.connections ?? [])
      .map(person => ({
        id: person.resourceName ?? '',
        name: person.names?.[0]?.displayName ?? '',
        email: person.emailAddresses?.[0]?.value ?? '',
        phone: person.phoneNumbers?.[0]?.value ?? '',
        address: person.addresses?.[0]?.formattedValue ?? '',
      }))
      .filter(c => c.name);

    return NextResponse.json({ contacts });
  } catch (err) {
    console.error('Contacts fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 });
  }
}
