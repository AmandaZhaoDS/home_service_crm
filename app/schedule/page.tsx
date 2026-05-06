'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../../components/AuthProvider';
import { Job } from '../../lib/fieldproStorage';
import Modal from '../../components/Modal';

function uid() { return typeof crypto!=='undefined'&&'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

const INPUT_CLS = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 bg-white";
const LABEL_CLS = "block text-sm font-medium text-gray-700 mb-1.5";

const STATUS_COLOR: Record<string, { bg: string; text: string; dot: string }> = {
  estimate:       { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-400' },
  scheduled:      { bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-500' },
  'on-site':      { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  done:           { bg: 'bg-emerald-50',text: 'text-emerald-700',dot: 'bg-emerald-500' },
  'invoice-sent': { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
  paid:           { bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-500' },
};

const STATUS_LABEL: Record<string, string> = {
  estimate: 'Estimate', scheduled: 'Scheduled', 'on-site': 'On Site',
  done: 'Done', 'invoice-sent': 'Invoice Sent', paid: 'Paid',
};

interface ApptForm { title: string; customer: string; date: string; time: string; address: string; notes: string; syncGoogle: boolean; }
interface GoogleContact { id: string; name: string; email: string; phone: string; address: string; }
interface GoogleEvent { id: string; title: string; start: string; end: string; description: string; location: string; htmlLink: string; }

// ─── Import Contacts Modal ───────────────────────────────────────────────────

function ImportContactsModal({ contacts, onImport, onClose }: {
  contacts: GoogleContact[];
  onImport: (selectedIds: string[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  return (
    <Modal title={`Import Contacts (${contacts.length})`} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setSelected(new Set(contacts.map(c => c.id)))}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg">
            Select All
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs font-semibold text-gray-600 hover:text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg">
            Clear All
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-xl">
          <div className="divide-y divide-gray-50">
            {contacts.map(contact => (
              <div key={contact.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors">
                <input
                  type="checkbox"
                  checked={selected.has(contact.id)}
                  onChange={(e) => {
                    const newSelected = new Set(selected);
                    if (e.target.checked) newSelected.add(contact.id);
                    else newSelected.delete(contact.id);
                    setSelected(newSelected);
                  }}
                  className="w-4 h-4 rounded cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{contact.name}</p>
                  {contact.email && <p className="text-xs text-gray-500 truncate">{contact.email}</p>}
                  {contact.phone && <p className="text-xs text-gray-500">{contact.phone}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => onImport(Array.from(selected))}
          disabled={selected.size === 0}
          className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
          Import {selected.size > 0 ? `${selected.size} Contact${selected.size !== 1 ? 's' : ''}` : 'Contacts'}
        </button>
      </div>
    </Modal>
  );
}

// ─── New Appointment Modal ────────────────────────────────────────────────────

function NewAppointmentModal({ customers, googleConnected, onSave, onClose }: {
  customers: string[];
  googleConnected: boolean;
  onSave: (f: ApptForm) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState<ApptForm>({
    title: '', customer: '', date: new Date().toISOString().split('T')[0],
    time: '09:00 AM', address: '', notes: '', syncGoogle: googleConnected,
  });
  const set = <K extends keyof ApptForm>(k: K, v: ApptForm[K]) => setF(p => ({ ...p, [k]: v }));
  const valid = f.title.trim() && f.customer.trim() && f.date;

  return (
    <Modal title="New Appointment" onClose={onClose} size="md">
      <div className="space-y-4">
        <div>
          <label className={LABEL_CLS}>Job Title *</label>
          <input className={INPUT_CLS} value={f.title} onChange={e => set('title', e.target.value)} placeholder="e.g. HVAC Maintenance"/>
        </div>
        <div>
          <label className={LABEL_CLS}>Customer *</label>
          <input className={INPUT_CLS} list="cust-sched" value={f.customer} onChange={e => set('customer', e.target.value)} placeholder="Customer name"/>
          <datalist id="cust-sched">{customers.map(c => <option key={c} value={c}/>)}</datalist>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>Date *</label>
            <input type="date" className={INPUT_CLS} value={f.date} onChange={e => set('date', e.target.value)}/>
          </div>
          <div>
            <label className={LABEL_CLS}>Time</label>
            <input className={INPUT_CLS} value={f.time} onChange={e => set('time', e.target.value)} placeholder="09:00 AM"/>
          </div>
        </div>
        <div>
          <label className={LABEL_CLS}>Address</label>
          <input className={INPUT_CLS} value={f.address} onChange={e => set('address', e.target.value)} placeholder="123 Main St, San Jose, CA"/>
        </div>
        <div>
          <label className={LABEL_CLS}>Notes</label>
          <textarea className={INPUT_CLS + ' resize-none'} rows={3} value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Appointment notes..."/>
        </div>

        {googleConnected && (
          <div className="flex items-center gap-2 bg-blue-50 p-3 rounded-xl">
            <input
              type="checkbox"
              id="sync_google"
              checked={f.syncGoogle}
              onChange={e => set('syncGoogle', e.target.checked)}
              className="w-4 h-4 rounded cursor-pointer"
            />
            <label htmlFor="sync_google" className="text-sm text-blue-700 cursor-pointer flex-1">
              Sync to Google Calendar
            </label>
          </div>
        )}

        <button
          onClick={() => { if (valid) onSave(f); }}
          disabled={!valid}
          className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
          Schedule Appointment
        </button>
      </div>
    </Modal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const { user, data, updateData } = useAuth();
  const jobs = data?.jobs ?? [];
  const customerNames = [...new Set((data?.customers ?? []).map(c => c.name))];

  const [weekOffset, setWeekOffset] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([]);
  const [googleContacts, setGoogleContacts] = useState<GoogleContact[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];

  // Check Google connection and fetch events
  useEffect(() => {
    if (!user?.id) return;

    const checkGoogleStatus = async () => {
      try {
        const res = await fetch(`/api/google/status?userId=${user.id}`);
        const { connected } = await res.json();
        setGoogleConnected(connected);

        if (connected) {
          const eventsRes = await fetch(`/api/google/calendar/events?userId=${user.id}`);
          const { events } = await eventsRes.json();
          setGoogleEvents(events || []);
        }
      } catch (err) {
        console.error('Error checking Google status:', err);
      }
    };

    checkGoogleStatus();
  }, [user?.id]);

  // Handle redirect from Google OAuth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('google_connected') === 'true') {
      setGoogleConnected(true);
      window.history.replaceState({}, '', '/schedule');
      // Re-fetch Google events
      if (user?.id) {
        fetch(`/api/google/calendar/events?userId=${user.id}`)
          .then(r => r.json())
          .then(({ events }) => setGoogleEvents(events || []))
          .catch(err => console.error('Error fetching Google events:', err));
      }
    }
  }, [user?.id]);

  const weekStart = useMemo(() => {
    const d = new Date(todayStr + 'T00:00:00');
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff + weekOffset * 7);
    return d;
  }, [weekOffset, todayStr]);

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    }), [weekStart]);

  const jobsByDate = useMemo(() => {
    const map: Record<string, Job[]> = {};
    for (const job of jobs) {
      if (!map[job.date]) map[job.date] = [];
      map[job.date].push(job);
    }
    return map;
  }, [jobs]);

  const upcomingJobs = useMemo(() => {
    const from = new Date(todayStr + 'T00:00:00');
    const to = new Date(from);
    to.setDate(to.getDate() + 30);
    return jobs
      .filter(j => {
        const d = new Date(j.date + 'T00:00:00');
        return d >= from && d <= to && (j.status === 'scheduled' || j.status === 'on-site' || j.status === 'estimate');
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [jobs, todayStr]);

  const saveAppointment = async (f: ApptForm) => {
    if (!data || !user?.id) return;

    const newJob: Job = {
      id: uid(), title: f.title, customer: f.customer, status: 'scheduled',
      date: f.date, time: f.time, address: f.address, technician: '',
      estimate: 0, amount: 0, notes: f.notes, items: [], photos: [],
    };
    updateData({ ...data, jobs: [newJob, ...data.jobs] });

    // Sync to Google Calendar if enabled
    if (f.syncGoogle && googleConnected) {
      try {
        await fetch('/api/google/calendar/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, job: newJob, syncToGoogle: true }),
        });
      } catch (err) {
        console.error('Error syncing to Google Calendar:', err);
      }
    }

    setShowModal(false);
  };

  const handleFetchContacts = async () => {
    if (!user?.id) return;
    setIsLoadingGoogle(true);
    try {
      const res = await fetch(`/api/google/contacts?userId=${user.id}`);
      const { contacts } = await res.json();
      setGoogleContacts(contacts || []);
      setShowImportModal(true);
    } catch (err) {
      console.error('Error fetching contacts:', err);
      alert('Failed to fetch Google contacts');
    } finally {
      setIsLoadingGoogle(false);
    }
  };

  const handleImportContacts = async (selectedIds: string[]) => {
    if (!data) return;
    const selectedContacts = googleContacts.filter(c => selectedIds.includes(c.id));

    const newCustomers = selectedContacts.map(c => ({
      id: uid(),
      name: c.name,
      email: c.email,
      phone: c.phone,
      address: c.address,
      totalJobs: 0,
      totalSpent: 0,
      lastService: todayStr,
    }));

    const existingNames = new Set((data.customers ?? []).map(cust => cust.name));
    const toAdd = newCustomers.filter(c => !existingNames.has(c.name));

    if (toAdd.length > 0) {
      updateData({
        ...data,
        customers: [...(data.customers ?? []), ...toAdd],
      });
      setShowImportModal(false);
      alert(`Imported ${toAdd.length} contact${toAdd.length !== 1 ? 's' : ''}`);
    } else {
      alert('All selected contacts are already in your customer list');
    }
  };

  const handleConnectGoogle = () => {
    if (!user?.id) return;
    window.location.href = `/api/google/auth?userId=${user.id}`;
  };

  const handleDisconnectGoogle = async () => {
    if (!user?.id) return;
    if (!confirm('Disconnect Google account?')) return;

    try {
      await fetch('/api/google/disconnect', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      setGoogleConnected(false);
      setGoogleEvents([]);
      setGoogleContacts([]);
      alert('Google account disconnected');
    } catch (err) {
      console.error('Error disconnecting:', err);
      alert('Failed to disconnect');
    }
  };

  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const isToday = (d: Date) => fmt(d) === todayStr;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
        <button onClick={() => setShowModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
          + New Appointment
        </button>
      </div>

      {/* Google Connect Banner */}
      {!googleConnected && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900">Connect Google for Better Integration</h3>
              <p className="text-sm text-blue-700 mt-1">Sync your calendar and import contacts from Google to keep everything in sync.</p>
            </div>
            <button
              onClick={handleConnectGoogle}
              className="flex-shrink-0 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors whitespace-nowrap">
              Connect Google
            </button>
          </div>
        </div>
      )}

      {/* Google Connected Actions */}
      {googleConnected && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="font-semibold text-green-900">✓ Google account connected</p>
            <p className="text-sm text-green-700 mt-0.5">Appointments sync automatically to Google Calendar</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleFetchContacts}
              disabled={isLoadingGoogle}
              className="text-sm font-semibold text-green-700 bg-white border border-green-300 px-3 py-1.5 rounded-lg hover:bg-green-50 disabled:opacity-50 transition-colors">
              {isLoadingGoogle ? 'Loading...' : '📇 Import Contacts'}
            </button>
            <button
              onClick={handleDisconnectGoogle}
              className="text-sm font-semibold text-red-600 hover:text-red-700 px-3 py-1.5">
              Disconnect
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Scheduled', value: jobs.filter(j => j.status === 'scheduled').length, color: 'bg-blue-600' },
          { label: 'On Site',   value: jobs.filter(j => j.status === 'on-site').length,   color: 'bg-orange-500' },
          { label: 'Estimates', value: jobs.filter(j => j.status === 'estimate').length,  color: 'bg-indigo-600' },
          { label: 'Completed', value: jobs.filter(j => j.status === 'done' || j.status === 'paid').length, color: 'bg-emerald-500' },
        ].map(stat => (
          <div key={stat.label} className={`${stat.color} rounded-2xl p-4 text-white`}>
            <p className="text-sm opacity-80">{stat.label}</p>
            <p className="text-3xl font-bold mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Week Calendar */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <button onClick={() => setWeekOffset(w => w - 1)}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <div className="text-center">
            <p className="font-semibold text-gray-900">
              {weekStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} –{' '}
              {weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          </div>
          <button onClick={() => setWeekOffset(w => w + 1)}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-7 divide-x divide-gray-100">
          {weekDays.map((day, idx) => {
            const dateStr = fmt(day);
            const dayJobs = jobsByDate[dateStr] ?? [];
            const current = isToday(day);
            return (
              <div key={idx} className="min-h-[120px]">
                <div className={`px-1 py-3 text-center border-b border-gray-100 ${current ? 'bg-blue-50' : ''}`}>
                  <p className={`text-xs font-medium ${current ? 'text-blue-600' : 'text-gray-400'}`}>
                    {day.toLocaleDateString('en-US', { weekday: 'short' })}
                  </p>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center mx-auto mt-1 text-sm font-bold ${
                    current ? 'bg-blue-600 text-white' : 'text-gray-900'
                  }`}>{day.getDate()}</div>
                </div>
                <div className="p-1 space-y-1">
                  {dayJobs.slice(0, 3).map(job => {
                    const col = STATUS_COLOR[job.status] ?? STATUS_COLOR.scheduled;
                    return (
                      <div key={job.id} className={`${col.bg} ${col.text} rounded-lg px-1.5 py-1 text-xs`}>
                        <div className="font-semibold truncate leading-tight">{job.customer}</div>
                        <div className="opacity-70 truncate">{job.time}</div>
                      </div>
                    );
                  })}
                  {dayJobs.length > 3 && (
                    <p className="text-xs text-gray-400 text-center py-0.5">+{dayJobs.length - 3}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Upcoming Appointments (CRM + Google) */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Upcoming Appointments</h3>
          <p className="text-xs text-gray-500 mt-0.5">FieldPro jobs & Google Calendar events — next 30 days</p>
        </div>
        {upcomingJobs.length === 0 && googleEvents.length === 0 ? (
          <div className="text-center py-14 text-gray-400 text-sm">No upcoming appointments.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {upcomingJobs.map(job => {
              const col = STATUS_COLOR[job.status] ?? STATUS_COLOR.scheduled;
              const d = new Date(job.date + 'T00:00:00');
              return (
                <div key={job.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="text-center min-w-[44px]">
                      <p className="text-xs text-gray-400 uppercase">
                        {d.toLocaleDateString('en-US', { month: 'short' })}
                      </p>
                      <p className="text-xl font-bold text-gray-900 leading-tight">{d.getDate()}</p>
                    </div>
                    <div className={`w-0.5 h-10 rounded-full flex-shrink-0 ${col.dot}`}/>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{job.customer}</p>
                      <p className="text-xs text-gray-500 truncate">{job.title}</p>
                      <p className="text-xs text-gray-400">
                        {job.time}{job.address ? ` · ${job.address.split(',')[0]}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${col.bg} ${col.text}`}>
                      {STATUS_LABEL[job.status] ?? job.status}
                    </span>
                    {job.amount > 0 && (
                      <p className="text-sm font-semibold text-gray-900 mt-1">${job.amount.toFixed(2)}</p>
                    )}
                  </div>
                </div>
              );
            })}
            {googleEvents.length > 0 && (
              <>
                {upcomingJobs.length > 0 && <div className="px-5 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase">Google Calendar</div>}
                {googleEvents.map(event => (
                  <div key={event.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors opacity-75">
                    <div className="flex items-center gap-4">
                      <div className="w-0.5 h-10 rounded-full flex-shrink-0 bg-purple-500"/>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">{event.title}</p>
                        {event.location && <p className="text-xs text-gray-500 truncate">{event.location}</p>}
                        {event.start && <p className="text-xs text-gray-400">{new Date(event.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
                        Google Calendar
                      </span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <NewAppointmentModal customers={customerNames} googleConnected={googleConnected} onSave={saveAppointment} onClose={() => setShowModal(false)}/>
      )}

      {showImportModal && (
        <ImportContactsModal contacts={googleContacts} onImport={handleImportContacts} onClose={() => setShowImportModal(false)}/>
      )}
    </div>
  );
}
