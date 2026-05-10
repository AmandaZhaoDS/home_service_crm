import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/sms/send
 * Send SMS message via Twilio
 * Can be called from other API endpoints or scheduled tasks
 */
export async function POST(request: NextRequest) {
  try {
    const { to, message, internalCall } = await request.json();

    if (!to || !message) {
      return NextResponse.json(
        { error: 'Missing "to" or "message" field' },
        { status: 400 }
      );
    }

    // Validate environment variables
    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      console.error('Missing Twilio environment variables');
      return NextResponse.json(
        { error: 'SMS service not configured' },
        { status: 500 }
      );
    }

    // Twilio API endpoint
    const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;

    // Create form data for Twilio
    const formData = new URLSearchParams();
    formData.append('From', twilioPhoneNumber);
    formData.append('To', to);
    formData.append('Body', message);

    // Make request to Twilio API
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Twilio error:', result);
      return NextResponse.json(
        {
          error: 'Failed to send SMS',
          details: result.message || 'Unknown error',
        },
        { status: response.status }
      );
    }

    console.log(`[SMS] Sent to ${to}. SID: ${result.sid}`);

    return NextResponse.json(
      {
        success: true,
        messageSid: result.sid,
        to: result.to,
        status: result.status,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error sending SMS:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
