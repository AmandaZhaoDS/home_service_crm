'use client';

import { useState, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '../../components/AuthProvider';
import { useT } from '../../lib/i18n';
import { Job } from '../../lib/fieldproStorage';
import Modal from '../../components/Modal';

const RouteMap = dynamic(() => import('../../components/RouteMap'), { ssr: false });

function uid() { return typeof crypto!=='undefined'&&'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function localDate(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

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

interface ApptForm { title: string; customer: string; date: string; time: string; address: string; notes: string; syncGoogle: boolean; }
interface GoogleContact { id: string; name: string; email: string; phone: string; address: string; }
interface GoogleEvent { id: string; title: string; start: string; end: string; description: string; location: string; htmlLink: string; }

function ImportContactsModal({ contacts, onImport, onClose }: {
  contacts: GoogleContact[];
  onImport: (selectedIds: string[]) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  return (
    <Modal title={`${t('cust.importTitle')} (${contacts.length})`} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="flex gap-2 mb-4">
          <button onClick={() => setSelected(new Set(contacts.map(c => c.id)))}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg">{t('common.selectAll')}</button>
          <button onClick={() => setSelected(new Set())}
            className="text-xs font-semibold text-gray-600 hover:text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg">{t('common.clearAll')}</button>
        </div>
        <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-50">
          {contacts.map(contact => (
            <div key={contact.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors">
              <input type="checkbox" checked={selected.has(contact.id)}
                onChange={e => { const s = new Set(selected); e.target.checked ? s.add(contact.id) : s.delete(contact.id); setSelected(s); }}
                className="w-4 h-4 rounded cursor-pointer"/>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm">{contact.name}</p>
                {contact.email && <p className="text-xs text-gray-500 truncate">{contact.email}</p>}
                {contact.phone && <p className="text-xs text-gray-500">{contact.phone}</p>}
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => onImport(Array.from(selected))} disabled={selected.size === 0}
          className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {t('cust.importBtn')} {selected.size > 0 ? `${selected.size}` : ''}
        </button>
      </div>
    </Modal>
  );
}

function NewAppointmentModal({ customers, googleConnected, onSave, onClose }: {
  customers: string[]; googleConnected: boolean; onSave: (f: ApptForm) => void; onClose: () => void;
}) {
  const t = useT();
  const [f, setF] = useState<ApptForm>({
    title: '', customer: '', date: localDate(),
    time: '09:00 AM', address: '', notes: '', syncGoogle: googleConnected,
  });
  const set = <K extends keyof ApptForm>(k: K, v: ApptForm[K]) => setF(p => ({ ...p, [k]: v }));
  const valid = f.title.trim() && f.customer.trim() && f.date;

  return (
    <Modal title={t('sched.apptTitle')} onClose={onClose} size="md">
      <div className="space-y-4">
        <div>
          <label className={LABEL_CLS}>{t('sched.jobTitle')}</label>
          <input className={INPUT_CLS} value={f.title} onChange={e => set('title', e.target.value)} placeholder="e.g. HVAC Maintenance"/>
        </div>
        <div>
          <label className={LABEL_CLS}>{t('sched.customer')}</label>
          <input className={INPUT_CLS} list="cust-sched" value={f.customer} onChange={e => set('customer', e.target.value)}/>
          <datalist id="cust-sched">{customers.map(c => <option key={c} value={c}/>)}</datalist>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>{t('sched.date')}</label>
            <input type="date" className={INPUT_CLS} value={f.date} onChange={e => set('date', e.target.value)}/>
          </div>
          <div>
            <label className={LABEL_CLS}>{t('sched.time')}</label>
            <input className={INPUT_CLS} value={f.time} onChange={e => set('time', e.target.value)} placeholder="09:00 AM"/>
          </div>
        </div>
        <div>
          <label className={LABEL_CLS}>{t('sched.address')}</label>
          <input className={INPUT_CLS} value={f.address} onChange={e => set('address', e.target.value)} placeholder="123 Main St"/>
        </div>
        <div>
          <label className={LABEL_CLS}>{t('sched.notes')}</label>
          <textarea className={INPUT_CLS + ' resize-none'} rows={3} value={f.notes} onChange={e => set('notes', e.target.value)}/>
        </div>
        {googleConnected && (
          <div className="flex items-center gap-2 bg-blue-50 p-3 rounded-xl">
            <input type="checkbox" id="sync_google" checked={f.syncGoogle} onChange={e => set('syncGoogle', e.target.checked)} className="w-4 h-4 rounded cursor-pointer"/>
            <label htmlFor="sync_google" className="text-sm text-blue-700 cursor-pointer flex-1">{t('sched.syncGoogle')}</label>
          </div>
        )}
        <button onClick={() => { if (valid) onSave(f); }} disabled={!valid}
          className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {t('sched.scheduleBtn')}
        </button>
      </div>
    </Modal>
  );
}

export default function SchedulePage() {
  const { user, data, updateData } = useAuth();
  const t = useT();
  const jobs = data?.jobs ?? [];
  const customerNames = [...new Set((data?.customers ?? []).map(c => c.name))];

  const [weekOffset, setWeekOffset] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([]);
  const [googleContacts, setGoogleContacts] = useState<GoogleContact[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
  const [calendarView, setCalendarView] = useState<'appointments' | 'full'>('appointments');

  const todayStr = localDate();

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
      } catch {}
    };
    checkGoogleStatus();
  }, [user?.id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('google_connected') === 'true') {
      setGoogleConnected(true);
      window.history.replaceState({}, '', '/schedule');
      if (user?.id) {
        fetch(`/api/google/calendar/events?userId=${user.id}`)
          .then(r => r.json())
          .then(({ events }) => setGoogleEvents(events || []))
          .catch(() => {});
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
      .filter(j => { const d = new Date(j.date + 'T00:00:00'); return d >= from && d <= to && (j.status === 'scheduled' || j.status === 'on-site' || j.status === 'estimate'); })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [jobs, todayStr]);

  const googleEventsByDate = useMemo(() => {
    if (calendarView !== 'full') return {} as Record<string, GoogleEvent[]>;
    const map: Record<string, GoogleEvent[]> = {};
    for (const ev of googleEvents) {
      if (!ev.start) continue;
      const dateStr = ev.start.slice(0, 10);
      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push(ev);
    }
    return map;
  }, [googleEvents, calendarView]);

  const STATUS_LABEL: Record<string, string> = {
    estimate: t('status.estimate'), scheduled: t('status.scheduled'), 'on-site': t('status.onSite'),
    done: t('status.done'), 'invoice-sent': t('status.invoiceSent'), paid: t('status.paid'),
  };

  const saveAppointment = async (f: ApptForm) => {
    if (!data || !user?.id) return;
    const newJob: Job = {
      id: uid(), title: f.title, customer: f.customer, status: 'scheduled',
      date: f.date, time: f.time, address: f.address, technician: '',
      estimate: 0, amount: 0, notes: f.notes, items: [], photos: [],
    };
    updateData({ ...data, jobs: [newJob, ...data.jobs] });
    if (f.syncGoogle && googleConnected) {
      try {
        await fetch('/api/google/calendar/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, job: newJob, syncToGoogle: true }),
        });
      } catch {}
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
    } catch { alert('Failed to fetch Google contacts'); }
    finally { setIsLoadingGoogle(false); }
  };

  const handleImportContacts = async (selectedIds: string[]) => {
    if (!data) return;
    const selectedContacts = googleContacts.filter(c => selectedIds.includes(c.id));
    const existingNames = new Set((data.customers ?? []).map(cust => cust.name));
    const toAdd = selectedContacts
      .filter(c => !existingNames.has(c.name))
      .map(c => ({ id: uid(), name: c.name, email: c.email, phone: c.phone, address: c.address, totalJobs: 0, totalSpent: 0, lastService: todayStr }));
    if (toAdd.length > 0) {
      updateData({ ...data, customers: [...(data.customers ?? []), ...toAdd] });
      setShowImportModal(false);
    } else {
      alert('All selected contacts are already in your customer list');
    }
  };

  const handleConnectGoogle = () => { if (!user?.id) return; window.location.href = `/api/google/auth?userId=${user.id}`; };

  const handleDisconnectGoogle = async () => {
    if (!user?.id || !confirm(t('common.confirm'))) return;
    try {
      await fetch('/api/google/disconnect', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id }) });
      setGoogleConnected(false); setGoogleEvents([]); setGoogleContacts([]);
    } catch { alert('Failed to disconnect'); }
  };

  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const isToday = (d: Date) => fmt(d) === todayStr;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t('sched.title')}</h1>
        <button onClick={() => setShowModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
          {t('sched.newAppt')}
        </button>
      </div>

      {/* Google Connect Banner */}
      {!googleConnected && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900">{t('sched.googleBanner')}</h3>
              <p className="text-sm text-blue-700 mt-1">{t('sched.googleBannerSub')}</p>
            </div>
            <button onClick={handleConnectGoogle}
              className="flex-shrink-0 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors whitespace-nowrap">
              {t('google.connect')}
            </button>
          </div>
        </div>
      )}

      {googleConnected && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="font-semibold text-green-900">{t('google.connected')}</p>
            <p className="text-sm text-green-700 mt-0.5">{t('sched.googleConnectedSub')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleFetchContacts} disabled={isLoadingGoogle}
              className="text-sm font-semibold text-green-700 bg-white border border-green-300 px-3 py-1.5 rounded-lg hover:bg-green-50 disabled:opacity-50 transition-colors">
              {isLoadingGoogle ? t('google.importing') : t('google.import')}
            </button>
            <button onClick={handleDisconnectGoogle}
              className="text-sm font-semibold text-red-600 hover:text-red-700 px-3 py-1.5">
              {t('google.disconnect')}
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t('sched.statScheduled'), value: jobs.filter(j => j.status === 'scheduled').length, color: 'bg-blue-600' },
          { label: t('sched.statOnSite'),    value: jobs.filter(j => j.status === 'on-site').length,   color: 'bg-orange-500' },
          { label: t('sched.statEstimates'), value: jobs.filter(j => j.status === 'estimate').length,  color: 'bg-indigo-600' },
          { label: t('sched.statCompleted'), value: jobs.filter(j => j.status === 'done' || j.status === 'paid').length, color: 'bg-emerald-500' },
        ].map(stat => (
          <div key={stat.label} className={`${stat.color} rounded-2xl p-4 text-white`}>
            <p className="text-sm opacity-80">{stat.label}</p>
            <p className="text-3xl font-bold mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Calendar View Toggle */}
      {googleConnected && (
        <div className="flex items-center justify-end">
          <div className="inline-flex rounded-xl border border-gray-200 overflow-hidden bg-white text-sm font-medium">
            <button onClick={() => setCalendarView('appointments')}
              className={`px-4 py-2 transition-colors ${calendarView === 'appointments' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {t('sched.appointments')}
            </button>
            <button onClick={() => setCalendarView('full')}
              className={`px-4 py-2 transition-colors ${calendarView === 'full' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {t('sched.fullGoogle')}
            </button>
          </div>
        </div>
      )}

      {/* Week Calendar */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <button onClick={() => setWeekOffset(w => w - 1)}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
          </button>
          <div className="text-center">
            <p className="font-semibold text-gray-900">{weekStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          </div>
          <button onClick={() => setWeekOffset(w => w + 1)}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
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
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center mx-auto mt-1 text-sm font-bold ${current ? 'bg-blue-600 text-white' : 'text-gray-900'}`}>
                    {day.getDate()}
                  </div>
                </div>
                <div className="p-1 space-y-1">
                  {(() => {
                    const gEvs = calendarView === 'full' ? (googleEventsByDate[dateStr] ?? []) : [];
                    const jMax = calendarView === 'full' ? 2 : 3;
                    const jShown = Math.min(dayJobs.length, jMax);
                    const gShown = Math.min(gEvs.length, Math.max(0, 3 - jShown));
                    const overflow = (dayJobs.length - jShown) + (gEvs.length - gShown);
                    return (
                      <>
                        {dayJobs.slice(0, jShown).map(job => {
                          const col = STATUS_COLOR[job.status] ?? STATUS_COLOR.scheduled;
                          return (
                            <div key={job.id} className={`${col.bg} ${col.text} rounded-lg px-1.5 py-1 text-xs`}>
                              <div className="font-semibold truncate leading-tight">{job.customer}</div>
                              <div className="opacity-70 truncate">{job.time}</div>
                            </div>
                          );
                        })}
                        {gEvs.slice(0, gShown).map(ev => (
                          <div key={ev.id} className="bg-purple-50 text-purple-700 rounded-lg px-1.5 py-1 text-xs">
                            <div className="font-semibold truncate leading-tight">{ev.title}</div>
                            <div className="opacity-70 truncate">
                              {ev.start.includes('T') ? new Date(ev.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'All day'}
                            </div>
                          </div>
                        ))}
                        {overflow > 0 && <p className="text-xs text-gray-400 text-center py-0.5">+{overflow}</p>}
                      </>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Today's Route Map */}
      {(() => {
        const todayJobs = jobs.filter(j =>
          j.date === todayStr && (j.status === 'scheduled' || j.status === 'on-site' || j.status === 'estimate')
        );
        if (!todayJobs.length) return null;
        return (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900">Today's Route</h3>
                <p className="text-xs text-gray-500 mt-0.5">{todayJobs.length} stop{todayJobs.length !== 1 ? 's' : ''} · driving times via OpenStreetMap</p>
              </div>
              <div className="flex gap-1.5 flex-wrap justify-end">
                {todayJobs.map((j, i) => (
                  <span key={j.id} className="flex items-center gap-1 text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded-full border border-gray-100">
                    <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px] flex-shrink-0">{i + 1}</span>
                    {j.customer.split(' ')[0]}
                  </span>
                ))}
              </div>
            </div>
            <RouteMap jobs={todayJobs} />
          </div>
        );
      })()}

      {/* Upcoming Appointments */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{t('sched.upcoming')}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{t('sched.upcomingSub')}</p>
        </div>
        {upcomingJobs.length === 0 && googleEvents.length === 0 ? (
          <div className="text-center py-14 text-gray-400 text-sm">{t('sched.noUpcoming')}</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {upcomingJobs.map(job => {
              const col = STATUS_COLOR[job.status] ?? STATUS_COLOR.scheduled;
              const d = new Date(job.date + 'T00:00:00');
              return (
                <div key={job.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="text-center min-w-[44px]">
                      <p className="text-xs text-gray-400 uppercase">{d.toLocaleDateString('en-US', { month: 'short' })}</p>
                      <p className="text-xl font-bold text-gray-900 leading-tight">{d.getDate()}</p>
                    </div>
                    <div className={`w-0.5 h-10 rounded-full flex-shrink-0 ${col.dot}`}/>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{job.customer}</p>
                      <p className="text-xs text-gray-500 truncate">{job.title}</p>
                      <p className="text-xs text-gray-400">{job.time}{job.address ? ` · ${job.address.split(',')[0]}` : ''}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${col.bg} ${col.text}`}>
                      {STATUS_LABEL[job.status] ?? job.status}
                    </span>
                    {job.amount > 0 && <p className="text-sm font-semibold text-gray-900 mt-1">${job.amount.toFixed(2)}</p>}
                  </div>
                </div>
              );
            })}
            {googleEvents.length > 0 && (
              <>
                {upcomingJobs.length > 0 && <div className="px-5 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase">{t('sched.googleCal')}</div>}
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
                    <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
                      {t('sched.googleCal')}
                    </span>
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
