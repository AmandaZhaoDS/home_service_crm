import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sms/debug        — config check, webhook URLs, diagnosis
 * POST /api/sms/debug       — { to: "+1XXX", message?: "..." } → real test SMS
 * PUT /api/sms/debug        — auto-fix: sets Messaging Service inbound URL + phone number webhooks
 */
export async function GET(request: NextRequest) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;

  // ?msgSid=SMxxx — check a specific message's delivery status + error code
  const msgSid = request.nextUrl.searchParams.get('msgSid');
  if (msgSid) {
    if (!accountSid || !authToken) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });
    }
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const r = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${msgSid}.json`,
      { headers: { Authorization: `Basic ${auth}` } },
    );
    const d = await r.json();
    return NextResponse.json({
      sid: d.sid,
      status: d.status,
      to: d.to,
      from: d.from,
      errorCode: d.error_code,
      errorMessage: d.error_message,
      dateSent: d.date_sent,
      dateUpdated: d.date_updated,
      direction: d.direction,
      numSegments: d.num_segments,
    });
  }

  const msgSvcSid  = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const phoneNum   = process.env.TWILIO_PHONE_NUMBER;
  const defaultUid = process.env.DEFAULT_SMS_USER_ID;
  const openaiKey  = process.env.OPENAI_API_KEY;

  const envCheck = {
    TWILIO_ACCOUNT_SID:          accountSid  ? `${accountSid.slice(0, 8)}…`  : '❌ MISSING',
    TWILIO_AUTH_TOKEN:           authToken   ? `${authToken.slice(0, 6)}…`   : '❌ MISSING',
    TWILIO_MESSAGING_SERVICE_SID: msgSvcSid  ? `${msgSvcSid.slice(0, 8)}…`  : '⚠️ not set (TWILIO_PHONE_NUMBER used instead)',
    TWILIO_PHONE_NUMBER:         phoneNum    ?? '⚠️ not set',
    DEFAULT_SMS_USER_ID:         defaultUid  ? `${defaultUid.slice(0, 8)}…`  : '⚠️ not set (SMS routing may fail)',
    OPENAI_API_KEY:              openaiKey   ? `${openaiKey.slice(0, 8)}…`   : '❌ MISSING (AI agent disabled)',
  };

  if (!accountSid || !authToken) {
    return NextResponse.json({ ok: false, envCheck, error: 'Missing Twilio credentials' });
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  // Fetch account status
  let account: Record<string, string> = {};
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    const d = await r.json();
    account = {
      status:       d.status ?? 'unknown',
      type:         d.type ?? 'unknown',
      friendlyName: d.friendly_name ?? '',
      error:        r.ok ? '' : (d.message ?? 'API error'),
    };
  } catch (e) {
    account = { error: String(e) };
  }

  // Fetch purchased phone numbers
  let phoneNumbers: Record<string, string>[] = [];
  try {
    const r = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=20`,
      { headers: { Authorization: `Basic ${auth}` } },
    );
    const d = await r.json();
    phoneNumbers = (d.incoming_phone_numbers ?? []).map((n: Record<string, string>) => ({
      number:       n.phone_number,
      friendlyName: n.friendly_name,
      smsUrl:       n.sms_url ?? '❌ no webhook set',
      smsMethod:    n.sms_method,
    }));
  } catch (e) {
    phoneNumbers = [{ error: String(e) }];
  }

  // Fetch Messaging Service if configured
  let messagingService: Record<string, string> = {};
  if (msgSvcSid) {
    try {
      const r = await fetch(
        `https://messaging.twilio.com/v1/Services/${msgSvcSid}`,
        { headers: { Authorization: `Basic ${auth}` } },
      );
      const d = await r.json();
      messagingService = {
        sid:          d.sid ?? '',
        friendlyName: d.friendly_name ?? '',
        inboundMethod: d.inbound_method ?? '',
        inboundRequestUrl: d.inbound_request_url ?? '❌ no inbound URL set',
        error:        r.ok ? '' : (d.message ?? 'API error'),
      };
    } catch (e) {
      messagingService = { error: String(e) };
    }
  }

  return NextResponse.json({
    ok: true,
    envCheck,
    account,
    phoneNumbers,
    messagingService: msgSvcSid ? messagingService : 'not configured',
    diagnosis: buildDiagnosis(account, phoneNumbers, messagingService, msgSvcSid),
  });
}

