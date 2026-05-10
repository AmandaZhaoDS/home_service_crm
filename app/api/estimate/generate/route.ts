import { NextRequest, NextResponse } from 'next/server';

interface PricebookItem {
  name: string;
  unitPrice: number;
  category?: string;
}

interface EstimateItem {
  label: string;
  amount: number;
  quantity: number;
}

export async function POST(req: NextRequest) {
  const { jobTitle, description, category, pricebook } = await req.json() as {
    jobTitle: string;
    description?: string;
    category?: string;
    pricebook?: PricebookItem[];
  };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 500 });
  }

  const pbLines = pricebook && pricebook.length > 0
    ? `\nAvailable pricebook items for reference:\n${pricebook.slice(0, 20).map(p => `- ${p.name}: $${p.unitPrice}${p.category ? ` (${p.category})` : ''}`).join('\n')}`
    : '';

  const systemPrompt = `You are an expert home service estimator for a field service CRM.
Generate a realistic, itemized estimate for a home service job.

Return ONLY valid JSON with this exact structure:
{
  "items": [
    { "label": "short description", "amount": 150, "quantity": 1 }
  ],
  "notes": "brief 1-sentence note about the estimate"
}

Rules:
- Create 3-6 line items (labor, parts, diagnostic fee, etc.)
- Use typical US home service market rates
- Each item label should be concise (3-8 words)
- Match pricing to the complexity implied by the description
- If pricebook items are relevant, align prices with them`;

  const userPrompt = `Job: ${jobTitle}
${description ? `Description: ${description}` : ''}
${category ? `Category: ${category}` : ''}${pbLines}

Generate an itemized estimate.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 500,
        temperature: 0.4,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    const aiJson = await response.json();
    const text: string = aiJson.choices?.[0]?.message?.content ?? '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    const items: EstimateItem[] = (parsed.items ?? []).map((i: Partial<EstimateItem>) => ({
      label: String(i.label ?? 'Service Item'),
      amount: Number(i.amount ?? 0),
      quantity: Number(i.quantity ?? 1),
    }));

    return NextResponse.json({ items, notes: parsed.notes ?? '' });
  } catch (err) {
    console.error('[estimate/generate] error:', err);
    return NextResponse.json({ error: 'Failed to generate estimate' }, { status: 500 });
  }
}
