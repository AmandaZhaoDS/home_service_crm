import { NextRequest, NextResponse } from 'next/server';
import {
  extractJobFromSMS,
  generateConfirmationSMS,
  createJobFromExtraction,
  createCustomerFromExtraction,
} from '@/lib/smsProcessing';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * POST /api/sms/incoming
 * Webhook endpoint for Twilio incoming SMS messages
 * Extracts job info using AI and creates a new job in the user's CRM
 */
export async function POST(request: NextRequest) {
  try {
    // Parse form data (Twilio sends as application/x-www-form-urlencoded)
    const formData = await request.formData();
    const from = formData.get('From') as string;
    const body = formData.get('Body') as string;
    const mediaCount = parseInt(formData.get('NumMedia') as string) || 0;

    // Extract media URLs if present
    const mediaUrls: string[] = [];
    for (let i = 0; i < mediaCount; i++) {
      const mediaUrl = formData.get(`MediaUrl${i}`) as string;
      if (mediaUrl) mediaUrls.push(mediaUrl);
    }

    // Get userId from query parameter (must be provided by client)
    // In production, you'd use Twilio's Messaging Service SID mapping or webhook signing
    const userId = request.nextUrl.searchParams.get('userId');

    if (!userId) {
      console.warn('SMS webhook received without userId. Ignoring.');
      // Return 200 to Twilio so it doesn't retry, but don't process
      return NextResponse.json(
        { error: 'Missing userId parameter' },
        { status: 200 }
      );
    }

    if (!from || !body) {
      return NextResponse.json(
        { error: 'Missing From or Body in SMS' },
        { status: 400 }
      );
    }

    console.log(`[SMS] Received from ${from}: ${body}`);

    // Step 1: Extract job details using AI
    const extraction = await extractJobFromSMS(from, body, mediaUrls);

    // Step 2: Get user's current CRM data
    const supabase = getSupabaseAdmin();
    const { data: userData, error: fetchError } = await supabase
      .from('user_crm_data')
      .select('data')
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      console.error('Error fetching user data:', fetchError);
      return NextResponse.json(
        { error: 'Unable to fetch user data' },
        { status: 500 }
      );
    }

    let crmData = userData?.data || {
      jobs: [],
      customers: [],
      invoices: [],
      appointments: [],
      pricebook: [],
      reminders: [],
    };

    // Step 3: Check if customer already exists (by phone)
    let customer = crmData.customers.find(
      (c: any) => c.phone === extraction.customerPhone
    );

    if (!customer) {
      // Create new customer
      customer = createCustomerFromExtraction(extraction);
      crmData.customers.push(customer);
      console.log(`[SMS] Created new customer: ${customer.name}`);
    } else {
      console.log(`[SMS] Found existing customer: ${customer.name}`);
    }

    // Step 4: Create job from extraction
    const newJob = createJobFromExtraction(extraction, userId);
    newJob.customer = customer.name; // Use customer name from CRM
    crmData.jobs.push(newJob);

    // Step 5: Update Supabase
    const { error: updateError } = await supabase
      .from('user_crm_data')
      .update({ data: crmData, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (updateError) {
      console.error('Error updating CRM data:', updateError);
      return NextResponse.json(
        { error: 'Failed to save job' },
        { status: 500 }
      );
    }

    // Step 6: Send confirmation SMS back to customer
    const confirmationMessage = generateConfirmationSMS(extraction);

    // Queue SMS sending (we'll implement this separately)
    // For now, we'll call the SMS sending endpoint
    try {
      await fetch(
        new URL('/api/sms/send', request.nextUrl.origin).toString(),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: extraction.customerPhone,
            message: confirmationMessage,
            internalCall: true, // Flag to prevent infinite recursion
          }),
        }
      );
    } catch (smsError) {
      console.warn('Error sending confirmation SMS:', smsError);
      // Don't fail the whole request if confirmation SMS fails
    }

    return NextResponse.json(
      {
        success: true,
        jobId: newJob.id,
        customerId: customer.id,
        extraction,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error processing incoming SMS:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
