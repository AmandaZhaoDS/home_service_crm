'use client';

import { useState, useMemo, useCallback } from 'react';
import { useAuth } from '../../components/AuthProvider';
import { Job, JobStatus, JobItem } from '../../lib/fieldproStorage';
import Modal from '../../components/Modal';

// ─── Utilities ────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ['bg-blue-500','bg-emerald-500','bg-orange-400','bg-violet-500','bg-teal-500','bg-pink-500','bg-amber-500','bg-cyan-500'];
function avatarColor(name: string) { let h=0; for (const c of name) h=(h*31+c.charCodeAt(0))%AVATAR_COLORS.length; return AVATAR_COLORS[Math.abs(h)]; }
function initials(name: string) { return name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2); }
function uid() { return typeof crypto!=='undefined'&&'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function fmtDate(s: string) { return new Date(s+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}); }

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  estimate:      { label: 'Estimate',     cls: 'bg-indigo-100 text-indigo-700' },
  scheduled:     { label: 'Scheduled',    cls: 'bg-blue-100 text-blue-700' },
  'on-site':     { label: 'On Site',      cls: 'bg-orange-500 text-white' },
  done:          { label: 'Done',         cls: 'bg-emerald-100 text-emerald-700' },
  'invoice-sent':{ label: 'Invoice Sent', cls: 'bg-violet-100 text-violet-700' },
  paid:          { label: 'Paid',         cls: 'bg-green-100 text-green-700' },
};

const WORKFLOW_STEPS: JobStatus[] = ['estimate','scheduled','on-site','done','invoice-sent','paid'];

const NEXT_STATUS: Partial<Record<JobStatus,{next:JobStatus;label:string}>> = {
  estimate:      { next:'scheduled',     label:'Schedule Job' },
  scheduled:     { next:'on-site',       label:'Start Job' },
  'on-site':     { next:'done',          label:'Mark Complete' },
  done:          { next:'invoice-sent',  label:'Send Invoice' },
  'invoice-sent':{ next:'paid',          label:'Mark Paid' },
};

const FILTER_TABS = [
  { key:'all', label:'All' },
  { key:'scheduled', label:'Scheduled' },
  { key:'on-site', label:'On Site' },
  { key:'done', label:'Done' },
];

const PAGE_SIZE = 8;

const INPUT_CLS = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 bg-white";
const LABEL_CLS = "block text-sm font-medium text-gray-700 mb-1.5";

// ─── Workflow Progress ────────────────────────────────────────────────────────

