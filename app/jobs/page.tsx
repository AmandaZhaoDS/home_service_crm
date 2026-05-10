'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../../components/AuthProvider';
import { useT } from '../../lib/i18n';
import { Job, JobStatus, JobItem, PricebookItem, Reminder, Customer, Invoice } from '../../lib/fieldproStorage';
import Modal from '../../components/Modal';
import CustomerSearch from '../../components/CustomerSearch';

const AVATAR_COLORS = ['bg-blue-500','bg-emerald-500','bg-orange-400','bg-violet-500','bg-teal-500','bg-pink-500','bg-amber-500','bg-cyan-500'];
function avatarColor(name: string) { let h=0; for (const c of name) h=(h*31+c.charCodeAt(0))%AVATAR_COLORS.length; return AVATAR_COLORS[Math.abs(h)]; }
function initials(name: string) { return name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2); }
function uid() { return typeof crypto!=='undefined'&&'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function localDate(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function fmtDate(s: string) { return new Date(s+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}); }

const STATUS_CLS: Record<string,string> = {
  estimate:'bg-indigo-100 text-indigo-700', scheduled:'bg-blue-100 text-blue-700',
  'on-site':'bg-orange-500 text-white', done:'bg-emerald-100 text-emerald-700',
  'invoice-sent':'bg-violet-100 text-violet-700', paid:'bg-green-100 text-green-700',
};

const WORKFLOW_STEPS: JobStatus[] = ['estimate','scheduled','on-site','done','invoice-sent','paid'];

const INPUT_CLS = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 bg-white";
const LABEL_CLS = "block text-sm font-medium text-gray-700 mb-1.5";
const PAGE_SIZE = 8;

// ─── Image compression ────────────────────────────────────────────────────────

async function compressImage(file: File, maxPx = 900, quality = 0.72): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = url;
  });
}

// ─── Workflow progress ────────────────────────────────────────────────────────

