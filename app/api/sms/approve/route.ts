import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { formatEstimateMessage } from '@/lib/smsAgent';
import type { FieldProData } from '@/lib/fieldproStorage';

/**
 * POST /api/sms/approve
 * Technician approves a pending estimate and sends it to the customer.
 *
 * Body: { userId, conversationId }
 *
 * Flow:
 *   1. Load conversation from DB
 *   2. Validate state === 'pending_review' and draftEstimate exists
 *   3. Send formatted estimate via /api/sms/send
 *   4. Transition conversation to 'sent_estimate'
 *   5. Return { ok: true, message: <what was sent> }
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, conversationId } = await request.json() as {
      userId?: string;
      conversationId?: string;
    };

    if (!userId || !conversationId) {
      return NextResponse.json({ error: 'Missing userId or conversationId' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: userData, error: loadErr } = await supabase
      .from('user_crm_data').select('data').eq('user_id', userId).single();

    if (loadErr || !userData) {
      return NextResponse.json({ error: 'User data not found' }, { status: 404 });
    }

    const crmData: FieldProData = userData.data;
    if (!crmData.smsConversations) {
      return NextResponse.json({ error: 'No conversations found' }, { status: 404 });
    }

    const convo = crmData.smsConversations.find(c => c.id === conversationId);
    if (!convo) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    if (convo.state !== 'pending_review') {
      return NextResponse.json({ error: `Conversation is in state '${convo.state}', not pending_review` }, { status: 409 });
    }
    if (!convo.draftEstimate) {
      return NextResponse.json({ error: 'No draft estimate attached to this conversation' }, { status: 422 });
    }

    const message = formatEstimateMessage(convo.draftEstimate, convo.customerName, 'JobStack');

    // Send via Twilio
    const sendRes = await fetch(new URL('/api/sms/send', request.nextUrl.origin).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: convo.customerPhone, message }),
    });

    if (!sendRes.ok) {
      const err = await sendRes.text();
      console.error('[SMS Approve] Send failed:', err);
      return NextResponse.json({ error: 'Failed to send SMS' }, { status: 502 });
    }

    // Update conversation state
    convo.state     = 'sent_estimate';
    convo.updatedAt = new Date().toISOString();
    convo.messages.push({ role: 'agent', content: message, ts: new Date().toISOString() });

    const { error: saveErr } = await supabase
      .from('user_crm_data').update({ data: crmData }).eq('user_id', userId);

    if (saveErr) {
      console.error('[SMS Approve] Save failed:', saveErr.message);
      return NextResponse.json({ error: 'State saved but DB write failed' }, { status: 500 });
    }

    console.log(`[SMS Approve] Estimate sent to ${convo.customerPhone} | conv=${conversationId}`);
    return NextResponse.json({ ok: true, message, sentTo: convo.customerPhone });
  } catch (err) {
    console.error('[SMS Approve] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/sms/approve
 * Technician dismisses/declines a pending estimate.
 *
 * Body: { userId, conversationId }
 */
export async function DELETE(request: NextRequest) {
  try {
    const { userId, conversationId } = await request.json() as {
      userId?: string;
      conversationId?: string;
    };

    if (!userId || !conversationId) {
      return NextResponse.json({ error: 'Missing userId or conversationId' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: userData } = await supabase
      .from('user_crm_data').select('data').eq('user_id', userId).single();

    if (!userData) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const crmData: FieldProData = userData.data;
    const convo = crmData.smsConversations?.find(c => c.id === conversationId);
    if (!convo) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    // Send a message asking customer for more info, return to gathering
    convo.state      = 'gathering';
    convo.draftEstimate = undefined;
    convo.updatedAt  = new Date().toISOString();

    await supabase.from('user_crm_data').update({ data: crmData }).eq('user_id', userId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[SMS Approve] Delete error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
