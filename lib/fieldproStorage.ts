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

export interface FieldProData {
  jobs: Job[];
  customers: Customer[];
  invoices: Invoice[];
  appointments: Appointment[];
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  password: string;
}

interface AuthSession {
  userId: string;
}

const STORAGE_KEYS = {
  users: 'fieldpro_users',
  session: 'fieldpro_session',
  data: 'fieldpro_data',
};

function readJSON<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function generateId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getDefaultData(name: string): FieldProData {
  const today = new Date();
  const dateString = today.toISOString().split('T')[0];
  return {
    jobs: [
      {
        id: generateId(),
        title: 'Kitchen Sink Repair',
        customer: 'Jane Smith',
        status: 'on-site',
        date: dateString,
        time: '09:00 AM',
        address: '123 Main St, San Jose, CA 95123',
        technician: 'Alex Chen',
        amount: 275,
        estimate: 275,
        items: [
          { id: generateId(), label: 'Diagnose Issue', amount: 75 },
          { id: generateId(), label: 'Replace Faucet', amount: 150 },
          { id: generateId(), label: 'Additional Parts', amount: 50, quantity: 1 },
        ],
        notes: 'Found leak under sink. Replaced old faucet and supply lines. Tested — all good.',
        photos: [],
      },
      {
        id: generateId(),
        title: 'Toilet Installation',
        customer: 'Mike Johnson',
        status: 'scheduled',
        date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        time: '11:00 AM',
        address: '456 Oak St, Sunnyvale, CA',
        technician: 'Sam Lee',
        amount: 180,
        estimate: 180,
        items: [
          { id: generateId(), label: 'Install Toilet', amount: 150 },
          { id: generateId(), label: 'Sealant', amount: 30 },
        ],
        notes: 'Prepare installation and confirm water line connection.',
        photos: [],
      },
      {
        id: generateId(),
        title: 'Water Heater Service',
        customer: 'Emily Davis',
        status: 'estimate',
        date: new Date(Date.now() + 172800000).toISOString().split('T')[0],
        time: '02:00 PM',
        address: '789 Elm St, Santa Clara, CA',
        technician: 'Tina Parker',
        amount: 350,
        estimate: 350,
        items: [
          { id: generateId(), label: 'Inspect Heater', amount: 120 },
          { id: generateId(), label: 'Replace Filter', amount: 80 },
          { id: generateId(), label: 'Parts & Labor', amount: 150 },
        ],
        notes: 'Estimate for service and parts once unit is inspected.',
        photos: [],
      },
    ],
    customers: [
      {
        id: generateId(),
        name: 'Jane Smith',
        email: 'jane.smith@example.com',
        phone: '(555) 123-4567',
        address: '123 Main St, San Jose, CA 95123',
        totalJobs: 3,
        totalSpent: 1450,
        lastService: dateString,
      },
      {
        id: generateId(),
        name: 'Mike Johnson',
        email: 'mike.johnson@example.com',
        phone: '(555) 234-5678',
        address: '456 Oak St, Sunnyvale, CA',
        totalJobs: 2,
        totalSpent: 620,
        lastService: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      },
      {
        id: generateId(),
        name: 'Emily Davis',
        email: 'emily.davis@example.com',
        phone: '(555) 345-6789',
        address: '789 Elm St, Santa Clara, CA',
        totalJobs: 1,
        totalSpent: 350,
        lastService: new Date(Date.now() + 172800000).toISOString().split('T')[0],
      },
    ],
    invoices: [
      {
        id: generateId(),
        invoiceNumber: 'INV-2024-001',
        customer: 'Jane Smith',
        jobTitle: 'Kitchen Sink Repair',
        amount: 275,
        status: 'sent',
        issueDate: dateString,
        dueDate: new Date(Date.now() + 12096e5).toISOString().split('T')[0],
        description: 'Fixed sink leak and replaced faucet.',
      },
      {
        id: generateId(),
        invoiceNumber: 'INV-2024-002',
        customer: 'Mike Johnson',
        jobTitle: 'Toilet Installation',
        amount: 180,
        status: 'draft',
        issueDate: dateString,
        dueDate: new Date(Date.now() + 12096e5).toISOString().split('T')[0],
        description: 'Installation estimate for new toilet.',
      },
    ],
    appointments: [
      {
        id: generateId(),
        title: 'Kitchen Sink Repair',
        customer: 'Jane Smith',
        date: dateString,
        time: '09:00 AM',
        duration: '2 hrs',
        technician: 'Alex Chen',
        status: 'on-site',
      },
      {
        id: generateId(),
        title: 'Toilet Installation',
        customer: 'Mike Johnson',
        date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        time: '11:00 AM',
        duration: '1.5 hrs',
        technician: 'Sam Lee',
        status: 'scheduled',
      },
    ],
  };
}

export function getUsers(): UserAccount[] {
  return readJSON<UserAccount[]>(STORAGE_KEYS.users) || [];
}

export function saveUsers(users: UserAccount[]) {
  writeJSON(STORAGE_KEYS.users, users);
}

export function getSession(): AuthSession | null {
  return readJSON<AuthSession>(STORAGE_KEYS.session);
}

export function setSession(session: AuthSession) {
  writeJSON(STORAGE_KEYS.session, session);
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEYS.session);
}

export function getDataMap(): Record<string, FieldProData> {
  return readJSON<Record<string, FieldProData>>(STORAGE_KEYS.data) || {};
}

export function setDataMap(value: Record<string, FieldProData>) {
  writeJSON(STORAGE_KEYS.data, value);
}

export function getUserData(userId: string): FieldProData {
  const map = getDataMap();
  if (!map[userId]) {
    map[userId] = getDefaultData('');
    setDataMap(map);
  }
  return map[userId];
}

export function saveUserData(userId: string, data: FieldProData) {
  const map = getDataMap();
  map[userId] = data;
  setDataMap(map);
}

export function registerUser(name: string, email: string, password: string): { success: true; user: UserAccount } | { success: false; message: string } {
  const existing = getUsers().find((user) => user.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return { success: false, message: 'Email already exists.' };
  }

  const user: UserAccount = {
    id: generateId(),
    name,
    email,
    password,
  };

  const users = getUsers();
  users.push(user);
  saveUsers(users);
  saveUserData(user.id, getDefaultData(name));
  setSession({ userId: user.id });

  return { success: true, user };
}

export function loginUser(email: string, password: string): { success: true; user: UserAccount; data: FieldProData } | { success: false; message: string } {
  const user = getUsers().find(
    (account) => account.email.toLowerCase() === email.toLowerCase() && account.password === password,
  );
  if (!user) {
    return { success: false, message: 'Invalid email or password.' };
  }

  setSession({ userId: user.id });
  const data = getUserData(user.id);
  return { success: true, user, data };
}

export function logoutUser() {
  clearSession();
}
