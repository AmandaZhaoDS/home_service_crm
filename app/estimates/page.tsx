'use client';

import { useState, useMemo, useCallback } from 'react';
import { useAuth } from '../../components/AuthProvider';
import { useT } from '../../lib/i18n';
import { Job, JobStatus, JobItem, PricebookItem, Customer, Invoice } from '../../lib/fieldproStorage';
import Modal from '../../components/Modal';
import CustomerSearch from '../../components/CustomerSearch';

function uid() { return typeof crypto!=='undefined'&&'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function fmtDate(s: string) { return new Date(s+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}); }
function todayStr() { return new Date().toISOString().split('T')[0]; }
function dueDateStr() { return new Date(Date.now()+14*86400000).toISOString().split('T')[0]; }
function invNum() { return `INV-${Date.now().toString().slice(-6)}`; }

const INPUT_CLS = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 bg-white";
const LABEL_CLS = "block text-sm font-medium text-gray-700 mb-1.5";

// ─── Estimate form (reuse job fields) ────────────────────────────────────────

interface EstimateForm {
  title: string; customer: string; date: string; time: string;
  address: string; technician: string; estimate: number; notes: string;
  items: { id: string; label: string; amount: number; quantity: number }[];
}

function blankForm(): EstimateForm {
  return { title:'', customer:'', date: todayStr(), time:'09:00 AM', address:'', technician:'', estimate:0, notes:'', items:[] };
}

function jobToForm(j: Job): EstimateForm {
  return { title:j.title, customer:j.customer, date:j.date, time:j.time, address:j.address, technician:j.technician, estimate:j.estimate, notes:j.notes,
    items: j.items.map(i => ({ id:i.id, label:i.label, amount:i.amount, quantity:i.quantity??1 })) };
}

function EstimateFormModal({ initial, allCustomers, pricebook, onSave, onNewCustomer, onClose }: {
  initial?: Job; allCustomers: Customer[]; pricebook: PricebookItem[];
  onSave: (f: EstimateForm) => void; onNewCustomer: (c: Customer) => void; onClose: () => void;
}) {
  const t = useT();
  const [f, setF] = useState<EstimateForm>(initial ? jobToForm(initial) : blankForm());
  const set = <K extends keyof EstimateForm>(k: K, v: EstimateForm[K]) => setF(p => ({ ...p, [k]: v }));
  const subtotal = f.items.reduce((s, i) => s + i.amount * i.quantity, 0);
  const valid = f.title.trim() && f.customer.trim();

  return (
    <Modal title={initial ? t('est.editEstimate') : t('est.newEstimate')} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className={LABEL_CLS}>{t('dash.jobTitle')}</label>
            <input className={INPUT_CLS} value={f.title} onChange={e=>set('title',e.target.value)} placeholder="e.g. Roof Inspection"/></div>
          <div><label className={LABEL_CLS}>{t('dash.customer')}</label>
            <CustomerSearch customers={allCustomers} value={f.customer}
              onChange={v=>set('customer',v)}
              onNewCustomer={c=>{ onNewCustomer(c); set('customer',c.name); }}
              placeholder="Search or add customer…"/>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={LABEL_CLS}>{t('dash.date')}</label>
            <input type="date" className={INPUT_CLS} value={f.date} onChange={e=>set('date',e.target.value)}/></div>
          <div><label className={LABEL_CLS}>{t('dash.time')}</label>
            <input className={INPUT_CLS} value={f.time} onChange={e=>set('time',e.target.value)} placeholder="09:00 AM"/></div>
        </div>
        <div><label className={LABEL_CLS}>{t('dash.address')}</label>
          <input className={INPUT_CLS} value={f.address} onChange={e=>set('address',e.target.value)}/></div>
        <div><label className={LABEL_CLS}>{t('dash.estimateAmt')}</label>
          <input type="number" min={0} className={INPUT_CLS} value={f.estimate||''} onChange={e=>set('estimate',Number(e.target.value))}/></div>

        {/* Work Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={LABEL_CLS+' mb-0'}>{t('jobs.workItems')}</label>
            <button onClick={()=>setF(p=>({...p,items:[...p.items,{id:uid(),label:'',amount:0,quantity:1}]}))}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700">{t('jobs.addItem')}</button>
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
          {initial ? t('common.save') : t('dash.createEstimate')}
        </button>
      </div>
    </Modal>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EstimatesPage() {
  const { data, updateData } = useAuth();
  const t = useT();

  const estimates = useMemo(() => (data?.jobs ?? []).filter(j => j.status === 'estimate'), [data?.jobs]);
  const allCustomers = data?.customers ?? [];
  const pricebook = data?.pricebook ?? [];

  const [modal, setModal] = useState<'none'|'create'|'edit'>('none');
  const [selected, setSelected] = useState<Job|null>(null);
  const [search, setSearch] = useState('');

  const addCustomer = useCallback((c: Customer) => {
    if (!data) return;
    updateData({ ...data, customers: [c, ...data.customers] });
  }, [data, updateData]);

  const filtered = useMemo(() => {
    if (!search.trim()) return estimates;
    const q = search.toLowerCase();
    return estimates.filter(e =>
      e.customer.toLowerCase().includes(q) || e.title.toLowerCase().includes(q)
    );
  }, [estimates, search]);

  const saveEstimate = useCallback((f: EstimateForm) => {
    if (!data) return;
    if (selected) {
      updateData({ ...data, jobs: data.jobs.map(j => j.id === selected.id
        ? { ...j, ...f, amount: f.estimate, items: f.items.map(i => ({ ...i, quantity: i.quantity ?? 1 })) }
        : j) });
    } else {
      const newJob: Job = {
        id: uid(), title: f.title, customer: f.customer, status: 'estimate',
        date: f.date, time: f.time, address: f.address, technician: f.technician,
        estimate: f.estimate, amount: f.estimate, notes: f.notes,
        items: f.items.map(i => ({ ...i, quantity: i.quantity ?? 1 })), photos: [],
      };
      updateData({ ...data, jobs: [newJob, ...data.jobs] });
    }
    setModal('none'); setSelected(null);
  }, [data, selected, updateData]);

  const convertToInvoice = useCallback((job: Job) => {
    if (!data || !confirm(t('est.confirmConvert'))) return;
    const invoice: Invoice = {
      id: uid(),
      invoiceNumber: invNum(),
      customer: job.customer,
      jobTitle: job.title,
      amount: job.amount || job.estimate,
      status: 'draft',
      issueDate: todayStr(),
      dueDate: dueDateStr(),
      description: job.notes || '',
    };
    const updatedJobs = data.jobs.map(j => j.id === job.id ? { ...j, status: 'scheduled' as JobStatus } : j);
    updateData({ ...data, jobs: updatedJobs, invoices: [invoice, ...data.invoices] });
  }, [data, t, updateData]);

  const totalValue = useMemo(() => estimates.reduce((s, e) => s + (e.amount || e.estimate), 0), [estimates]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('est.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{estimates.length} estimate{estimates.length !== 1 ? 's' : ''} · ${totalValue.toFixed(2)} total</p>
        </div>
        <button onClick={() => { setSelected(null); setModal('create'); }}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
          {t('est.newEstimate')}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35"/>
        </svg>
        <input
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 bg-white"
          placeholder="Search estimates…" value={search} onChange={e => setSearch(e.target.value)}/>
      </div>

      {/* Estimate cards */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
          <p className="text-gray-400 text-sm">{t('est.noEstimates')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(est => {
            const itemsTotal = est.items.reduce((s, i) => s + i.amount * (i.quantity ?? 1), 0);
            const displayAmt = itemsTotal > 0 ? itemsTotal : (est.amount || est.estimate);
            return (
              <div key={est.id} className="bg-white rounded-2xl shadow-sm p-5">
                <div className="flex flex-wrap items-start gap-4 justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-gray-900 text-base">{est.title}</h3>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Estimate</span>
                    </div>
                    <p className="text-sm text-gray-600 font-medium">{est.customer}</p>
                    <div className="flex flex-wrap gap-3 mt-1.5">
                      <span className="text-xs text-gray-400">{fmtDate(est.date)}</span>
                      {est.time && <span className="text-xs text-gray-400">{est.time}</span>}
                      {est.address && <span className="text-xs text-gray-400 truncate max-w-xs">{est.address.split(',')[0]}</span>}
                    </div>
                    {est.items.length > 0 && (
                      <div className="mt-3 space-y-1">
                        {est.items.map(item => (
                          <div key={item.id} className="flex items-center justify-between text-xs text-gray-600">
                            <span>{item.label}{(item.quantity??1) > 1 ? ` ×${item.quantity}` : ''}</span>
                            <span className="font-medium">${(item.amount*(item.quantity??1)).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {est.notes && <p className="text-xs text-gray-400 mt-2 line-clamp-2">{est.notes}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-3 flex-shrink-0">
                    <p className="text-xl font-bold text-gray-900">${displayAmt.toFixed(2)}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setSelected(est); setModal('edit'); }}
                        className="text-sm font-semibold px-3 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors">
                        {t('common.edit')}
                      </button>
                      <button
                        onClick={() => convertToInvoice(est)}
                        className="text-sm font-semibold px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                        </svg>
                        {t('est.convertBtn')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(modal === 'create' || modal === 'edit') && (
        <EstimateFormModal
          initial={modal === 'edit' ? selected ?? undefined : undefined}
          allCustomers={allCustomers}
          pricebook={pricebook}
          onSave={saveEstimate}
          onNewCustomer={addCustomer}
          onClose={() => { setModal('none'); setSelected(null); }}
        />
      )}
    </div>
  );
}