function WorkflowProgress({ status }: { status: JobStatus }) {
  const idx = WORKFLOW_STEPS.indexOf(status);
  return (
    <div className="flex items-center w-full my-4">
      {WORKFLOW_STEPS.map((step, i) => (
        <div key={step} className="flex items-center flex-1 last:flex-none">
          <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center ${
            i<idx ? 'bg-blue-600' : i===idx ? 'bg-orange-400 ring-4 ring-orange-100' : 'bg-gray-200'
          }`}>
            {i<idx && <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
          </div>
          {i<WORKFLOW_STEPS.length-1 && <div className={`flex-1 h-0.5 ${i<idx?'bg-blue-500':'bg-gray-200'}`}/>}
        </div>
      ))}
    </div>
  );
}

// ─── Job Form ─────────────────────────────────────────────────────────────────

interface FormData {
  title: string; customer: string; status: JobStatus;
  date: string; time: string; address: string; technician: string;
  estimate: number; notes: string;
  items: { id: string; label: string; amount: number; quantity: number }[];
}

function blankForm(defaultStatus: JobStatus = 'scheduled'): FormData {
  return { title:'', customer:'', status:defaultStatus, date:new Date().toISOString().split('T')[0],
    time:'09:00 AM', address:'', technician:'', estimate:0, notes:'', items:[] };
}

function jobToForm(j: Job): FormData {
  return { title:j.title, customer:j.customer, status:j.status, date:j.date, time:j.time,
    address:j.address, technician:j.technician, estimate:j.estimate, notes:j.notes,
    items: j.items.map(i=>({id:i.id, label:i.label, amount:i.amount, quantity:i.quantity??1})) };
}

function JobFormModal({ initial, defaultStatus, customers, onSave, onClose }: {
  initial?: Job; defaultStatus?: JobStatus; customers: string[];
  onSave: (f: FormData) => void; onClose: () => void;
}) {
  const [f, setF] = useState<FormData>(initial ? jobToForm(initial) : blankForm(defaultStatus));
  const set = <K extends keyof FormData>(k:K, v:FormData[K]) => setF(p=>({...p,[k]:v}));
  const subtotal = f.items.reduce((s,i)=>s+i.amount*i.quantity, 0);
  const valid = f.title.trim() && f.customer.trim();

  return (
    <Modal title={initial ? 'Edit Job' : 'New Job'} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>Job Title *</label>
            <input className={INPUT_CLS} value={f.title} onChange={e=>set('title',e.target.value)} placeholder="e.g. Kitchen Sink Repair"/>
          </div>
          <div>
            <label className={LABEL_CLS}>Customer *</label>
            <input className={INPUT_CLS} list="cust-list" value={f.customer} onChange={e=>set('customer',e.target.value)} placeholder="Customer name"/>
            <datalist id="cust-list">{customers.map(c=><option key={c} value={c}/>)}</datalist>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>Status</label>
            <select className={INPUT_CLS} value={f.status} onChange={e=>set('status',e.target.value as JobStatus)}>
              {WORKFLOW_STEPS.map(s=><option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Technician</label>
            <input className={INPUT_CLS} value={f.technician} onChange={e=>set('technician',e.target.value)} placeholder="Technician name"/>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>Date</label>
            <input type="date" className={INPUT_CLS} value={f.date} onChange={e=>set('date',e.target.value)}/>
          </div>
          <div>
            <label className={LABEL_CLS}>Time</label>
            <input className={INPUT_CLS} value={f.time} onChange={e=>set('time',e.target.value)} placeholder="09:00 AM"/>
          </div>
        </div>

        <div>
          <label className={LABEL_CLS}>Address</label>
          <input className={INPUT_CLS} value={f.address} onChange={e=>set('address',e.target.value)} placeholder="123 Main St, San Jose, CA"/>
        </div>

        <div>
          <label className={LABEL_CLS}>Estimate Total ($)</label>
          <input type="number" min={0} className={INPUT_CLS} value={f.estimate||''} onChange={e=>set('estimate',Number(e.target.value))} placeholder="0"/>
        </div>

        {/* Work Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={LABEL_CLS + ' mb-0'}>Work Items</label>
            <button onClick={()=>setF(p=>({...p,items:[...p.items,{id:uid(),label:'',amount:0,quantity:1}]}))}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
              + Add Item
            </button>
          </div>
          {f.items.map(item=>(
            <div key={item.id} className="flex items-center gap-2 mb-2">
              <input className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 bg-white" placeholder="Description" value={item.label}
                onChange={e=>setF(p=>({...p,items:p.items.map(i=>i.id===item.id?{...i,label:e.target.value}:i)}))}/>
              <input type="number" min={0} className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 bg-white" placeholder="$" value={item.amount||''}
                onChange={e=>setF(p=>({...p,items:p.items.map(i=>i.id===item.id?{...i,amount:Number(e.target.value)}:i)}))}/>
              <input type="number" min={1} className="w-16 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 bg-white" placeholder="Qty" value={item.quantity}
                onChange={e=>setF(p=>({...p,items:p.items.map(i=>i.id===item.id?{...i,quantity:Number(e.target.value)}:i)}))}/>
              <button onClick={()=>setF(p=>({...p,items:p.items.filter(i=>i.id!==item.id)}))} className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
          ))}
          {f.items.length>0 && <p className="text-sm font-semibold text-gray-700 text-right">Subtotal: ${subtotal.toFixed(2)}</p>}
        </div>

        <div>
          <label className={LABEL_CLS}>Notes</label>
          <textarea className={INPUT_CLS+' resize-none'} rows={3} value={f.notes} onChange={e=>set('notes',e.target.value)} placeholder="Job notes..."/>
        </div>

        <button onClick={()=>{ if(valid) onSave(f); }}
          disabled={!valid}
          className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {initial ? 'Save Changes' : 'Create Job'}
        </button>
      </div>
    </Modal>
  );
}

// ─── Job Detail Modal ─────────────────────────────────────────────────────────

function JobDetailModal({ job, onEdit, onAdvance, onAddWork, onClose }: {
  job: Job; onEdit: ()=>void; onAdvance: ()=>void;
  onAddWork: (item:{label:string;amount:number;quantity:number})=>void; onClose: ()=>void;
}) {
  const badge = STATUS_CONFIG[job.status];
  const next = NEXT_STATUS[job.status];
  const total = job.items.reduce((s,i)=>s+i.amount*(i.quantity??1),0);
  const [addingWork, setAddingWork] = useState(false);
  const [wi, setWi] = useState({label:'',amount:0,quantity:1});

  return (
    <Modal title="Job Details" onClose={onClose} size="lg">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-xl font-bold text-gray-900">{job.customer}</h3>
          <p className="text-sm text-gray-500">{job.address}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold flex-shrink-0 ml-4 ${badge.cls}`}>{badge.label}</span>
      </div>

      <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
        <span className="font-semibold text-gray-800">{job.title}</span>
        <span className="text-gray-300">•</span>
        <span>{fmtDate(job.date)}, {job.time}</span>
        {job.technician && <><span className="text-gray-300">•</span><span>{job.technician}</span></>}
      </div>

      <WorkflowProgress status={job.status}/>

      <p className="text-sm font-semibold text-gray-600 mb-4">
        Estimate Total: <span className="text-gray-900">${job.estimate.toFixed(2)}</span>
      </p>

      {job.items.length>0 && (
        <div className="mb-5 bg-gray-50 rounded-xl p-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Work Items</p>
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

      {job.notes && (
        <div className="mb-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Notes</p>
          <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3 leading-relaxed">{job.notes}</p>
        </div>
      )}

      {addingWork && (
        <div className="mb-4 bg-blue-50 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-800">Add Work Item</p>
          <div className="flex gap-2">
            <input className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 bg-white" placeholder="Description"
              value={wi.label} onChange={e=>setWi(w=>({...w,label:e.target.value}))}/>
            <input type="number" min={0} className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white" placeholder="$"
              value={wi.amount||''} onChange={e=>setWi(w=>({...w,amount:Number(e.target.value)}))}/>
            <input type="number" min={1} className="w-16 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white" placeholder="Qty"
              value={wi.quantity} onChange={e=>setWi(w=>({...w,quantity:Number(e.target.value)}))}/>
          </div>
          <div className="flex gap-2">
            <button onClick={()=>{ if(wi.label){ onAddWork(wi); setWi({label:'',amount:0,quantity:1}); setAddingWork(false); }}}
              className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2 rounded-xl hover:bg-blue-700 transition-colors">Save</button>
            <button onClick={()=>setAddingWork(false)}
              className="flex-1 border border-gray-200 text-gray-600 text-sm font-semibold py-2 rounded-xl hover:bg-gray-50 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t border-gray-100">
        <button onClick={onEdit} className="flex-1 border border-gray-200 text-gray-700 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors">Edit</button>
        <button onClick={()=>setAddingWork(true)} className="flex-1 border border-blue-200 text-blue-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-blue-50 transition-colors">+ Add Work</button>
        {next && <button onClick={onAdvance} className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-blue-700 transition-colors">{next.label}</button>}
      </div>
    </Modal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function JobsPage() {
  const { data, updateData } = useAuth();
  const jobs = data?.jobs ?? [];
  const customerNames = [...new Set((data?.customers??[]).map(c=>c.name))];

  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<'none'|'create'|'estimate'|'edit'|'view'>('none');
  const [selected, setSelected] = useState<Job|null>(null);

  const filtered = useMemo(()=>{
    let list = activeTab==='all' ? jobs : jobs.filter(j=>j.status===activeTab);
    if (search.trim()) { const q=search.toLowerCase(); list=list.filter(j=>j.customer.toLowerCase().includes(q)||j.title.toLowerCase().includes(q)||j.address.toLowerCase().includes(q)); }
    return list;
  }, [jobs, activeTab, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length/PAGE_SIZE));
  const paginated = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);

  const saveJob = useCallback((f: FormData & { items: {id:string;label:string;amount:number;quantity:number}[] }, existingId?: string)=>{
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
    // Auto-create invoice when sending
    if (next.next==='invoice-sent') {
      const inv = {
        id:uid(), invoiceNumber:`INV-${Date.now().toString().slice(-6)}`,
        customer:job.customer, jobTitle:job.title, amount:job.amount,
        status:'sent' as const,
        issueDate:new Date().toISOString().split('T')[0],
        dueDate:new Date(Date.now()+14*86400000).toISOString().split('T')[0],
        description:job.notes||`Services for ${job.title}`,
      };
      newData = {...newData, invoices:[...(data.invoices??[]), inv]};
    }
    updateData(newData);
    setSelected(updated);
  }, [data, updateData]);

  const addWorkItem = useCallback((job: Job, item:{label:string;amount:number;quantity:number})=>{
    if (!data) return;
    const newItem: JobItem = {id:uid(),...item};
    const updated = {...job, items:[...job.items, newItem], amount:job.amount+item.amount*item.quantity};
    updateData({...data, jobs:data.jobs.map(j=>j.id===job.id?updated:j)});
    setSelected(updated);
  }, [data, updateData]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
        <div className="flex items-center gap-2">
          <button onClick={()=>{setModal('create');setSelected(null);}}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
            + New Job
          </button>
          <button onClick={()=>{setModal('estimate');setSelected(null);}}
            className="border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
            New Estimate
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {/* Tabs */}
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

        {/* Search */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100">
          <div className="relative flex-1 min-w-[200px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/></svg>
            <input type="text" placeholder="Search by customer, address, job title..." value={search}
              onChange={e=>{setSearch(e.target.value);setPage(1);}}
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-gray-50"/>
          </div>
          <select value={activeTab} onChange={e=>{setActiveTab(e.target.value);setPage(1);}}
            className="border border-gray-200 bg-white text-gray-600 text-sm px-3 py-2.5 rounded-xl focus:outline-none">
            <option value="all">All Statuses</option>
            {Object.entries(STATUS_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Job ID','Customer','Job','Date & Time','Status','Address','Amount','Actions'].map(h=>(
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map(job=>{
                const jobId = `#${1000+jobs.indexOf(job)}`;
                const badge = STATUS_CONFIG[job.status]??{label:job.status,cls:'bg-gray-100 text-gray-700'};
                const next = NEXT_STATUS[job.status];
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
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${badge.cls}`}>{badge.label}</span>
                    </td>
                    <td className="px-4 py-4 text-gray-600 max-w-[160px]">
                      <span className="truncate block">{job.address.split(',').slice(0,2).join(',')}</span>
                    </td>
                    <td className="px-4 py-4 font-semibold text-gray-900 whitespace-nowrap">${job.amount.toFixed(2)}</td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button onClick={()=>{setSelected(job);setModal('view');}}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">View</button>
                        {next && (
                          <button onClick={()=>advanceStatus(job)}
                            className="border border-blue-200 text-blue-600 hover:bg-blue-50 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">{next.label}</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length===0 && <div className="text-center py-14 text-gray-400 text-sm">No jobs found.</div>}
        </div>

        {totalPages>1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40">&lt; Previous</button>
            <div className="flex items-center gap-1">
              {Array.from({length:totalPages},(_,i)=>i+1).map(p=>(
                <button key={p} onClick={()=>setPage(p)} className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${p===page?'bg-blue-600 text-white':'text-gray-600 hover:bg-gray-100'}`}>{p}</button>
              ))}
            </div>
            <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40">Next &gt;</button>
          </div>
        )}
      </div>

      {/* Modals */}
      {(modal==='create'||modal==='estimate') && (
        <JobFormModal defaultStatus={modal==='estimate'?'estimate':'scheduled'} customers={customerNames}
          onSave={f=>saveJob(f as Parameters<typeof saveJob>[0])} onClose={()=>setModal('none')}/>
      )}
      {modal==='edit' && selected && (
        <JobFormModal initial={selected} customers={customerNames}
          onSave={f=>saveJob(f as Parameters<typeof saveJob>[0], selected.id)} onClose={()=>setModal('none')}/>
      )}
      {modal==='view' && selected && (
        <JobDetailModal job={selected}
          onEdit={()=>setModal('edit')}
          onAdvance={()=>advanceStatus(selected)}
          onAddWork={item=>addWorkItem(selected,item)}
          onClose={()=>{setModal('none');setSelected(null);}}/>
      )}
    </div>
  );
}
