'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../components/AuthProvider';
import { Job, JobStatus, JobItem } from '../lib/fieldproStorage';
import Modal from '../components/Modal';

function uid() { return typeof crypto!=='undefined'&&'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

const INPUT_CLS = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 bg-white";
const LABEL_CLS = "block text-sm font-medium text-gray-700 mb-1.5";

const WORKFLOW_STEPS: { key: JobStatus; label: string }[] = [
  { key: 'estimate', label: 'Estimate' },
  { key: 'scheduled', label: 'Schedule' },
  { key: 'on-site', label: 'On Site' },
  { key: 'done', label: 'Done' },
  { key: 'invoice-sent', label: 'Invoice' },
  { key: 'paid', label: 'Paid' },
];

const STATUS_BADGE: Record<JobStatus, { label: string; cls: string }> = {
  estimate:       { label: 'Estimate',     cls: 'bg-indigo-100 text-indigo-700' },
  scheduled:      { label: 'Scheduled',    cls: 'bg-blue-100 text-blue-700' },
  'on-site':      { label: 'On Site',      cls: 'bg-orange-500 text-white' },
  done:           { label: 'Done',         cls: 'bg-emerald-100 text-emerald-700' },
  'invoice-sent': { label: 'Invoice Sent', cls: 'bg-violet-100 text-violet-700' },
  paid:           { label: 'Paid',         cls: 'bg-green-100 text-green-700' },
};

const AVATAR_COLORS = ['bg-blue-500','bg-emerald-500','bg-orange-400','bg-violet-500','bg-teal-500','bg-pink-500','bg-amber-500','bg-cyan-500'];
function avatarColor(name: string) { let h=0; for (const c of name) h=(h*31+c.charCodeAt(0))%AVATAR_COLORS.length; return AVATAR_COLORS[Math.abs(h)]; }
function initials(name: string) { return name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2); }

// ─── Workflow Progress ────────────────────────────────────────────────────────

