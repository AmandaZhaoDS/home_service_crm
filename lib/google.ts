import { google } from 'googleapis';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/calendar',
];

export function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/google/callback`,
  );
}

export function getAuthenticatedClient(tokens: {
  access_token: string;
  refresh_token?: string | null;
  expiry_date?: number | null;
}) {
  const client = createOAuth2Client();
  client.setCredentials(tokens);
  return client;
}
