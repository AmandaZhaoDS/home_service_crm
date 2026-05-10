// ─── Types ───────────────────────────────────────────────────────────────────

export type JobStatus = 'estimate' | 'scheduled' | 'on-site' | 'done' | 'invoice-sent' | 'paid';

export interface JobItem {
  id: string;
  label: string;
  amount: number;
  quantity?: number;
}

export interface Job {
  id: string;
  title: string;
  customer: string;
  status: JobStatus;
  date: string;
  time: string;
  address: string;
  technician: string;
  amount: number;
  estimate: number;
  items: JobItem[];
  notes: string;
  photos: string[];
  smsSource?: boolean;
  incomingMessageText?: string;
  urgencyLevel?: 'low' | 'medium' | 'high' | 'emergency';
}

export interface CustomerAttachment {
  id: string;
  name: string;
  data: string;
  uploadedAt: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  totalJobs: number;
  totalSpent: number;
  lastService: string;
  attachments?: CustomerAttachment[];
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customer: string;
  jobTitle: string;
  amount: number;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  description: string;
}

export interface Appointment {
  id: string;
  title: string;
  customer: string;
  date: string;
  time: string;
  duration: string;
  technician: string;
  status: 'scheduled' | 'on-site' | 'completed';
}

export interface PricebookItem {
  id: string;
  category: string;
  name: string;
  description: string;
  unitPrice: number;
  unit: 'flat' | 'per hour' | 'per unit';
  timesUsed: number;
}

export interface Reminder {
  id: string;
  jobId: string;
  type: 'followup' | 'parts' | 'custom';
  message: string;
  dueDate: string;
  done: boolean;
  createdAt: string;
}

export interface FieldProData {
  jobs: Job[];
  customers: Customer[];
  invoices: Invoice[];
  appointments: Appointment[];
  pricebook: PricebookItem[];
  reminders: Reminder[];
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
}

// ─── Default data for new users ──────────────────────────────────────────────

function uid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getDefaultData(): FieldProData {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];
  const dayAfter = new Date(Date.now() + 172_800_000).toISOString().split('T')[0];

  return {
    jobs: [
      {
        id: uid(),
        title: '[Sample] Kitchen Sink Repair',
        customer: '[Sample] Jane Smith',
        status: 'on-site',
        date: today,
        time: '09:00 AM',
        address: '123 Main St, San Jose, CA 95123',
        technician: 'Alex Chen',
        amount: 275,
        estimate: 275,
        items: [
          { id: uid(), label: 'Diagnose Issue', amount: 75 },
          { id: uid(), label: 'Replace Faucet', amount: 150 },
          { id: uid(), label: 'Additional Parts', amount: 50, quantity: 1 },
        ],
        notes: 'Found leak under sink. Replaced old faucet and supply lines. Tested — all good.',
        photos: [],
      },
      {
        id: uid(),
        title: '[Sample] Toilet Installation',
        customer: '[Sample] Mike Johnson',
        status: 'scheduled',
        date: tomorrow,
        time: '11:00 AM',
        address: '456 Oak St, Sunnyvale, CA',
        technician: 'Sam Lee',
        amount: 180,
        estimate: 180,
        items: [
          { id: uid(), label: 'Install Toilet', amount: 150 },
          { id: uid(), label: 'Sealant', amount: 30 },
        ],
        notes: 'Prepare installation and confirm water line connection.',
        photos: [],
      },
      {
        id: uid(),
        title: '[Sample] Water Heater Service',
        customer: '[Sample] Emily Davis',
        status: 'estimate',
        date: dayAfter,
        time: '02:00 PM',
        address: '789 Elm St, Santa Clara, CA',
        technician: 'Tina Parker',
        amount: 350,
        estimate: 350,
        items: [
          { id: uid(), label: 'Inspect Heater', amount: 120 },
          { id: uid(), label: 'Replace Filter', amount: 80 },
          { id: uid(), label: 'Parts & Labor', amount: 150 },
        ],
        notes: 'Estimate for service and parts once unit is inspected.',
        photos: [],
      },
    ],
    customers: [
      {
        id: uid(),
        name: '[Sample] Jane Smith',
        email: 'jane.smith@example.com',
        phone: '(555) 123-4567',
        address: '123 Main St, San Jose, CA 95123',
        totalJobs: 3,
        totalSpent: 1450,
        lastService: today,
      },
      {
        id: uid(),
        name: '[Sample] Mike Johnson',
        email: 'mike.johnson@example.com',
        phone: '(555) 234-5678',
        address: '456 Oak St, Sunnyvale, CA',
        totalJobs: 2,
        totalSpent: 620,
        lastService: tomorrow,
      },
      {
        id: uid(),
        name: '[Sample] Emily Davis',
        email: 'emily.davis@example.com',
        phone: '(555) 345-6789',
        address: '789 Elm St, Santa Clara, CA',
        totalJobs: 1,
        totalSpent: 350,
        lastService: dayAfter,
      },
    ],
    invoices: [
      {
        id: uid(),
        invoiceNumber: 'INV-001',
        customer: '[Sample] Jane Smith',
        jobTitle: '[Sample] Kitchen Sink Repair',
        amount: 275,
        status: 'sent',
        issueDate: today,
        dueDate: new Date(Date.now() + 12_096_000_00).toISOString().split('T')[0],
        description: 'Fixed sink leak and replaced faucet.',
      },
    ],
    appointments: [
      {
        id: uid(),
        title: '[Sample] Kitchen Sink Repair',
        customer: '[Sample] Jane Smith',
        date: today,
        time: '09:00 AM',
        duration: '2 hrs',
        technician: 'Alex Chen',
        status: 'on-site',
      },
    ],
    pricebook: [
      { id: uid(), category: 'General',   name: 'Diagnostic Inspection', description: 'Initial site diagnosis and assessment', unitPrice: 75,  unit: 'flat',     timesUsed: 3 },
      { id: uid(), category: 'Plumbing',  name: 'Faucet Replacement',    description: 'Remove old faucet and install new one',  unitPrice: 150, unit: 'flat',     timesUsed: 2 },
      { id: uid(), category: 'Plumbing',  name: 'Toilet Installation',   description: 'Install and seal toilet unit',            unitPrice: 150, unit: 'flat',     timesUsed: 1 },
      { id: uid(), category: 'HVAC',      name: 'Water Heater Inspection',description: 'Inspect and service water heater',       unitPrice: 120, unit: 'flat',     timesUsed: 1 },
      { id: uid(), category: 'HVAC',      name: 'Filter Replacement',    description: 'Replace HVAC or water heater filter',     unitPrice: 80,  unit: 'per unit', timesUsed: 2 },
      { id: uid(), category: 'General',   name: 'Parts & Materials',     description: 'Additional parts and materials',          unitPrice: 50,  unit: 'per unit', timesUsed: 5 },
      { id: uid(), category: 'Plumbing',  name: 'Drain Cleaning',        description: 'Clear blocked drain line',                unitPrice: 95,  unit: 'flat',     timesUsed: 0 },
      { id: uid(), category: 'Electrical','name': 'Outlet Replacement',  description: 'Replace damaged electrical outlet',       unitPrice: 85,  unit: 'flat',     timesUsed: 0 },
    ],
    reminders: [],
  };
}