export async function POST(request: NextRequest) {
  const { to, message } = await request.json() as { to?: string; message?: string };

  if (!to) {
    return NextResponse.json({ error: 'Missing "to" field' }, { status: 400 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const msgSvcSid  = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const phoneNum   = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken) {
    return NextResponse.json({ error: 'Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN' }, { status: 500 });
  }
  if (!msgSvcSid && !phoneNum) {
    return NextResponse.json({ error: 'Missing TWILIO_MESSAGING_SERVICE_SID and TWILIO_PHONE_NUMBER — need at least one' }, { status: 500 });
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const body = new URLSearchParams({
    To:   to,
    Body: message || 'Test from JobStack 🔧 — if you received this, SMS is working!',
  });
  if (msgSvcSid) {
    body.append('MessagingServiceSid', msgSvcSid);
  } else {
    body.append('From', phoneNum!);
  }

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    },
  );

  const result = await res.json();
  return NextResponse.json({
    httpStatus:     res.status,
    ok:             res.ok,
    messageSid:     result.sid,
    status:         result.status,
    errorCode:      result.code,
    errorMessage:   result.message,
    to:             result.to,
    from:           result.from,
    fullResponse:   result,
  });
}

/**
 * PUT /api/sms/debug
 * Auto-fix: sets the Messaging Service inbound request URL and updates all
 * purchased phone number SMS webhooks to point to this deployment's
 * /api/sms/incoming endpoint.
 */
export async function PUT(request: NextRequest) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const msgSvcSid  = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!accountSid || !authToken) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });
  }

  const webhookUrl = `${request.nextUrl.origin}/api/sms/incoming`;
  const auth       = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const results: Record<string, unknown> = { webhookUrl };

  // ── Fix Messaging Service inbound URL ─────────────────────────────────────
  if (msgSvcSid) {
    const body = new URLSearchParams({ InboundRequestUrl: webhookUrl, InboundMethod: 'POST' });
    const res  = await fetch(
      `https://messaging.twilio.com/v1/Services/${msgSvcSid}`,
      { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() },
    );
    const d = await res.json();
    results.messagingService = {
      ok: res.ok,
      sid: d.sid,
      inboundRequestUrl: d.inbound_request_url,
      error: res.ok ? null : d.message,
    };
  }

  // ── Fix phone number webhook URLs ─────────────────────────────────────────
  const numsRes  = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=20`,
    { headers: { Authorization: `Basic ${auth}` } },
  );
  const numsData = await numsRes.json();
  const numbers  = numsData.incoming_phone_numbers ?? [];
  const numResults = [];

  for (const n of numbers) {
    if (n.sms_url === webhookUrl) {
      numResults.push({ number: n.phone_number, status: 'already correct' });
      continue;
    }
    const body = new URLSearchParams({ SmsUrl: webhookUrl, SmsMethod: 'POST' });
    const res  = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/${n.sid}.json`,
      { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() },
    );
    const d = await res.json();
    numResults.push({ number: n.phone_number, ok: res.ok, newUrl: d.sms_url, error: res.ok ? null : d.message });
  }

  results.phoneNumbers = numResults;
  results.ok = true;

  return NextResponse.json(results);
}

function buildDiagnosis(
  account: Record<string, string>,
  phoneNumbers: Record<string, string>[],
  messagingService: Record<string, string>,
  msgSvcSid?: string,
): string[] {
  const issues: string[] = [];
  if (account.status === 'suspended') issues.push('⛔ Twilio account is SUSPENDED');
  if (account.type === 'Trial') issues.push('⚠️ Trial account — can only send to verified numbers');
  if (phoneNumbers.length === 0) issues.push('❌ No phone numbers purchased in this account');
  phoneNumbers.forEach(n => {
    if (!n.smsUrl || n.smsUrl.includes('no webhook')) {
      issues.push(`❌ ${n.number} has no SMS webhook URL — Twilio won't forward inbound SMS`);
    } else if (!n.smsUrl.includes('/api/sms/incoming')) {
      issues.push(`⚠️ ${n.number} webhook URL (${n.smsUrl}) doesn't match expected /api/sms/incoming`);
    }
  });
  if (msgSvcSid && messagingService.error) {
    issues.push(`❌ Messaging Service error: ${messagingService.error}`);
  }
  if (msgSvcSid && messagingService.inboundRequestUrl?.includes('no inbound')) {
    issues.push('❌ Messaging Service has no inbound request URL set');
  }
  if (issues.length === 0) issues.push('✅ Everything looks configured correctly');
  return issues;
}
