export interface SMSJobExtraction {
  customerPhone: string;
  customerName: string;
  problemDescription: string;
  urgency: 'low' | 'medium' | 'high' | 'emergency';
  address?: string;
  estimatedCategory?: string;
  photoUrls?: string[];
}

const systemPrompt = `You are an AI that extracts home service job information from customer messages.
Extract the following from the customer's message:
- customerName: (if provided, otherwise use "Unknown Customer from " + phone)
- problemDescription: (main issue they're reporting)
- urgency: (low/medium/high/emergency - "emergency" if ASAP, "leak", "broken", "won't work")
- address: (if mentioned, otherwise null)
- estimatedCategory: (category suggestion: plumbing, electrical, HVAC, appliance, general, landscaping, etc.)

Return a JSON object with these fields. Be concise, extract what's clearly stated.
Infer urgency from language: "immediately", "ASAP", "leaking", "broken", "won't turn on" = high/emergency.
Default to "medium" if unclear.`;

/**
 * Extract job details from incoming SMS using GPT-4o-mini
 */
export async function extractJobFromSMS(
  smsBody: string,
  customerPhone: string,
  mediaUrls?: string[]
): Promise<SMSJobExtraction> {
  const apiKey = process.env.OPENAI_API_KEY;

  const userMessage = `Customer SMS: "${smsBody}"${
    mediaUrls && mediaUrls.length > 0
      ? `\n\nCustomer also sent ${mediaUrls.length} photos. This suggests a visual issue. Mark urgency higher.`
      : ''
  }`;

  if (apiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 300,
          temperature: 0.3,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
        }),
      });

      const aiJson = await response.json();
      const content: string = aiJson.choices?.[0]?.message?.content ?? '{}';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

      return {
        customerPhone,
        customerName: extracted.customerName || `Customer ${customerPhone.slice(-4)}`,
        problemDescription: extracted.problemDescription || smsBody,
        urgency: extracted.urgency || 'medium',
        address: extracted.address || undefined,
        estimatedCategory: extracted.estimatedCategory || 'general',
        photoUrls: mediaUrls,
      };
    } catch (error) {
      console.error('Error extracting job from SMS:', error);
    }
  }

  // Fallback: basic extraction when GPT is unavailable
  return {
    customerPhone,
    customerName: `Customer ${customerPhone.slice(-4)}`,
    problemDescription: smsBody,
    urgency:
      smsBody.toLowerCase().includes('emergency') ||
      smsBody.toLowerCase().includes('asap') ||
      smsBody.toLowerCase().includes('leak')
        ? 'high'
        : 'medium',
    address: undefined,
    estimatedCategory: 'general',
    photoUrls: mediaUrls,
  };
}

/**
 * Generate a confirmation message to send back to customer
 */
export function generateConfirmationSMS(
  extraction: SMSJobExtraction,
  businessName = 'JobPilot'
): string {
  const cat = extraction.estimatedCategory ?? 'service';
  const categoryLabel = cat.charAt(0).toUpperCase() + cat.slice(1);
  return `Thank you! We received your ${categoryLabel.toLowerCase()} request. A technician will contact you within 2 hours to confirm details and provide an estimate. - ${businessName}`;
}

/**
 * Create a job object from SMS extraction (for database insertion)
 */
export function createJobFromExtraction(extraction: SMSJobExtraction, _userId?: string): Record<string, unknown> {
  return {
    id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title: extraction.problemDescription.substring(0, 50),
    customer: extraction.customerName,
    address: extraction.address || 'To be confirmed',
    date: new Date().toISOString().split('T')[0],
    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
    status: 'estimate',
    amount: 0,
    estimate: 0,
    technician: '',
    items: [],
    notes: `[SMS Intake] ${extraction.problemDescription}\n\nCustomer phone: ${extraction.customerPhone}\nUrgency: ${extraction.urgency}`,
    photos: extraction.photoUrls || [],
    smsSource: true,
    incomingMessageText: extraction.problemDescription,
    urgencyLevel: extraction.urgency,
  };
}

/**
 * Create a customer object from SMS extraction (for database insertion)
 */
export function createCustomerFromExtraction(extraction: SMSJobExtraction): Record<string, unknown> {
  return {
    id: `customer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: extraction.customerName,
    email: '',
    phone: extraction.customerPhone,
    address: extraction.address || 'To be confirmed',
    totalJobs: 0,
    totalSpent: 0,
    lastService: '',
    customerPhoneVerified: true,
    source: 'sms',
  };
}