function WorkflowProgress({ status }: { status: JobStatus }) {
  const currentIdx = WORKFLOW_STEPS.findIndex(s => s.key === status);
  return (
    <div className="flex items-center w-full">
      {WORKFLOW_STEPS.map((step, idx) => {
        const done = idx < currentIdx;
        const current = idx === currentIdx;
        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center transition-all ${
              done ? 'bg-blue-600' : current ? 'bg-orange-400 ring-4 ring-orange-100' : 'bg-gray-200'
            }`}>
              {done && (
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
              )}
            </div>
            {idx < WORKFLOW_STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 ${idx < currentIdx ? 'bg-blue-500' : 'bg-gray-200'}`}/>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Add Work Modal ───────────────────────────────────────────────────────────

function AddWorkModal({ onSave, onClose }: {
  onSave: (item: { label: string; amount: number; quantity: number }) => void;
  onClose: () => void;
}) {
  const [wi, setWi] = useState({ label: '', amount: 0, quantity: 1 });
  const valid = wi.label.trim();
  return (
    <Modal title="Add Work Item" onClose={onClose} size="sm">
      <div className="space-y-4">
        <div>
          <label className={LABEL_CLS}>Description *</label>
          <input className={INPUT_CLS} value={wi.label} onChange={e => setWi(w => ({ ...w, label: e.target.value }))} placeholder="e.g. Labor, Parts..."/>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>Amount ($)</label>
            <input type="number" min={0} className={INPUT_CLS} value={wi.amount || ''} onChange={e => setWi(w => ({ ...w, amount: Number(e.target.value) }))} placeholder="0"/>
          </div>
          <div>
            <label className={LABEL_CLS}>Quantity</label>
            <input type="number" min={1} className={INPUT_CLS} value={wi.quantity} onChange={e => setWi(w => ({ ...w, quantity: Number(e.target.value) }))} placeholder="1"/>
          </div>
        </div>
        {wi.amount > 0 && wi.quantity > 0 && (
          <p className="text-sm text-gray-600">Subtotal: <span className="font-semibold text-gray-900">${(wi.amount * wi.quantity).toFixed(2)}</span></p>
        )}
        <button onClick={() => { if (valid) onSave(wi); }} disabled={!valid}
          className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
          Add Item
        </button>
      </div>
    </Modal>
  );
}

// ─── New Estimate Modal ───────────────────────────────────────────────────────

interface EstimateForm { title: string; customer: string; date: string; time: string; address: string; notes: string; estimate: number; }

function NewEstimateModal({ customers, onSave, onClose }: {
  customers: string[]; onSave: (f: EstimateForm) => void; onClose: () => void;
}) {
  const [f, setF] = useState<EstimateForm>({
    title: '', customer: '', date: new Date().toISOString().split('T')[0],
    time: '09:00 AM', address: '', notes: '', estimate: 0,
  });
  const set = <K extends keyof EstimateForm>(k: K, v: EstimateForm[K]) => setF(p => ({ ...p, [k]: v }));
  const valid = f.title.trim() && f.customer.trim();
  return (
    <Modal title="New Estimate" onClose={onClose} size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>Job Title *</label>
            <input className={INPUT_CLS} value={f.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Roof Inspection"/>
          </div>
          <div>
            <label className={LABEL_CLS}>Customer *</label>
            <input className={INPUT_CLS} list="cust-est" value={f.customer} onChange={e => set('customer', e.target.value)} placeholder="Customer name"/>
            <datalist id="cust-est">{customers.map(c => <option key={c} value={c}/>)}</datalist>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>Date</label>
            <input type="date" className={INPUT_CLS} value={f.date} onChange={e => set('date', e.target.value)}/>
          </div>
          <div>
            <label className={LABEL_CLS}>Time</label>
            <input className={INPUT_CLS} value={f.time} onChange={e => set('time', e.target.value)} placeholder="09:00 AM"/>
          </div>
        </div>
        <div>
          <label className={LABEL_CLS}>Address</label>
          <input className={INPUT_CLS} value={f.address} onChange={e => set('address', e.target.value)} placeholder="123 Main St"/>
        </div>
        <div>
          <label className={LABEL_CLS}>Estimate Total ($)</label>
          <input type="number" min={0} className={INPUT_CLS} value={f.estimate || ''} onChange={e => set('estimate', Number(e.target.value))} placeholder="0"/>
        </div>
        <div>
          <label className={LABEL_CLS}>Notes</label>
          <textarea className={INPUT_CLS + ' resize-none'} rows={3} value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Estimate details..."/>
        </div>
        <button onClick={() => { if (valid) onSave(f); }} disabled={!valid}
          className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
          Create Estimate
        </button>
      </div>
    </Modal>
  );
}

// ─── Job Detail Panel ─────────────────────────────────────────────────────────

function JobDetailPanel({ job, onAddWork, onNewEstimate, onEdit, onDelete }: {
  job: Job;
  onAddWork: () => void;
  onNewEstimate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const total = job.items.reduce((s, i) => s + i.amount * (i.quantity ?? 1), 0);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moreOpen]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{job.customer}</h2>
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          <button className="hover:text-blue-600 transition-colors" title="Call customer">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
            </svg>
          </button>
          <div className="relative" ref={moreRef}>
            <button onClick={() => setMoreOpen(o => !o)} className="hover:text-gray-700 transition-colors">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
              </svg>
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-20 min-w-[140px]">
                <button onClick={() => { setMoreOpen(false); onEdit(); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  Edit Job
                </button>
                <button onClick={() => { setMoreOpen(false); onDelete(); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors">
                  Delete Job
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-3">{job.address}</p>

      {/* Job title */}
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
        </svg>
        <span className="font-semibold text-gray-800 text-sm">{job.title}</span>
      </div>

      {/* Workflow progress */}
      <div className="px-1 mb-4">
        <WorkflowProgress status={job.status}/>
      </div>

      {/* Estimate total */}
      <p className="text-sm font-semibold text-gray-600 mb-4">
        ESTIMATE Total:{' '}
        <span className="text-gray-900">${job.estimate.toFixed(2)}</span>
      </p>

      {/* Work items */}
      {job.items.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Work in Progress</p>
          <div className="space-y-2">
            {job.items.map(item => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-gray-700">{item.label}{(item.quantity ?? 1) > 1 ? ` × ${item.quantity}` : ''}</span>
                <span className="font-semibold text-gray-900">${(item.amount * (item.quantity ?? 1)).toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-bold border-t border-gray-100 pt-2 mt-1">
              <span className="text-gray-900">Total:</span>
              <span className="text-gray-900">${total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      {job.notes && (
        <div className="mb-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Notes &amp; Photos</p>
          <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3 leading-relaxed">{job.notes}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-auto pt-2">
        <button onClick={onAddWork}
          className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2.5 px-3 rounded-xl hover:bg-blue-700 transition-colors">
          + Add Work
        </button>
        <button onClick={onNewEstimate}
          className="flex-1 border border-gray-200 text-gray-700 text-sm font-semibold py-2.5 px-3 rounded-xl hover:bg-gray-50 transition-colors">
          + New Estimate
        </button>
      </div>
    </div>
  );
}

// ─── Edit Job Modal (simplified inline edit) ──────────────────────────────────

interface EditForm { title: string; customer: string; date: string; time: string; address: string; notes: string; }

function EditJobModal({ job, customers, onSave, onClose }: {
  job: Job; customers: string[]; onSave: (f: EditForm) => void; onClose: () => void;
}) {
  const [f, setF] = useState<EditForm>({
    title: job.title, customer: job.customer, date: job.date,
    time: job.time, address: job.address, notes: job.notes,
  });
  const set = <K extends keyof EditForm>(k: K, v: string) => setF(p => ({ ...p, [k]: v }));
  const valid = f.title.trim() && f.customer.trim();
  return (
    <Modal title="Edit Job" onClose={onClose} size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>Job Title *</label>
            <input className={INPUT_CLS} value={f.title} onChange={e => set('title', e.target.value)}/>
          </div>
          <div>
            <label className={LABEL_CLS}>Customer *</label>
            <input className={INPUT_CLS} list="cust-edit" value={f.customer} onChange={e => set('customer', e.target.value)}/>
            <datalist id="cust-edit">{customers.map(c => <option key={c} value={c}/>)}</datalist>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>Date</label>
            <input type="date" className={INPUT_CLS} value={f.date} onChange={e => set('date', e.target.value)}/>
          </div>
          <div>
            <label className={LABEL_CLS}>Time</label>
            <input className={INPUT_CLS} value={f.time} onChange={e => set('time', e.target.value)} placeholder="09:00 AM"/>
          </div>
        </div>
        <div>
          <label className={LABEL_CLS}>Address</label>
          <input className={INPUT_CLS} value={f.address} onChange={e => set('address', e.target.value)}/>
        </div>
        <div>
          <label className={LABEL_CLS}>Notes</label>
          <textarea className={INPUT_CLS + ' resize-none'} rows={3} value={f.notes} onChange={e => set('notes', e.target.value)}/>
        </div>
        <button onClick={() => { if (valid) onSave(f); }} disabled={!valid}
          className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
          Save Changes
        </button>
      </div>
    </Modal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const { data, updateData } = useAuth();
  const jobs = data?.jobs ?? [];
  const customerNames = [...new Set((data?.customers ?? []).map(c => c.name))];
  const today = new Date().toISOString().split('T')[0];

  const todayJobs = useMemo(
    () => jobs.filter(j => j.date === today || j.status === 'on-site' || j.status === 'scheduled'),
    [jobs, today],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<'none' | 'addWork' | 'newEstimate' | 'editJob' | 'confirmDelete'>('none');

  // Auto-select first job; keep selectedId stable across data updates
  useEffect(() => {
    if (!selectedId && todayJobs.length > 0) setSelectedId(todayJobs[0].id);
  }, [todayJobs, selectedId]);

  // Always derive selectedJob from live data so updates are reflected immediately
  const selectedJob = jobs.find(j => j.id === selectedId) ?? null;

  const stats = useMemo(() => ({
    scheduled: jobs.filter(j => j.status === 'scheduled').length,
    onSite:    jobs.filter(j => j.status === 'on-site').length,
    done:      jobs.filter(j => j.status === 'done').length,
    estimates: jobs.filter(j => j.status === 'estimate').length,
  }), [jobs]);

  const recentActivities = useMemo(() => {
    const list: string[] = [];
    jobs.forEach(j => {
      if (j.status === 'invoice-sent') list.push(`Invoice sent to ${j.customer} – $${j.amount.toFixed(2)}.`);
      if (j.status === 'done')         list.push(`Job completed: ${j.customer} – ${j.title}.`);
      if (j.status === 'estimate')     list.push(`New estimate created for ${j.customer} – ${j.title}.`);
    });
    return list.slice(0, 5);
  }, [jobs]);

  const addWorkItem = useCallback((item: { label: string; amount: number; quantity: number }) => {
    if (!data || !selectedJob) return;
    const newItem: JobItem = { id: uid(), ...item };
    const updated = { ...selectedJob, items: [...selectedJob.items, newItem], amount: selectedJob.amount + item.amount * item.quantity };
    updateData({ ...data, jobs: data.jobs.map(j => j.id === updated.id ? updated : j) });
    setModal('none');
  }, [data, selectedJob, updateData]);

  const saveEstimate = useCallback((f: EstimateForm) => {
    if (!data) return;
    const newJob: Job = {
      id: uid(), title: f.title, customer: f.customer, status: 'estimate',
      date: f.date, time: f.time, address: f.address, technician: '',
      estimate: f.estimate, amount: f.estimate, notes: f.notes, items: [], photos: [],
    };
    updateData({ ...data, jobs: [newJob, ...data.jobs] });
    setSelectedId(newJob.id);
    setModal('none');
  }, [data, updateData]);

  const saveEdit = useCallback((f: EditForm) => {
    if (!data || !selectedJob) return;
    updateData({ ...data, jobs: data.jobs.map(j => j.id === selectedJob.id ? { ...j, ...f } : j) });
    setModal('none');
  }, [data, selectedJob, updateData]);

  const deleteJob = useCallback(() => {
    if (!data || !selectedJob) return;
    const remaining = data.jobs.filter(j => j.id !== selectedJob.id);
    updateData({ ...data, jobs: remaining });
    setSelectedId(remaining[0]?.id ?? null);
    setModal('none');
  }, [data, selectedJob, updateData]);

  return (
    <div className="space-y-5">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          A Complete Job <span className="text-blue-600">Workflow</span> on One Screen
        </h1>
        <p className="text-sm text-gray-500 mt-1">Streamlined CRM for home service providers.</p>
      </div>

      {/* 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_260px] gap-5 items-start">
        {/* Left: Today's Jobs */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Today&apos;s Jobs</h3>
            <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
              {todayJobs.length}
            </span>
          </div>

          {todayJobs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No jobs today.</p>
          ) : (
            <div className="space-y-1.5">
              {todayJobs.map(job => {
                const badge = STATUS_BADGE[job.status];
                const isSelected = selectedId === job.id;
                return (
                  <button key={job.id} onClick={() => setSelectedId(job.id)}
                    className={`w-full text-left p-3 rounded-xl transition-colors ${
                      isSelected ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-50'
                    }`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full ${avatarColor(job.customer)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                        {initials(job.customer)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{job.customer}</p>
                        <p className="text-xs text-gray-500 truncate">{job.title}</p>
                        <p className="text-xs text-gray-400">{job.time}</p>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Center: Job Detail */}
        <div className="bg-white rounded-2xl shadow-sm p-5 min-h-[460px]">
          {selectedJob ? (
            <JobDetailPanel
              job={selectedJob}
              onAddWork={() => setModal('addWork')}
              onNewEstimate={() => setModal('newEstimate')}
              onEdit={() => setModal('editJob')}
              onDelete={() => setModal('confirmDelete')}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm">
              Select a job from the left to view details.
            </div>
          )}
        </div>

        {/* Right: Today's Summary */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Today&apos;s Summary</h3>
            <span className="text-xs font-semibold text-green-600 bg-green-50 px-2.5 py-1 rounded-full">Live</span>
          </div>
          <div className="space-y-3">
            <div className="bg-blue-600 rounded-xl p-4 flex items-center justify-between text-white">
              <span className="text-sm font-semibold">Scheduled</span>
              <span className="text-3xl font-bold">{stats.scheduled}</span>
            </div>
            <div className="bg-green-500 rounded-xl p-4 flex items-center justify-between text-white">
              <span className="text-sm font-semibold">On Site</span>
              <span className="text-3xl font-bold">{stats.onSite}</span>
            </div>
            <div className="bg-orange-500 rounded-xl p-4 flex items-center justify-between text-white">
              <span className="text-sm font-semibold">Completed</span>
              <span className="text-3xl font-bold">{stats.done}</span>
            </div>
            <div className="bg-indigo-600 rounded-xl p-4 flex items-center justify-between text-white">
              <span className="text-sm font-semibold">Estimates</span>
              <span className="text-3xl font-bold">{stats.estimates}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      {recentActivities.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {recentActivities.map((activity, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-5 h-5 flex-shrink-0 mt-0.5">
                  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-blue-600">
                    <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth={2}/>
                    <path d="M8 2v4M16 2v4M3 10h18" stroke="currentColor" strokeWidth={2} strokeLinecap="round"/>
                  </svg>
                </div>
                <p className="text-sm text-gray-700">{activity}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {modal === 'addWork' && selectedJob && (
        <AddWorkModal onSave={addWorkItem} onClose={() => setModal('none')}/>
      )}
      {modal === 'newEstimate' && (
        <NewEstimateModal customers={customerNames} onSave={saveEstimate} onClose={() => setModal('none')}/>
      )}
      {modal === 'editJob' && selectedJob && (
        <EditJobModal job={selectedJob} customers={customerNames} onSave={saveEdit} onClose={() => setModal('none')}/>
      )}
      {modal === 'confirmDelete' && selectedJob && (
        <Modal title="Delete Job" onClose={() => setModal('none')} size="sm">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Are you sure you want to delete the job <span className="font-semibold text-gray-900">&quot;{selectedJob.title}&quot;</span> for {selectedJob.customer}? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setModal('none')}
                className="flex-1 border border-gray-200 text-gray-700 font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={deleteJob}
                className="flex-1 bg-red-500 text-white font-semibold py-2.5 rounded-xl hover:bg-red-600 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