function WorkflowProgress({ status }: { status: JobStatus }) {
  const idx = WORKFLOW_STEPS.indexOf(status);
  return (
    <div className="flex items-center w-full my-4">
      {WORKFLOW_STEPS.map((step, i) => (
        <div key={step} className="flex items-center flex-1 last:flex-none">
          <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center ${i<idx?'bg-blue-600':i===idx?'bg-orange-400 ring-4 ring-orange-100':'bg-gray-200'}`}>
            {i<idx && <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
          </div>
          {i<WORKFLOW_STEPS.length-1 && <div className={`flex-1 h-0.5 ${i<idx?'bg-blue-500':'bg-gray-200'}`}/>}
        </div>
      ))}
    </div>
  );
}

// ─── Picker sheet (z-[60] overlay above modal) ───────────────────────────────

function PickerSheet({ title, children, onClose }: {
  title: string; children: React.ReactNode; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/25" onClick={onClose}/>
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 flex items-center justify-center text-xl leading-none transition-colors">&times;</button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// ─── Pricebook picker ─────────────────────────────────────────────────────────

function PricebookPicker({ pricebook, onPick }: {
  pricebook: PricebookItem[]; onPick: (item: PricebookItem) => void;
}) {
  const t = useT();
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('all');
  const categories = useMemo(() => ['all', ...Array.from(new Set(pricebook.map(p => p.category)))], [pricebook]);
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return pricebook.filter(p =>
      (cat === 'all' || p.category === cat) &&
      (!q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
    );
  }, [pricebook, search, cat]);
  return (
    <div className="space-y-3">
      <input className={INPUT_CLS} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items..."/>
      <div className="flex gap-1.5 flex-wrap">
        {categories.map(c => (
          <button key={c} onClick={() => setCat(c)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${c === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {c === 'all' ? t('pb.allCats') : c}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">{t('pb.noItems')}</p> : (
        <div className="space-y-1.5">
          {filtered.map(item => (
            <button key={item.id} onClick={() => onPick(item)}
              className="w-full text-left px-4 py-3 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50 transition-colors flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                <p className="text-xs text-gray-500">{item.category}{item.description ? ` · ${item.description}` : ''}</p>
              </div>
              <span className="text-sm font-bold text-blue-600 flex-shrink-0">${item.unitPrice}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Past job picker ──────────────────────────────────────────────────────────

type PickedItem = { id: string; label: string; amount: number; quantity: number };

function PastJobPicker({ jobs, onPickItems }: {
  jobs: Job[]; onPickItems: (items: PickedItem[]) => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const jobsWithItems = useMemo(() => jobs.filter(j => j.items.length > 0), [jobs]);
  const toggle = (jobId: string, itemId: string) => {
    setSelected(prev => {
      const next = new Set(prev[jobId] ?? []);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return { ...prev, [jobId]: next };
    });
  };
  const totalSelected = useMemo(() => Object.values(selected).reduce((s, set) => s + set.size, 0), [selected]);
  const handleAddSelected = () => {
    const items: PickedItem[] = [];
    jobs.forEach(job => {
      const sel = selected[job.id];
      if (!sel || sel.size === 0) return;
      job.items.forEach(item => {
        if (sel.has(item.id)) items.push({ id: uid(), label: item.label, amount: item.amount, quantity: item.quantity ?? 1 });
      });
    });
    if (items.length > 0) onPickItems(items);
  };
  if (jobsWithItems.length === 0) return <p className="text-sm text-gray-400 text-center py-6">{t('pb.noPastJobs')}</p>;
  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        {jobsWithItems.map(job => {
          const isExp = expanded === job.id;
          const selSet = selected[job.id] ?? new Set<string>();
          return (
            <div key={job.id} className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => setExpanded(isExp ? null : job.id)}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{job.customer} – {job.title}</p>
                  <p className="text-xs text-gray-500">{job.items.length} items · ${job.amount.toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <button onClick={e => { e.stopPropagation(); onPickItems(job.items.map(i => ({ id: uid(), label: i.label, amount: i.amount, quantity: i.quantity ?? 1 }))); }}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">
                    {t('pb.copyAll')}
                  </button>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExp ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                  </svg>
                </div>
              </div>
              {isExp && (
                <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 space-y-1">
                  {job.items.map(item => (
                    <label key={item.id} className="flex items-center gap-3 py-1.5 rounded-lg px-2 hover:bg-white cursor-pointer transition-colors">
                      <input type="checkbox" checked={selSet.has(item.id)} onChange={() => toggle(job.id, item.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"/>
                      <span className="flex-1 text-sm text-gray-700">{item.label}</span>
                      <span className="text-sm font-semibold text-gray-900">${item.amount.toFixed(2)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {totalSelected > 0 && (
        <button onClick={handleAddSelected}
          className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-xl hover:bg-blue-700 transition-colors text-sm">
          {t('pb.addItems')} ({totalSelected})
        </button>
      )}
    </div>
  );
}

// ─── Form types ───────────────────────────────────────────────────────────────

interface FormData {
  title:string; customer:string; status:JobStatus; date:string; time:string;
  address:string; technician:string; estimate:number; notes:string;
  items:{id:string;label:string;amount:number;quantity:number}[];
}
function blankForm(defaultStatus: JobStatus = 'scheduled'): FormData {
  return {title:'',customer:'',status:defaultStatus,date:localDate(),time:'09:00 AM',address:'',technician:'',estimate:0,notes:'',items:[]};
}
function jobToForm(j: Job): FormData {
  return {title:j.title,customer:j.customer,status:j.status,date:j.date,time:j.time,address:j.address,technician:j.technician,estimate:j.estimate,notes:j.notes,
    items:j.items.map(i=>({id:i.id,label:i.label,amount:i.amount,quantity:i.quantity??1}))};
}

// ─── Job Form Modal ───────────────────────────────────────────────────────────

function JobFormModal({ initial, defaultStatus, allCustomers, pricebook, pastJobs, onSave, onNewCustomer, onClose }: {
  initial?: Job; defaultStatus?: JobStatus; allCustomers: Customer[];
  pricebook: PricebookItem[]; pastJobs: Job[];
  onSave:(f:FormData)=>void; onNewCustomer:(c:Customer)=>void; onClose:()=>void;
}) {
  const t = useT();
  const [f, setF] = useState<FormData>(initial ? jobToForm(initial) : blankForm(defaultStatus));
  const [showPb, setShowPb] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const set = <K extends keyof FormData>(k:K, v:FormData[K]) => setF(p=>({...p,[k]:v}));
  const subtotal = f.items.reduce((s,i)=>s+i.amount*i.quantity,0);
  const valid = f.title.trim() && f.customer.trim();

  const STATUS_OPTS: {value:JobStatus;label:string}[] = [
    {value:'estimate',label:t('status.estimate')},{value:'scheduled',label:t('status.scheduled')},
    {value:'on-site',label:t('status.onSite')},{value:'done',label:t('status.done')},
    {value:'invoice-sent',label:t('status.invoiceSent')},{value:'paid',label:t('status.paid')},
  ];

  const addFromPricebook = useCallback((item: PricebookItem) => {
    setF(p => ({...p, items: [...p.items, {id: uid(), label: item.name, amount: item.unitPrice, quantity: 1}]}));
    setShowPb(false);
  }, []);

  const addFromPastJob = useCallback((items: PickedItem[]) => {
    setF(p => ({...p, items: [...p.items, ...items]}));
    setShowPast(false);
  }, []);

  return (
    <>
      <Modal title={initial ? t('jobs.editTitle') : t('jobs.formTitle')} onClose={onClose} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className={LABEL_CLS}>{t('jobs.jobTitle')}</label>
              <input className={INPUT_CLS} value={f.title} onChange={e=>set('title',e.target.value)} placeholder="e.g. Kitchen Sink Repair"/></div>
            <div><label className={LABEL_CLS}>{t('jobs.customer')}</label>
              <CustomerSearch
                customers={allCustomers}
                value={f.customer}
                onChange={v => set('customer', v)}
                onNewCustomer={c => { onNewCustomer(c); set('customer', c.name); }}
                placeholder="Search or add customer…"
              /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={LABEL_CLS}>{t('jobs.status')}</label>
              <select className={INPUT_CLS} value={f.status} onChange={e=>set('status',e.target.value as JobStatus)}>
                {STATUS_OPTS.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
            <div><label className={LABEL_CLS}>{t('jobs.technician')}</label>
              <input className={INPUT_CLS} value={f.technician} onChange={e=>set('technician',e.target.value)}/></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={LABEL_CLS}>{t('jobs.date')}</label>
              <input type="date" className={INPUT_CLS} value={f.date} onChange={e=>set('date',e.target.value)}/></div>
            <div><label className={LABEL_CLS}>{t('jobs.time')}</label>
              <input className={INPUT_CLS} value={f.time} onChange={e=>set('time',e.target.value)} placeholder="09:00 AM"/></div>
          </div>
          <div><label className={LABEL_CLS}>{t('jobs.address')}</label>
            <input className={INPUT_CLS} value={f.address} onChange={e=>set('address',e.target.value)}/></div>
          <div><label className={LABEL_CLS}>{t('jobs.estimateAmt')}</label>
            <input type="number" min={0} className={INPUT_CLS} value={f.estimate||''} onChange={e=>set('estimate',Number(e.target.value))}/></div>

          {/* Work Items */}
          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <label className={LABEL_CLS + ' mb-0'}>{t('jobs.workItems')}</label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {pricebook.length > 0 && (
                  <button onClick={() => setShowPb(true)}
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 border border-emerald-200 hover:bg-emerald-50 px-2.5 py-1.5 rounded-lg transition-colors">
                    {t('pb.fromPb')}
                  </button>
                )}
                {pastJobs.filter(j => j.items.length > 0).length > 0 && (
                  <button onClick={() => setShowPast(true)}
                    className="text-xs font-semibold text-violet-600 hover:text-violet-700 border border-violet-200 hover:bg-violet-50 px-2.5 py-1.5 rounded-lg transition-colors">
                    {t('pb.copyJob')}
                  </button>
                )}
                <button onClick={()=>setF(p=>({...p,items:[...p.items,{id:uid(),label:'',amount:0,quantity:1}]}))}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700">{t('jobs.addItem')}</button>
              </div>
            </div>
            {f.items.map(item=>(
              <div key={item.id} className="flex items-center gap-2 mb-2">
                <input className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white" placeholder="Description" value={item.label}
                  onChange={e=>setF(p=>({...p,items:p.items.map(i=>i.id===item.id?{...i,label:e.target.value}:i)}))}/>
                <input type="number" min={0} className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white" placeholder="$" value={item.amount||''}
                  onChange={e=>setF(p=>({...p,items:p.items.map(i=>i.id===item.id?{...i,amount:Number(e.target.value)}:i)}))}/>
                <input type="number" min={1} className="w-16 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white" placeholder="Qty" value={item.quantity}
                  onChange={e=>setF(p=>({...p,items:p.items.map(i=>i.id===item.id?{...i,quantity:Number(e.target.value)}:i)}))}/>
                <button onClick={()=>setF(p=>({...p,items:p.items.filter(i=>i.id!==item.id)}))} className="text-gray-300 hover:text-red-400 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            ))}
            {f.items.length>0 && <p className="text-sm font-semibold text-gray-700 text-right">{t('dash.subtotal')} ${subtotal.toFixed(2)}</p>}
          </div>

          <div><label className={LABEL_CLS}>{t('jobs.notes')}</label>
            <textarea className={INPUT_CLS+' resize-none'} rows={3} value={f.notes} onChange={e=>set('notes',e.target.value)}/></div>
          <button onClick={()=>{ if(valid) onSave(f); }} disabled={!valid}
            className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {initial ? t('jobs.saveBtn') : t('jobs.createBtn')}
          </button>
        </div>
      </Modal>
      {showPb && <PickerSheet title={t('pb.fromPb')} onClose={() => setShowPb(false)}><PricebookPicker pricebook={pricebook} onPick={addFromPricebook}/></PickerSheet>}
      {showPast && <PickerSheet title={t('pb.copyJob')} onClose={() => setShowPast(false)}><PastJobPicker jobs={pastJobs} onPickItems={addFromPastJob}/></PickerSheet>}
    </>
  );
}

// ─── Job Detail Modal ─────────────────────────────────────────────────────────

function JobDetailModal({ job, customerPhone, reminders, pricebook, pastJobs, onEdit, onAdvance, onAddWork, onUpdateJob, onScheduleFollowUp, onAddReminder, onConvertToInvoice, onClose }: {
  job: Job;
  customerPhone: string;
  reminders: Reminder[];
  pricebook: PricebookItem[];
  pastJobs: Job[];
  onEdit: () => void;
  onAdvance: () => void;
  onAddWork: (item:{label:string;amount:number;quantity:number}) => void;
  onUpdateJob: (updated: Job) => void;
  onScheduleFollowUp: (job: Job, date: string, time: string, notes: string) => void;
  onAddReminder: (r: Omit<Reminder,'id'|'jobId'|'createdAt'>) => void;
  onConvertToInvoice: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const total = job.items.reduce((s,i)=>s+i.amount*(i.quantity??1),0);
  const [addingWork, setAddingWork] = useState(false);
  const [wi, setWi] = useState({label:'',amount:0,quantity:1});
  const [showWiSugg, setShowWiSugg] = useState(false);
  const [showMap, setShowMap] = useState(false);

  // AI estimate generation
  const [generatingEstimate, setGeneratingEstimate] = useState(false);
  const handleGenerateEstimate = async () => {
    setGeneratingEstimate(true);
    try {
      const res = await fetch('/api/estimate/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobTitle: job.title, description: job.notes, pricebook }),
      });
      const json = await res.json();
      if (json.items?.length) {
        const newItems = json.items.map((i: {label:string;amount:number;quantity:number}) => ({
          id: uid(), label: i.label, amount: i.amount, quantity: i.quantity ?? 1,
        }));
        const newTotal = newItems.reduce((s: number, i: {amount:number;quantity:number}) => s + i.amount * i.quantity, 0);
        onUpdateJob({ ...job, items: [...job.items, ...newItems], estimate: job.items.length === 0 ? newTotal : job.estimate });
      }
    } catch { /* silently fail */ }
    setGeneratingEstimate(false);
  };

  // Customer history from past jobs
  const customerPastJobs = useMemo(() =>
    pastJobs.filter(j => j.customer === job.customer),
    [pastJobs, job.customer]
  );
  const lastCompletedJob = useMemo(() =>
    customerPastJobs
      .filter(j => ['done','paid','invoice-sent'].includes(j.status))
      .sort((a, b) => b.date.localeCompare(a.date))[0],
    [customerPastJobs]
  );

  const wiSuggestions = useMemo(() => {
    const q = wi.label.trim().toLowerCase();
    if (q.length < 1) return [];
    type Sugg = { id: string; label: string; amount: number; source: 'pricebook' | 'past' };
    const results: Sugg[] = [];
    pricebook.forEach(p => {
      if (p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q))) {
        results.push({ id: p.id, label: p.name, amount: p.unitPrice, source: 'pricebook' });
      }
    });
    const seen = new Set(results.map(r => r.label.toLowerCase()));
    pastJobs.forEach(j => {
      j.items.forEach(item => {
        const lbl = item.label.toLowerCase();
        if (lbl.includes(q) && !seen.has(lbl)) {
          seen.add(lbl);
          results.push({ id: `past-${item.id}`, label: item.label, amount: item.amount, source: 'past' });
        }
      });
    });
    return results.slice(0, 8);
  }, [wi.label, pricebook, pastJobs]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string|null>(null);

  // Follow-up panel
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [fuDate, setFuDate] = useState('');
  const [fuTime, setFuTime] = useState('09:00 AM');
  const [fuNotes, setFuNotes] = useState('');

  // Parts reminder panel
  const [showParts, setShowParts] = useState(false);
  const [partsDesc, setPartsDesc] = useState('');
  const [partsETA, setPartsETA] = useState('');

  const encoded = encodeURIComponent(job.address);

  const NEXT_STATUS_LABEL: Partial<Record<JobStatus,string>> = {
    estimate:t('jobs.scheduleJob'), scheduled:t('jobs.startJob'), 'on-site':t('jobs.markComplete'),
    done:t('jobs.sendInvoice'), 'invoice-sent':t('jobs.markPaid'),
  };
  const NEXT_MAP: Partial<Record<JobStatus,JobStatus>> = {
    estimate:'scheduled', scheduled:'on-site', 'on-site':'done', done:'invoice-sent', 'invoice-sent':'paid',
  };
  const nextLabel = NEXT_STATUS_LABEL[job.status];

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setPhotoUploading(true);
    const compressed = await Promise.all(files.map(f => compressImage(f)));
    onUpdateJob({ ...job, photos: [...job.photos, ...compressed] });
    setPhotoUploading(false);
    e.target.value = '';
  };

  const removePhoto = (idx: number) => {
    onUpdateJob({ ...job, photos: job.photos.filter((_, i) => i !== idx) });
  };

  const handleScheduleFollowUp = () => {
    if (!fuDate) return;
    onScheduleFollowUp(job, fuDate, fuTime, fuNotes);
    setShowFollowUp(false); setFuDate(''); setFuTime('09:00 AM'); setFuNotes('');
  };

  const handleAddPartsReminder = () => {
    if (!partsDesc || !partsETA) return;
    onAddReminder({ type: 'parts', message: `Parts check: ${partsDesc}`, dueDate: partsETA, done: false });
    setShowParts(false); setPartsDesc(''); setPartsETA('');
  };

  const jobReminders = reminders.filter(r => r.jobId === job.id && !r.done);

  return (
    <>
      <Modal title={t('jobs.detailTitle')} onClose={onClose} size="lg">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold text-gray-900">{job.customer}</h3>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <p className="text-sm text-gray-500">{job.address}</p>
              <div className="flex gap-1">
                <button onClick={() => setShowMap(m => !m)}
                  className={`text-xs font-semibold px-2 py-0.5 rounded-lg border transition-colors ${showMap ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                  {t('jobs.map')}
                </button>
                <a href={`https://www.google.com/maps?q=${encoded}&layer=c`} target="_blank" rel="noreferrer"
                  className="text-xs font-semibold px-2 py-0.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
                  {t('jobs.streetView')}
                </a>
              </div>
            </div>
            {showMap && (
              <div className="mt-2 rounded-xl overflow-hidden border border-gray-100">
                <iframe title="map" src={`https://maps.google.com/maps?q=${encoded}&output=embed&z=16`}
                  width="100%" height="200" style={{ border: 0, display: 'block' }} loading="lazy" allowFullScreen/>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
            {customerPhone && (
              <a href={`tel:${customerPhone.replace(/\D/g,'')}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 text-xs font-semibold transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                </svg>
                {customerPhone}
              </a>
            )}
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_CLS[job.status]??'bg-gray-100 text-gray-700'}`}>
              {job.status.replace('-',' ')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
          <span className="font-semibold text-gray-800">{job.title}</span>
          <span className="text-gray-300">•</span>
          <span>{fmtDate(job.date)}, {job.time}</span>
          {job.technician && <><span className="text-gray-300">•</span><span>{job.technician}</span></>}
        </div>
        {/* SMS intake banner */}
        {job.smsSource && (
          <div className="mb-3 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2 flex items-start gap-2">
            <span className="text-orange-500 text-sm mt-0.5">📱</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-orange-700">Incoming SMS Request</p>
              {job.incomingMessageText && <p className="text-xs text-orange-600 italic mt-0.5">"{job.incomingMessageText}"</p>}
            </div>
            {job.urgencyLevel && job.urgencyLevel !== 'medium' && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                job.urgencyLevel === 'emergency' ? 'bg-red-100 text-red-700' :
                job.urgencyLevel === 'high' ? 'bg-orange-200 text-orange-800' : 'bg-gray-100 text-gray-600'
              }`}>{job.urgencyLevel}</span>
            )}
          </div>
        )}

        {/* Customer history context */}
        {customerPastJobs.length > 0 && (
          <div className="mb-3 bg-blue-50 rounded-xl px-3 py-2">
            <p className="text-xs font-bold text-blue-700 mb-1">Customer History</p>
            <div className="flex flex-wrap gap-3 text-xs text-blue-800">
              <span>{customerPastJobs.length} past job{customerPastJobs.length !== 1 ? 's' : ''}</span>
              {lastCompletedJob && <span>Last service: {fmtDate(lastCompletedJob.date)} — {lastCompletedJob.title}</span>}
            </div>
            {customerPastJobs.length > 1 && (
              <p className="text-xs text-blue-600 mt-1">
                {customerPastJobs.slice(0, 2).map(j => j.title).join(', ')}
                {customerPastJobs.length > 2 ? ` +${customerPastJobs.length - 2} more` : ''}
              </p>
            )}
          </div>
        )}

        <WorkflowProgress status={job.status}/>
        <p className="text-sm font-semibold text-gray-600 mb-4">{t('jobs.estimateTotal')} <span className="text-gray-900">${job.estimate.toFixed(2)}</span></p>

        {/* Work items */}
        {job.items.length>0 && (
          <div className="mb-5 bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{t('jobs.workItemsSec')}</p>
            {job.items.map(item=>(
              <div key={item.id} className="flex justify-between text-sm py-1">
                <span className="text-gray-700">{item.label}{(item.quantity??1)>1?` × ${item.quantity}`:''}</span>
                <span className="font-semibold text-gray-900">${(item.amount*(item.quantity??1)).toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-bold border-t border-gray-200 pt-2 mt-1">
              <span>Total</span><span>${total.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Notes — inline editable */}
        <div className="mb-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('jobs.notesSec')}</p>
          <textarea
            key={job.id}
            className="w-full text-sm text-gray-700 bg-gray-50 rounded-xl p-3 leading-relaxed border border-transparent focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none resize-none transition-colors"
            rows={3}
            defaultValue={job.notes}
            placeholder="Add notes about this job…"
            onBlur={e => { if (e.target.value !== job.notes) onUpdateJob({ ...job, notes: e.target.value }); }}
          />
        </div>

        {/* Photos */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Photos ({job.photos.length})</p>
            {photoUploading ? (
              <span className="text-xs text-gray-400">Uploading…</span>
            ) : (
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer transition-colors">
                  📷 Camera
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload}/>
                </label>
                <label className="text-xs font-semibold text-gray-500 hover:text-gray-700 cursor-pointer transition-colors">
                  ↑ Gallery
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload}/>
                </label>
              </div>
            )}
          </div>
          {job.photos.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {job.photos.map((photo, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 cursor-pointer group"
                  onClick={() => setLightbox(photo)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo} alt={`Photo ${i+1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"/>
                  <button onClick={e => { e.stopPropagation(); removePhoto(i); }}
                    className="absolute top-1 right-1 w-5 h-5 bg-black/50 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex gap-2">
              <label className="flex-1 flex flex-col items-center justify-center h-20 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-xs cursor-pointer hover:border-blue-300 hover:text-blue-500 transition-colors">
                <span className="text-xl mb-1">📷</span>
                Take Photo
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload}/>
              </label>
              <label className="flex-1 flex flex-col items-center justify-center h-20 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-xs cursor-pointer hover:border-blue-300 hover:text-blue-500 transition-colors">
                <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
                </svg>
                From Gallery
                <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload}/>
              </label>
            </div>
          )}
        </div>

        {/* Active reminders for this job */}
        {jobReminders.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('jobs.reminders')}</p>
            <div className="space-y-1.5">
              {jobReminders.map(r => (
                <div key={r.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm ${r.type==='followup'?'bg-blue-50':'bg-amber-50'}`}>
                  <span className="text-lg">{r.type==='followup'?'📅':'📦'}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm ${r.type==='followup'?'text-blue-800':'text-amber-800'}`}>{r.message}</p>
                    <p className={`text-xs ${r.type==='followup'?'text-blue-600':'text-amber-600'}`}>Due {fmtDate(r.dueDate)}</p>
                  </div>
                  <button onClick={() => onAddReminder({ type: r.type, message: r.message, dueDate: r.dueDate, done: true })}
                    className="text-xs text-gray-400 hover:text-gray-600">✓</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add work inline */}
        {addingWork && (
          <div className="mb-4 bg-blue-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-800">{t('jobs.addWorkTitle')}</p>
            {/* Description with pricebook / past-job suggestions */}
            <div className="relative">
              <input
                autoFocus
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white"
                placeholder={t('jobs.searchItems')}
                value={wi.label}
                onChange={e => { setWi(w=>({...w,label:e.target.value})); setShowWiSugg(true); }}
                onFocus={() => { if (wi.label.trim()) setShowWiSugg(true); }}
                onBlur={() => setTimeout(() => setShowWiSugg(false), 150)}
              />
              {showWiSugg && wiSuggestions.length > 0 && (
                <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                  {wiSuggestions.map(s => (
                    <button key={s.id}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { setWi(w=>({...w, label:s.label, amount:s.amount})); setShowWiSugg(false); }}
                      className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors flex items-center justify-between gap-3 border-b border-gray-50 last:border-0">
                      <span className="text-sm text-gray-800 truncate">{s.label}</span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[10px] text-gray-400 uppercase tracking-wide">{s.source==='pricebook'?'catalog':'past'}</span>
                        <span className="text-sm font-bold text-blue-600">${s.amount.toFixed(2)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <input type="number" min={0} className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white" placeholder="$"
                value={wi.amount||''} onChange={e=>setWi(w=>({...w,amount:Number(e.target.value)}))}/>
              <input type="number" min={1} className="w-20 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white" placeholder="Qty"
                value={wi.quantity} onChange={e=>setWi(w=>({...w,quantity:Number(e.target.value)}))}/>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>{ if(wi.label){ onAddWork(wi); setWi({label:'',amount:0,quantity:1}); setAddingWork(false); }}}
                className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2 rounded-xl hover:bg-blue-700 transition-colors">{t('common.save')}</button>
              <button onClick={()=>{ setAddingWork(false); setShowWiSugg(false); }}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-semibold py-2 rounded-xl hover:bg-gray-50 transition-colors">{t('common.cancel')}</button>
            </div>
          </div>
        )}

        {/* Schedule Follow-up */}
        {showFollowUp && (
          <div className="mb-4 bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-indigo-800">{t('jobs.followUpTitle')}</p>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={fuDate} onChange={e=>setFuDate(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white"/>
              <input value={fuTime} onChange={e=>setFuTime(e.target.value)} placeholder="09:00 AM"
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white"/>
            </div>
            <input value={fuNotes} onChange={e=>setFuNotes(e.target.value)}
              placeholder={t('jobs.followUpPlaceholder')}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white"/>
            <div className="flex gap-2">
              <button onClick={handleScheduleFollowUp} disabled={!fuDate}
                className="flex-1 bg-indigo-600 text-white text-sm font-semibold py-2 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {t('jobs.scheduleRemind')}
              </button>
              <button onClick={()=>setShowFollowUp(false)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-semibold py-2 rounded-xl hover:bg-gray-50 transition-colors">{t('common.cancel')}</button>
            </div>
          </div>
        )}

        {/* Parts reminder */}
        {showParts && (
          <div className="mb-4 bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-amber-800">{t('jobs.partsTitle')}</p>
            <input value={partsDesc} onChange={e=>setPartsDesc(e.target.value)}
              placeholder={t('jobs.partsPlaceholder')}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white"/>
            <div className="flex items-center gap-2">
              <label className="text-xs text-amber-700 font-medium whitespace-nowrap">{t('jobs.etaLabel')}</label>
              <input type="date" value={partsETA} onChange={e=>setPartsETA(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white"/>
            </div>
            <div className="flex gap-2">
              <button onClick={handleAddPartsReminder} disabled={!partsDesc || !partsETA}
                className="flex-1 bg-amber-500 text-white text-sm font-semibold py-2 rounded-xl hover:bg-amber-600 disabled:opacity-50 transition-colors">
                {t('jobs.addReminder')}
              </button>
              <button onClick={()=>setShowParts(false)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-semibold py-2 rounded-xl hover:bg-gray-50 transition-colors">{t('common.cancel')}</button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
          <button onClick={onEdit} className="border border-gray-200 text-gray-700 text-sm font-semibold px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">{t('common.edit')}</button>
          <button onClick={()=>setAddingWork(true)} className="border border-blue-200 text-blue-600 text-sm font-semibold px-3 py-2.5 rounded-xl hover:bg-blue-50 transition-colors">{t('jobs.addWork')}</button>
          <button onClick={handleGenerateEstimate} disabled={generatingEstimate}
            className="border border-teal-200 text-teal-600 text-sm font-semibold px-3 py-2.5 rounded-xl hover:bg-teal-50 disabled:opacity-50 transition-colors">
            {generatingEstimate ? '⏳ Generating…' : '✨ AI Estimate'}
          </button>
          <button onClick={()=>{ setShowFollowUp(f=>!f); setShowParts(false); }}
            className={`border text-sm font-semibold px-3 py-2.5 rounded-xl transition-colors ${showFollowUp?'border-indigo-300 bg-indigo-50 text-indigo-700':'border-indigo-200 text-indigo-600 hover:bg-indigo-50'}`}>
            📅 {t('jobs.followUp')}
          </button>
          <button onClick={()=>{ setShowParts(p=>!p); setShowFollowUp(false); }}
            className={`border text-sm font-semibold px-3 py-2.5 rounded-xl transition-colors ${showParts?'border-amber-300 bg-amber-50 text-amber-700':'border-amber-200 text-amber-600 hover:bg-amber-50'}`}>
            📦 {t('jobs.parts')}
          </button>
          {job.status !== 'invoice-sent' && job.status !== 'paid' && (
            <button onClick={onConvertToInvoice}
              className="border border-violet-200 text-violet-600 text-sm font-semibold px-3 py-2.5 rounded-xl hover:bg-violet-50 transition-colors">
              {t('jobs.convertInvoice')}
            </button>
          )}
          {nextLabel && NEXT_MAP[job.status] && (
            <button onClick={onAdvance} className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-blue-700 transition-colors min-w-[120px]">{nextLabel}</button>
          )}
        </div>
      </Modal>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Job photo" className="max-w-full max-h-full rounded-xl shadow-2xl object-contain" onClick={e => e.stopPropagation()}/>
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 w-10 h-10 bg-white/20 hover:bg-white/40 text-white rounded-full flex items-center justify-center text-xl transition-colors">×</button>
        </div>
      )}
    </>
  );
}

// ─── Jobs Page ────────────────────────────────────────────────────────────────

export default function JobsPage() {
  const { data, updateData } = useAuth();
  const t = useT();
  const jobs = data?.jobs ?? [];
  const pricebook = data?.pricebook ?? [];
  const reminders = data?.reminders ?? [];
  const allCustomers = data?.customers ?? [];

  const addCustomer = useCallback((c: Customer) => {
    if (!data) return;
    updateData({ ...data, customers: [c, ...data.customers] });
  }, [data, updateData]);

  const FILTER_TABS = [
    {key:'all',label:t('jobs.tabAll')},{key:'scheduled',label:t('jobs.tabScheduled')},
    {key:'on-site',label:t('jobs.tabOnSite')},{key:'done',label:t('jobs.tabDone')},
  ];

  const NEXT_STATUS: Partial<Record<JobStatus,{next:JobStatus;label:string}>> = {
    estimate:{next:'scheduled',label:t('jobs.scheduleJob')}, scheduled:{next:'on-site',label:t('jobs.startJob')},
    'on-site':{next:'done',label:t('jobs.markComplete')}, done:{next:'invoice-sent',label:t('jobs.sendInvoice')},
    'invoice-sent':{next:'paid',label:t('jobs.markPaid')},
  };

  const STATUS_LABEL: Record<string,string> = {
    estimate:t('status.estimate'), scheduled:t('status.scheduled'), 'on-site':t('status.onSite'),
    done:t('status.done'), 'invoice-sent':t('status.invoiceSent'), paid:t('status.paid'),
  };

  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<'none'|'create'|'estimate'|'edit'|'view'>('none');
  const [selected, setSelected] = useState<Job|null>(null);

  // Handle global Create+ (top nav +Create New button) — runs once on mount,
  // no data dependency so the modal opens even before data finishes loading.
  useEffect(() => {
    const gc = sessionStorage.getItem('global-create');
    if (gc) {
      try {
        const parsed = JSON.parse(gc);
        if (parsed.type === 'job') { sessionStorage.removeItem('global-create'); setModal('create'); setSelected(null); }
        else if (parsed.type === 'estimate') { sessionStorage.removeItem('global-create'); setModal('estimate'); setSelected(null); }
      } catch { sessionStorage.removeItem('global-create'); }
    }
    // Also listen for the in-page event dispatched when already on /jobs
    const handler = (e: Event) => {
      const { type } = (e as CustomEvent<{ type: string }>).detail;
      if (type === 'job') { setModal('create'); setSelected(null); }
      else if (type === 'estimate') { setModal('estimate'); setSelected(null); }
    };
    window.addEventListener('global-create', handler);
    return () => window.removeEventListener('global-create', handler);
  }, []);

  // Handle voice navigation — needs data to look up jobs
  useEffect(() => {
    if (!data) return;
    const cmd = sessionStorage.getItem('voice-nav');
    if (cmd) {
      try {
        const parsed = JSON.parse(cmd);
        if (parsed.type === 'open_job' && parsed.jobId) {
          sessionStorage.removeItem('voice-nav');
          const job = data.jobs.find(j => j.id === parsed.jobId);
          if (job) { setSelected(job); setModal('view'); }
        }
      } catch { sessionStorage.removeItem('voice-nav'); }
    }
    const handler = (e: Event) => {
      const { jobId } = (e as CustomEvent<{ jobId: string }>).detail;
      const job = data.jobs.find(j => j.id === jobId);
      if (job) { setSelected(job); setModal('view'); }
    };
    const photoHandler = (e: Event) => {
      const { jobId } = (e as CustomEvent<{ jobId: string }>).detail;
      const job = data.jobs.find(j => j.id === jobId);
      if (job) { setSelected(job); setModal('view'); }
    };
    window.addEventListener('voice:open-job', handler);
    window.addEventListener('voice:attach-photo', photoHandler);
    return () => {
      window.removeEventListener('voice:open-job', handler);
      window.removeEventListener('voice:attach-photo', photoHandler);
    };
  }, [data]);

  const filtered = useMemo(()=>{
    let list = activeTab==='all' ? jobs : jobs.filter(j=>j.status===activeTab);
    if (search.trim()) { const q=search.toLowerCase(); list=list.filter(j=>j.customer.toLowerCase().includes(q)||j.title.toLowerCase().includes(q)||j.address.toLowerCase().includes(q)); }
    return list;
  }, [jobs, activeTab, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length/PAGE_SIZE));
  const paginated = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);

  const saveJob = useCallback((f: FormData & {items:{id:string;label:string;amount:number;quantity:number}[]}, existingId?: string)=>{
    if (!data) return;
    const amount = f.items.length>0 ? f.items.reduce((s,i)=>s+i.amount*i.quantity,0) : f.estimate;
    const items: JobItem[] = f.items.map(i=>({id:i.id,label:i.label,amount:i.amount,quantity:i.quantity}));
    if (existingId) {
      updateData({...data, jobs:data.jobs.map(j=>j.id===existingId?{...j,...f,amount,items}:j)});
    } else {
      const newJob: Job = {id:uid(),photos:[],...f,amount,items};
      updateData({...data, jobs:[newJob,...data.jobs]});
    }
    setModal('none'); setSelected(null);
  }, [data, updateData]);

  const advanceStatus = useCallback((job: Job)=>{
    if (!data) return;
    const next = NEXT_STATUS[job.status];
    if (!next) return;
    const updated = {...job, status:next.next};
    let newData = {...data, jobs:data.jobs.map(j=>j.id===job.id?updated:j)};
    if (next.next==='invoice-sent') {
      const inv = {
        id:uid(), invoiceNumber:`INV-${Date.now().toString().slice(-6)}`, customer:job.customer,
        jobTitle:job.title, amount:job.amount, status:'sent' as const,
        issueDate:localDate(),
        dueDate:localDate(new Date(Date.now()+14*86400000)),
        description:job.notes||`Services for ${job.title}`,
      };
      newData = {...newData, invoices:[...(data.invoices??[]), inv]};
    }
    updateData(newData);
    setSelected(updated);
  }, [data, updateData, NEXT_STATUS]);

  const addWorkItem = useCallback((job: Job, item:{label:string;amount:number;quantity:number})=>{
    if (!data) return;
    const newItem: JobItem = {id:uid(),...item};
    const updated = {...job, items:[...job.items, newItem], amount:job.amount+item.amount*item.quantity};
    updateData({...data, jobs:data.jobs.map(j=>j.id===job.id?updated:j)});
    setSelected(updated);
  }, [data, updateData]);

  const updateJob = useCallback((updated: Job) => {
    if (!data) return;
    updateData({...data, jobs: data.jobs.map(j => j.id === updated.id ? updated : j)});
    setSelected(updated);
  }, [data, updateData]);

  const scheduleFollowUp = useCallback((job: Job, date: string, time: string, notes: string) => {
    if (!data) return;
    const followUpJob: Job = {
      id: uid(), title: `Follow-up: ${job.title}`, customer: job.customer,
      status: 'scheduled', date, time, address: job.address,
      technician: job.technician, estimate: 0, amount: 0,
      notes: notes || `Follow-up visit for ${job.title}`, items: [], photos: [],
    };
    const reminder: Reminder = {
      id: uid(), jobId: followUpJob.id, type: 'followup',
      message: `Follow-up: ${job.customer} — ${job.title}`,
      dueDate: date, done: false,
      createdAt: localDate(),
    };
    updateData({
      ...data,
      jobs: [followUpJob, ...data.jobs],
      reminders: [...(data.reminders ?? []), reminder],
    });
  }, [data, updateData]);

  const addReminder = useCallback((job: Job, r: Omit<Reminder,'id'|'jobId'|'createdAt'>) => {
    if (!data) return;
    const reminder: Reminder = {
      ...r, id: uid(), jobId: job.id,
      createdAt: localDate(),
    };
    updateData({...data, reminders: [...(data.reminders ?? []), reminder]});
  }, [data, updateData]);

  const convertToInvoice = useCallback((job: Job) => {
    if (!data) return;
    const inv: Invoice = {
      id: uid(), invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
      customer: job.customer, jobTitle: job.title,
      amount: job.amount > 0 ? job.amount : job.estimate,
      status: 'sent',
      issueDate: localDate(),
      dueDate: localDate(new Date(Date.now()+14*86400000)),
      description: job.notes || `Services for ${job.title}`,
    };
    const updatedJob = {...job, status: 'invoice-sent' as JobStatus};
    updateData({
      ...data,
      jobs: data.jobs.map(j => j.id === job.id ? updatedJob : j),
      invoices: [...(data.invoices ?? []), inv],
    });
    setSelected(updatedJob);
  }, [data, updateData]);

  const quickComplete = useCallback((job: Job) => {
    if (!data) return;
    const completedJob: Job = { ...job, status: 'done' };
    const inv: Invoice = {
      id: uid(), invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
      customer: job.customer, jobTitle: job.title,
      amount: job.amount > 0 ? job.amount : job.estimate,
      status: 'sent',
      issueDate: localDate(),
      dueDate: localDate(new Date(Date.now() + 14 * 86400000)),
      description: job.notes || `Services for ${job.title}`,
    };
    updateData({
      ...data,
      jobs: data.jobs.map(j => j.id === job.id ? completedJob : j),
      invoices: [...(data.invoices ?? []), inv],
    });
  }, [data, updateData]);

  // Suppress unused import warning for useRef
  const _ref = useRef(null); void _ref;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t('jobs.title')}</h1>
        <div className="flex items-center gap-2">
          <button onClick={()=>{setModal('create');setSelected(null);}}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
            {t('jobs.newJob')}
          </button>
          <button onClick={()=>{setModal('estimate');setSelected(null);}}
            className="border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
            {t('jobs.newEstimate')}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center border-b border-gray-100 px-4 pt-3 gap-1">
          {FILTER_TABS.map(tab=>{
            const active = activeTab===tab.key;
            return (
              <button key={tab.key} onClick={()=>{setActiveTab(tab.key);setPage(1);}}
                className={`px-5 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  active ? tab.key==='on-site' ? 'bg-orange-500 text-white' : 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-800'
                }`}>
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100">
          <div className="relative flex-1 min-w-[200px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/></svg>
            <input type="text" placeholder={t('jobs.searchPlaceholder')} value={search}
              onChange={e=>{setSearch(e.target.value);setPage(1);}}
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-gray-50"/>
          </div>
          <select value={activeTab} onChange={e=>{setActiveTab(e.target.value);setPage(1);}}
            className="border border-gray-200 bg-white text-gray-600 text-sm px-3 py-2.5 rounded-xl focus:outline-none">
            <option value="all">{t('jobs.allStatuses')}</option>
            {Object.entries(STATUS_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        {/* Mobile card list */}
        <div className="md:hidden divide-y divide-gray-50">
          {paginated.map(job => {
            const badge = STATUS_CLS[job.status] ?? 'bg-gray-100 text-gray-700';
            const next = NEXT_STATUS[job.status];
            const hasPhotos = job.photos.length > 0;
            const jobReminderCount = reminders.filter(r => r.jobId === job.id && !r.done).length;
            return (
              <div key={job.id} className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-full ${avatarColor(job.customer)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                    {initials(job.customer)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{job.customer}</p>
                    <p className="text-sm text-gray-600 truncate">{job.title}</p>
                    <p className="text-xs text-gray-400">{fmtDate(job.date)}, {job.time}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${badge}`}>{STATUS_LABEL[job.status] ?? job.status}</span>
                    {job.smsSource && <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">📱 SMS</span>}
                    <span className="text-sm font-bold text-gray-900">${job.amount.toFixed(2)}</span>
                    {(hasPhotos || jobReminderCount > 0) && (
                      <div className="flex gap-1.5 text-xs">
                        {hasPhotos && <span className="text-gray-400">📷 {job.photos.length}</span>}
                        {jobReminderCount > 0 && <span className="text-amber-500">🔔 {jobReminderCount}</span>}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => { setSelected(job); setModal('view'); }}
                    className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-blue-700 transition-colors">
                    {t('common.view')}
                  </button>
                  {next && (
                    <button onClick={() => advanceStatus(job)}
                      className="flex-1 border border-blue-200 text-blue-700 text-sm font-semibold py-2.5 rounded-xl hover:bg-blue-50 transition-colors">
                      {next.label}
                    </button>
                  )}
                  {!['done','invoice-sent','paid'].includes(job.status) && (
                    <button onClick={() => quickComplete(job)}
                      className="flex-1 bg-emerald-500 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-emerald-600 transition-colors">
                      ✓ Complete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="text-center py-14 text-gray-400 text-sm">{t('jobs.noJobs')}</div>}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {[t('jobs.colId'),t('jobs.colCustomer'),t('jobs.colJob'),t('jobs.colDateTime'),t('jobs.colStatus'),t('jobs.colAddress'),t('jobs.colAmount'),t('jobs.colActions')].map(h=>(
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map(job=>{
                const jobId = `#${1000+jobs.indexOf(job)}`;
                const badge = STATUS_CLS[job.status]??'bg-gray-100 text-gray-700';
                const next = NEXT_STATUS[job.status];
                const hasPhotos = job.photos.length > 0;
                const jobReminderCount = reminders.filter(r => r.jobId === job.id && !r.done).length;
                return (
                  <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-4 font-semibold text-gray-700 whitespace-nowrap">{jobId}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full ${avatarColor(job.customer)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>{initials(job.customer)}</div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{job.customer}</p>
                          <p className="text-xs text-gray-500 truncate">{job.title}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-gray-700 whitespace-nowrap max-w-[140px] truncate">{job.title}</td>
                    <td className="px-4 py-4 text-gray-600 whitespace-nowrap">{fmtDate(job.date)}, {job.time}</td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold w-fit ${badge}`}>{STATUS_LABEL[job.status]??job.status}</span>
                        {job.smsSource && <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 w-fit">📱 SMS</span>}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-gray-600 max-w-[160px]"><span className="truncate block">{job.address.split(',').slice(0,2).join(',')}</span></td>
                    <td className="px-4 py-4 font-semibold text-gray-900 whitespace-nowrap">
                      ${job.amount.toFixed(2)}
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {hasPhotos && <span className="text-xs text-gray-400">📷 {job.photos.length}</span>}
                        {jobReminderCount > 0 && <span className="text-xs text-amber-500">🔔 {jobReminderCount}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={()=>{setSelected(job);setModal('view');}}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">{t('common.view')}</button>
                        {next && (
                          <button onClick={()=>advanceStatus(job)}
                            className="border border-blue-200 text-blue-600 hover:bg-blue-50 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">{next.label}</button>
                        )}
                        {!['done','invoice-sent','paid'].includes(job.status) && (
                          <button onClick={()=>quickComplete(job)}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">✓ Complete</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length===0 && <div className="text-center py-14 text-gray-400 text-sm">{t('jobs.noJobs')}</div>}
        </div>

        {totalPages>1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40">‹ {t('jobs.prev')}</button>
            <div className="flex items-center gap-1">
              {Array.from({length:totalPages},(_,i)=>i+1).map(p=>(
                <button key={p} onClick={()=>setPage(p)} className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${p===page?'bg-blue-600 text-white':'text-gray-600 hover:bg-gray-100'}`}>{p}</button>
              ))}
            </div>
            <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40">{t('jobs.next')} ›</button>
          </div>
        )}
      </div>

      {(modal==='create'||modal==='estimate') && (
        <JobFormModal defaultStatus={modal==='estimate'?'estimate':'scheduled'}
          allCustomers={allCustomers} pricebook={pricebook} pastJobs={jobs}
          onSave={f=>saveJob(f as Parameters<typeof saveJob>[0])}
          onNewCustomer={addCustomer} onClose={()=>setModal('none')}/>
      )}
      {modal==='edit' && selected && (
        <JobFormModal initial={selected}
          allCustomers={allCustomers} pricebook={pricebook} pastJobs={jobs.filter(j=>j.id!==selected.id)}
          onSave={f=>saveJob(f as Parameters<typeof saveJob>[0], selected.id)}
          onNewCustomer={addCustomer} onClose={()=>setModal('none')}/>
      )}
      {modal==='view' && selected && (
        <JobDetailModal
          job={selected}
          customerPhone={(data?.customers??[]).find(c=>c.name===selected.customer)?.phone??''}
          reminders={reminders}
          pricebook={pricebook}
          pastJobs={jobs.filter(j=>j.id!==selected.id)}
          onEdit={()=>setModal('edit')}
          onAdvance={()=>advanceStatus(selected)}
          onAddWork={item=>addWorkItem(selected,item)}
          onUpdateJob={updateJob}
          onScheduleFollowUp={scheduleFollowUp}
          onAddReminder={r=>addReminder(selected,r)}
          onConvertToInvoice={()=>convertToInvoice(selected)}
          onClose={()=>{setModal('none');setSelected(null);}}/>
      )}
    </div>
  );
}
