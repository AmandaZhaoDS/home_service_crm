export interface EstimateLineItem {
  label: string;
  amount: number;
  quantity: number;
}

export interface EstimateData {
  jobTitle: string;
  customerName: string;
  items: EstimateLineItem[];
  notes?: string;
  businessName?: string;
}

export function subtotal(items: EstimateLineItem[]): number {
  return items.reduce((s, i) => s + i.amount * (i.quantity ?? 1), 0);
}

/**
 * Format an estimate as a concise SMS message (≤160 chars per segment)
 */
export function formatEstimateAsSMS(data: EstimateData): string {
  const biz = data.businessName ?? 'JobStack';
  const total = subtotal(data.items);
  const firstName = data.customerName.split(' ')[0];

  if (data.items.length === 0) {
    return `Hi ${firstName}! Estimate for ${data.jobTitle}: $${total.toFixed(2)}. Reply YES to confirm or call us. - ${biz}`;
  }

  const lineItems = data.items
    .map(i => `• ${i.label}${(i.quantity ?? 1) > 1 ? ` x${i.quantity}` : ''}: $${(i.amount * (i.quantity ?? 1)).toFixed(2)}`)
    .join('\n');

  const notesPart = data.notes ? `\n\n${data.notes}` : '';

  return `Hi ${firstName}! Estimate for ${data.jobTitle}:\n${lineItems}\n──────────\nTotal: $${total.toFixed(2)}${notesPart}\n\nReply YES to confirm. - ${biz}`;
}

/**
 * Format an estimate as plain text for display or email
 */
export function formatEstimateAsText(data: EstimateData): string {
  const biz = data.businessName ?? 'JobStack';
  const total = subtotal(data.items);

  const header = `ESTIMATE — ${data.jobTitle}\nPrepared for: ${data.customerName}\n${'─'.repeat(40)}`;

  const lineItems = data.items.length > 0
    ? data.items.map(i =>
        `${i.label.padEnd(30)} ${(i.quantity ?? 1) > 1 ? `x${i.quantity}  ` : '      '}$${(i.amount * (i.quantity ?? 1)).toFixed(2)}`
      ).join('\n')
    : '(No line items)';

  const footer = `${'─'.repeat(40)}\nTOTAL: $${total.toFixed(2)}${data.notes ? `\n\nNotes: ${data.notes}` : ''}\n\n— ${biz}`;

  return `${header}\n${lineItems}\n${footer}`;
}
