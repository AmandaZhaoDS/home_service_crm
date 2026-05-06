# Google Integration Setup Guide

## Step 1: Create Google Cloud Project & OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable APIs:
   - Go to "APIs & Services" → "Library"
   - Search for and enable:
     - **Google Calendar API**
     - **Google People API** (for Contacts)

4. Create OAuth 2.0 Credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth 2.0 Client ID"
   - Choose "Web application"
   - Add authorized redirect URI:
     - Development: `http://localhost:3000/api/google/callback`
     - Production: `https://your-app-domain.vercel.app/api/google/callback` (use your actual Vercel domain)
   - Copy your **Client ID** and **Client Secret**

## Step 2: Set Environment Variables

Add these to your Vercel project Settings → Environment Variables:

```
GOOGLE_CLIENT_ID=your-client-id-from-above
GOOGLE_CLIENT_SECRET=your-client-secret-from-above
NEXT_PUBLIC_APP_URL=https://your-app-domain.vercel.app
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

For **SUPABASE_SERVICE_ROLE_KEY**:
- Go to Supabase Dashboard → Settings → API
- Copy the **Service Role Secret** (keep this secret!)

For **NEXT_PUBLIC_APP_URL**:
- Use `http://localhost:3000` for local development
- Use your Vercel deployment URL for production (e.g., `https://home-service-crm-five.vercel.app`)

## Step 3: Create Database Table

Run this SQL in Supabase SQL Editor:

```sql
-- Create table for storing Google OAuth tokens
CREATE TABLE user_google_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text,
  token_type text DEFAULT 'Bearer',
  expiry_date bigint,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE user_google_tokens ENABLE ROW LEVEL SECURITY;

-- Grant permissions to authenticated users and service role
GRANT SELECT, INSERT, UPDATE, DELETE ON user_google_tokens TO authenticated;
GRANT ALL ON user_google_tokens TO service_role;

-- Create RLS policy for authenticated users
CREATE POLICY "Users can manage their own Google tokens"
ON user_google_tokens
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

## Step 4: Local Testing

1. Set up `.env.local` with your Google credentials:

```bash
# .env.local (local development only)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

2. Run the app:
```bash
npm run dev
```

3. Test the flow:
   - Register a new account
   - After registration, click "Connect Google"
   - Grant the requested permissions
   - You should see the Google Calendar integration on the Schedule page

## Features Enabled

### 1. During Registration
- After signing up, users see a "Connect Google" step
- Can import Google Contacts as potential customers
- Can enable calendar sync

### 2. Import Google Contacts
- Click "📇 Import Contacts" on Schedule page (after connecting Google)
- Select which contacts to import as potential customers
- Imported contacts appear in the Customers list

### 3. Calendar Sync
- When creating a new appointment, checkbox to "Sync to Google Calendar" appears
- Appointments automatically appear in the user's Google Calendar
- Google Calendar events appear in the Schedule view (read-only)

### 4. Security
- OAuth tokens stored encrypted in Supabase
- Service Role Key never exposed to client (server-side only)
- Row Level Security ensures users only access their own tokens
- Token refresh handled automatically

## Troubleshooting

### "Failed to fetch contacts" or "401 Not connected"
- Make sure the `user_google_tokens` table was created with RLS policies
- Check that SUPABASE_SERVICE_ROLE_KEY is set correctly

### Callback shows "state_mismatch"
- Make sure redirect URI in Google Cloud Console matches exactly
- Check URL includes `/api/google/callback`

### "Token exchange failed"
- Verify GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are correct
- Make sure Google APIs are enabled in Cloud Console

### Calendar events don't appear
- User must first click "Connect Google" on Schedule page
- May need to refresh the page after connecting
- Check browser console for errors

## Production Deployment

1. Update `.env.local` with production values:
   ```bash
   NEXT_PUBLIC_APP_URL=https://your-vercel-domain.vercel.app
   ```

2. Update Google Cloud Console:
   - Add production redirect URI: `https://your-vercel-domain.vercel.app/api/google/callback`

3. Deploy to Vercel:
   ```bash
   git add .
   git commit -m "feat: add Google Calendar and Contacts integration"
   git push origin develop
   ```

4. Vercel automatically deploys and uses environment variables from project settings

## API Endpoints

- `GET /api/google/auth?userId=<id>` - Initiate OAuth flow
- `GET /api/google/callback` - OAuth callback (automatic)
- `GET /api/google/status?userId=<id>` - Check connection status
- `GET /api/google/contacts?userId=<id>` - Fetch Google Contacts
- `GET /api/google/calendar/events?userId=<id>` - Fetch Google Calendar events
- `POST /api/google/calendar/create` - Create event in Google Calendar
- `DELETE /api/google/disconnect` - Disconnect Google account
