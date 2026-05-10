'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useAuth } from '../../components/AuthProvider';
import { useT } from '../../lib/i18n';
import { Invoice, InvoiceStatus, PricebookItem, Job, Customer } from '../../lib/fieldproStorage';
import Modal from '../../components/Modal';
import CustomerSearch from '../../components/CustomerSearch';

function uid() { return typeof crypto!=='undefined'&&'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

const INPUT_CLS = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 bg-white";
const LABEL_CLS = "block text-sm font-medium text-gray-700 mb-1.5";

function todayStr() { return new Date().toISOString().split('T')[0]; }
function dueDateStr() { return new Date(Date.now()+14*86400000).toISOString().split('T')[0]; }
function invNum() { return `INV-${Date.now().toString().slice(-6)}`; }

// ─── Pricebook helpers ────────────────────────────────────────────────────────

const CATEGORIES = ['Plumbing','HVAC','Electrical','Roofing','General'];

function detectCategory(label: string): string {
  const n = label.toLowerCase();
  if (/drain|pipe|toilet|faucet|water|leak|plumb|sink|shower|pump|valve/.test(n)) return 'Plumbing';
  if (/ac|heat|air|filter|furnace|duct|hvac|cool|thermostat|ventilat/.test(n)) return 'HVAC';
  if (/wire|outlet|switch|circuit|panel|electric|light|lamp|breaker/.test(n)) return 'Electrical';
  if (/roof|shingle|gutter|siding|window|door|frame/.test(n)) return 'Roofing';
  return 'General';
}

function capitalize(s: string) { return s.split(' ').map(w => w.charAt(0).toUpperCase()+w.slice(1)).join(' '); }

function generateSuggestions(jobs: Job[], existing: PricebookItem[]): PricebookItem[] {
  const map = new Map<string, { prices: number[]; count: number }>();
  for (const job of jobs) {
    for (const item of job.items) {
      const key = item.label.trim().toLowerCase();
      if (!key) continue;
      const e = map.get(key) ?? { prices: [], count: 0 };
      e.prices.push(item.amount);
      e.count++;
      map.set(key, e);
    }
  }
  const existingKeys = new Set(existing.map(e => e.name.toLowerCase()));
  const suggestions: PricebookItem[] = [];
  for (const [key, data] of map.entries()) {
    if (existingKeys.has(key)) continue;
    const avg = Math.round(data.prices.reduce((a,b)=>a+b,0)/data.prices.length);
    suggestions.push({
      id: uid(), category: detectCategory(key), name: capitalize(key),
      description: '', unitPrice: avg, unit: 'flat', timesUsed: data.count,
    });
  }
  return suggestions.sort((a,b) => b.timesUsed - a.timesUsed);
}

// ─── Pricebook CRUD modal ─────────────────────────────────────────────────────

function PricebookFormModal({ initial, onSave, onClose }: {
  initial?: PricebookItem; onSave:(item:PricebookItem)=>void; onClose:()=>void;
}) {
  const t = useT();
  const [f, setF] = useState<PricebookItem>(initial ?? {
    id: uid(), category:'General', name:'', description:'', unitPrice:0, unit:'flat', timesUsed:0,
  });
  const set = <K extends keyof PricebookItem>(k:K, v:PricebookItem[K]) => setF(p=>({...p,[k]:v}));
  const valid = f.name.trim() && f.unitPrice > 0;

  return (
    <Modal title={initial ? t('pb.editTitle') : t('pb.newTitle')} onClose={onClose} size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>{t('pb.name')}</label>
            <input className={INPUT_CLS} value={f.name} onChange={e=>set('name',e.target.value)} placeholder="e.g. Drain Repair"/>
          </div>
          <div>
            <label className={LABEL_CLS}>{t('pb.category')}</label>
            <select className={INPUT_CLS} value={f.category} onChange={e=>set('category',e.target.value)}>
              {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={LABEL_CLS}>{t('pb.desc')}</label>
          <input className={INPUT_CLS} value={f.description} onChange={e=>set('description',e.target.value)} placeholder="Optional description"/>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>{t('pb.price')}</label>
            <input type="number" min={0} step={0.01} className={INPUT_CLS} value={f.unitPrice||''} onChange={e=>set('unitPrice',Number(e.target.value))} placeholder="0.00"/>
          </div>
          <div>
            <label className={LABEL_CLS}>{t('pb.unit')}</label>
            <select className={INPUT_CLS} value={f.unit} onChange={e=>set('unit',e.target.value as PricebookItem['unit'])}>
              <option value="flat">{t('pb.unitFlat')}</option>
              <option value="per hour">{t('pb.unitHour')}</option>
              <option value="per unit">{t('pb.unitEach')}</option>
            </select>
          </div>
        </div>
        <button onClick={()=>{ if(valid) onSave(f); }} disabled={!valid}
          className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {initial ? t('common.save') : t('pb.addItem')}
        </button>
      </div>
    </Modal>
  );
}

// ─── Auto-generate preview modal ──────────────────────────────────────────────

function AutoGenerateModal({ suggestions, onConfirm, onClose }: {
  suggestions: PricebookItem[]; onConfirm:(items:PricebookItem[])=>void; onClose:()=>void;
}) {
  const t = useT();
  const [items, setItems] = useState<PricebookItem[]>(suggestions);
  const [checked, setChecked] = useState<Set<string>>(new Set(suggestions.map(s=>s.id)));

  const toggle = (id: string) => setChecked(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const update = (id: string, patch: Partial<PricebookItem>) =>
    setItems(prev => prev.map(i => i.id===id ? {...i,...patch} : i));

  const CAT_CLS: Record<string,string> = {
    Plumbing:'bg-blue-100 text-blue-700', HVAC:'bg-orange-100 text-orange-700',
    Electrical:'bg-yellow-100 text-yellow-700', Roofing:'bg-purple-100 text-purple-700',
    General:'bg-gray-100 text-gray-600',
  };

  if (suggestions.length === 0) {
    return (
      <Modal title={t('pb.genTitle')} onClose={onClose} size="md">
        <div className="py-10 text-center">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-500 text-sm">{t('pb.noSuggestions')}</p>
          <button onClick={onClose} className="mt-6 px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">{t('common.close')}</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={t('pb.genTitle')} onClose={onClose} size="lg">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">{t('pb.preview')}</p>
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {items.map(item => (
            <div key={item.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${checked.has(item.id)?'border-blue-200 bg-blue-50':'border-gray-100 bg-gray-50 opacity-60'}`}>
              <input type="checkbox" checked={checked.has(item.id)} onChange={()=>toggle(item.id)}
                className="w-4 h-4 rounded accent-blue-600 flex-shrink-0"/>
              <div className="flex-1 grid grid-cols-3 gap-2 items-center">
                <div>
                  <input className="w-full text-sm font-medium bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1 py-0.5" value={item.name}
                    onChange={e=>update(item.id,{name:e.target.value})}/>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CAT_CLS[item.category]??'bg-gray-100 text-gray-600'}`}>{item.category}</span>
                </div>
                <select className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white" value={item.category}
                  onChange={e=>update(item.id,{category:e.target.value})}>
                  {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400">$</span>
                  <input type="number" min={0} className="w-20 text-sm font-semibold border border-gray-200 rounded-lg px-2 py-1.5 bg-white" value={item.unitPrice}
                    onChange={e=>update(item.id,{unitPrice:Number(e.target.value)})}/>
                  <span className="text-xs text-gray-400 whitespace-nowrap">{item.timesUsed>0?`(${item.timesUsed}×)`:''}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors">{t('common.cancel')}</button>
          <button onClick={()=>onConfirm(items.filter(i=>checked.has(i.id)))} disabled={checked.size===0}
            className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {t('pb.addSelected')} ({checked.size})
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Pricebook view ───────────────────────────────────────────────────────────

function PricebookView({ pricebook, jobs, onUpdate }: {
  pricebook: PricebookItem[]; jobs: Job[]; onUpdate:(pb:PricebookItem[])=>void;
}) {
  const t = useT();
  const [activeCat, setActiveCat] = useState('All');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'none'|'new'|'edit'|'generate'>('none');
  const [editing, setEditing] = useState<PricebookItem|null>(null);
  const [suggestions, setSuggestions] = useState<PricebookItem[]>([]);

  const CAT_CLS: Record<string,string> = {
    Plumbing:'bg-blue-100 text-blue-700', HVAC:'bg-orange-100 text-orange-700',
    Electrical:'bg-yellow-100 text-yellow-700', Roofing:'bg-purple-100 text-purple-700',
    General:'bg-gray-100 text-gray-600',
  };

  const filtered = useMemo(() => {
    let list = activeCat==='All' ? pricebook : pricebook.filter(i=>i.category===activeCat);
    if (search.trim()) { const q=search.toLowerCase(); list=list.filter(i=>i.name.toLowerCase().includes(q)||i.description.toLowerCase().includes(q)); }
    return list;
  }, [pricebook, activeCat, search]);

  const handleGenerate = () => {
    const sug = generateSuggestions(jobs, pricebook);
    setSuggestions(sug);
    setModal('generate');
  };

  const saveItem = (item: PricebookItem) => {
    const exists = pricebook.find(i=>i.id===item.id);
    onUpdate(exists ? pricebook.map(i=>i.id===item.id?item:i) : [item,...pricebook]);
    setModal('none'); setEditing(null);
  };

  const deleteItem = (id: string) => {
    if (!confirm(t('pb.delConfirm'))) return;
    onUpdate(pricebook.filter(i=>i.id!==id));
  };

  const addGenerated = (items: PricebookItem[]) => {
    onUpdate([...pricebook, ...items]);
    setModal('none');
  };

  const allCats = ['All', ...CATEGORIES];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {allCats.map(cat => (
            <button key={cat} onClick={()=>setActiveCat(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${activeCat===cat?'bg-blue-600 text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {cat==='All'?t('pb.allCats'):cat}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleGenerate}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-blue-200 text-blue-600 text-sm font-semibold hover:bg-blue-50 transition-colors">
            {t('pb.generate')}
          </button>
          <button onClick={()=>{setEditing(null);setModal('new');}}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
            {t('pb.addItem')}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/></svg>
        <input type="text" placeholder={t('pb.searchPb')} value={search} onChange={e=>setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-gray-50"/>
      </div>

      {/* Item list */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-500 text-sm">{t('pb.noItems')}</p>
            <button onClick={handleGenerate}
              className="mt-4 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
              {t('pb.generate')}
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(item => (
              <div key={item.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${CAT_CLS[item.category]??'bg-gray-100 text-gray-600'}`}>{item.category}</span>
                    <span className="text-sm font-semibold text-gray-900 truncate">{item.name}</span>
                  </div>
                  {item.description && <p className="text-xs text-gray-400 truncate pl-0.5">{item.description}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-base font-bold text-gray-900">${item.unitPrice.toFixed(2)}</p>
                  <p className="text-xs text-gray-400">
                    {item.unit==='flat'?t('pb.unitFlat'):item.unit==='per hour'?t('pb.unitHour'):t('pb.unitEach')}
                    {item.timesUsed > 0 && ` · ${item.timesUsed}× ${t('pb.used')}`}
                  </p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button onClick={()=>{setEditing(item);setModal('edit');}}
                    className="px-3 py-1.5 text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">{t('common.edit')}</button>
                  <button onClick={()=>deleteItem(item.id)}
                    className="px-3 py-1.5 text-xs font-semibold border border-red-100 text-red-400 rounded-lg hover:bg-red-50 transition-colors">{t('common.delete')}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal==='new' && <PricebookFormModal onSave={saveItem} onClose={()=>setModal('none')}/>}
      {modal==='edit' && editing && <PricebookFormModal initial={editing} onSave={saveItem} onClose={()=>{setModal('none');setEditing(null);}}/>}
      {modal==='generate' && <AutoGenerateModal suggestions={suggestions} onConfirm={addGenerated} onClose={()=>setModal('none')}/>}
    </div>
  );
}

// ─── Invoice form modal ───────────────────────────────────────────────────────

interface InvForm { customer:string; jobTitle:string; amount:number; status:InvoiceStatus; issueDate:string; dueDate:string; description:string; }

function InvoiceFormModal({ initial, allCustomers, onSave, onClose }: {
  initial?: Invoice; allCustomers:Customer[]; onSave:(f:InvForm)=>void; onClose:()=>void;
}) {
  const t = useT();
  const [f, setF] = useState<InvForm>(initial ? {
    customer:initial.customer, jobTitle:initial.jobTitle, amount:initial.amount,
    status:initial.status, issueDate:initial.issueDate, dueDate:initial.dueDate, description:initial.description,
  } : { customer:'', jobTitle:'', amount:0, status:'draft', issueDate:todayStr(), dueDate:dueDateStr(), description:'' });

  const set = <K extends keyof InvForm>(k:K, v:InvForm[K]) => setF(p=>({...p,[k]:v}));
  const valid = f.customer.trim() && f.jobTitle.trim() && f.amount>0;

  const STATUS_OPTS: {value:InvoiceStatus;label:string}[] = [
    {value:'draft',label:t('status.draft')},{value:'sent',label:t('status.sent')},
    {value:'paid',label:t('status.paid')},{value:'overdue',label:t('status.overdue')},
  ];

  return (
    <Modal title={initial ? t('inv.saveBtn') : t('inv.create').replace('+ ','')} onClose={onClose} size="md">
      <div className="space-y-4">
        <div>
          <label className={LABEL_CLS}>{t('inv.customer')}</label>
          <CustomerSearch
            customers={allCustomers} value={f.customer}
            onChange={v => set('customer', v)}
            placeholder="Search customer…"
          />
        </div>
        <div>
          <label className={LABEL_CLS}>{t('inv.jobService')}</label>
          <input className={INPUT_CLS} value={f.jobTitle} onChange={e=>set('jobTitle',e.target.value)} placeholder="e.g. Kitchen Sink Repair"/>
        </div>
        <div>
          <label className={LABEL_CLS}>{t('inv.description')}</label>
          <textarea className={INPUT_CLS+' resize-none'} rows={2} value={f.description} onChange={e=>set('description',e.target.value)}/>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>{t('inv.amount')}</label>
            <input type="number" min={0} step={0.01} className={INPUT_CLS} value={f.amount||''} onChange={e=>set('amount',Number(e.target.value))} placeholder="0.00"/>
          </div>
          <div>
            <label className={LABEL_CLS}>{t('inv.status')}</label>
            <select className={INPUT_CLS} value={f.status} onChange={e=>set('status',e.target.value as InvoiceStatus)}>
              {STATUS_OPTS.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>{t('inv.issueDate')}</label>
            <input type="date" className={INPUT_CLS} value={f.issueDate} onChange={e=>set('issueDate',e.target.value)}/>
          </div>
          <div>
            <label className={LABEL_CLS}>{t('inv.dueDate')}</label>
            <input type="date" className={INPUT_CLS} value={f.dueDate} onChange={e=>set('dueDate',e.target.value)}/>
          </div>
        </div>
        <button onClick={()=>{ if(valid) onSave(f); }} disabled={!valid}
          className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {initial ? t('inv.saveBtn') : t('inv.createBtn')}
        </button>
      </div>
    </Modal>
  );
}

function InvoiceDetailModal({ invoice, onEdit, onStatusChange, onClose }: {
  invoice:Invoice; onEdit:()=>void; onStatusChange:(s:InvoiceStatus)=>void; onClose:()=>void;
}) {
  const t = useT();
  const STATUS_CLS: Record<InvoiceStatus,string> = {
    draft:'bg-gray-100 text-gray-600', sent:'bg-blue-100 text-blue-700',
    paid:'bg-emerald-100 text-emerald-700', overdue:'bg-red-100 text-red-700',
  };
  const STATUS_LABEL: Record<InvoiceStatus,string> = {
    draft:t('status.draft'), sent:t('status.sent'), paid:t('status.paid'), overdue:t('status.overdue'),
  };

  return (
    <Modal title={invoice.invoiceNumber} onClose={onClose} size="md">
      <div className="space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-bold text-gray-900">{invoice.customer}</h3>
            <p className="text-sm text-gray-500">{invoice.jobTitle}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_CLS[invoice.status]}`}>{STATUS_LABEL[invoice.status]}</span>
        </div>
        {invoice.description && <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3">{invoice.description}</p>}
        <div className="grid grid-cols-2 gap-3">
          {[
            {label:t('inv.issueDate'),value:invoice.issueDate},
            {label:t('inv.dueDate'),value:invoice.dueDate},
            {label:t('inv.colNum'),value:invoice.invoiceNumber},
            {label:t('inv.colAmount'),value:`$${invoice.amount.toFixed(2)}`},
          ].map(item=>(
            <div key={item.label} className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-0.5">{item.label}</p>
              <p className="text-sm font-semibold text-gray-900">{item.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-blue-50 rounded-xl p-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-blue-800">{t('inv.totalAmount')}</span>
          <span className="text-2xl font-bold text-blue-900">${invoice.amount.toFixed(2)}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={onEdit} className="flex-1 border border-gray-200 text-gray-700 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors">{t('common.edit')}</button>
          {invoice.status==='draft' && (
            <button onClick={()=>onStatusChange('sent')} className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-blue-700 transition-colors">{t('inv.sendInvoice')}</button>
          )}
          {(invoice.status==='sent'||invoice.status==='overdue') && (
            <button onClick={()=>onStatusChange('paid')} className="flex-1 bg-emerald-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-emerald-700 transition-colors">{t('inv.markPaid')}</button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const { data, updateData } = useAuth();
  const t = useT();
  const invoices = data?.invoices ?? [];
  const pricebook = data?.pricebook ?? [];
  const jobs = data?.jobs ?? [];
  const allCustomers = data?.customers ?? [];

  const [view, setView] = useState<'invoices'|'pricebook'|'estimates'>('invoices');
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'none'|'create'|'edit'|'view'>('none');
  const [selected, setSelected] = useState<Invoice|null>(null);

  const estimateJobs = useMemo(() => jobs.filter(j => j.status === 'estimate'), [jobs]);

  const FILTER_TABS = [
    {key:'all',label:t('inv.tabAll')},{key:'draft',label:t('inv.tabDraft')},
    {key:'sent',label:t('inv.tabSent')},{key:'paid',label:t('inv.tabPaid')},{key:'overdue',label:t('inv.tabOverdue')},
  ];

  const STATUS_CLS: Record<string,string> = {
    draft:'bg-gray-100 text-gray-600', sent:'bg-blue-100 text-blue-700',
    paid:'bg-emerald-100 text-emerald-700', overdue:'bg-red-100 text-red-700',
  };
  const STATUS_LABEL: Record<string,string> = {
    draft:t('status.draft'), sent:t('status.sent'), paid:t('status.paid'), overdue:t('status.overdue'),
  };

  const filtered = useMemo(()=>{
    let list = activeTab==='all' ? invoices : invoices.filter(i=>i.status===activeTab);
    if (search.trim()) { const q=search.toLowerCase(); list=list.filter(i=>i.customer.toLowerCase().includes(q)||i.invoiceNumber.toLowerCase().includes(q)||i.jobTitle.toLowerCase().includes(q)); }
    return list;
  }, [invoices, activeTab, search]);

  const stats = useMemo(()=>({
    total:invoices.length,
    revenue:invoices.filter(i=>i.status==='paid').reduce((s,i)=>s+i.amount,0),
    pending:invoices.filter(i=>i.status==='sent').reduce((s,i)=>s+i.amount,0),
    overdue:invoices.filter(i=>i.status==='overdue').reduce((s,i)=>s+i.amount,0),
  }), [invoices]);

  const saveInvoice = (f: InvForm, existingId?: string) => {
    if (!data) return;
    if (existingId) {
      updateData({...data, invoices:data.invoices.map(i=>i.id===existingId?{...i,...f}:i)});
    } else {
      const newInv: Invoice = { id:uid(), invoiceNumber:invNum(), ...f };
      updateData({...data, invoices:[newInv,...data.invoices]});
    }
    setModal('none'); setSelected(null);
  };

  const changeStatus = (id: string, status: InvoiceStatus) => {
    if (!data) return;
    updateData({...data, invoices:data.invoices.map(i=>i.id===id?{...i,status}:i)});
    setSelected(prev=>prev&&prev.id===id?{...prev,status}:prev);
  };

  const deleteInvoice = (id: string) => {
    if (!data || !confirm(t('inv.deleteConfirm'))) return;
    updateData({...data, invoices:data.invoices.filter(i=>i.id!==id)});
    setModal('none'); setSelected(null);
  };

  const updatePricebook = useCallback((pb: PricebookItem[]) => {
    if (!data) return;
    updateData({...data, pricebook: pb});
  }, [data, updateData]);

  const convertJobToInvoice = useCallback((job: Job) => {
    if (!data) return;
    const inv: Invoice = {
      id: uid(), invoiceNumber: invNum(),
      customer: job.customer, jobTitle: job.title,
      amount: job.amount > 0 ? job.amount : job.estimate,
      status: 'sent',
      issueDate: todayStr(), dueDate: dueDateStr(),
      description: job.notes || `Services for ${job.title}`,
    };
    updateData({
      ...data,
      invoices: [...(data.invoices ?? []), inv],
      jobs: data.jobs.map(j => j.id === job.id ? {...j, status: 'invoice-sent' as const} : j),
    });
  }, [data, updateData]);

  useEffect(() => {
    const gc = sessionStorage.getItem('global-create');
    if (gc) {
      try {
        const parsed = JSON.parse(gc);
        if (parsed.type === 'invoice') { sessionStorage.removeItem('global-create'); setModal('create'); setSelected(null); }
      } catch { sessionStorage.removeItem('global-create'); }
    }
    const handler = (e: Event) => {
      const { type } = (e as CustomEvent<{type:string}>).detail;
      if (type === 'invoice') { setModal('create'); setSelected(null); }
    };
    window.addEventListener('global-create', handler);
    return () => window.removeEventListener('global-create', handler);
  }, []);

  return (
    <div className="space-y-5">
      {/* Page header with view toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          <button onClick={()=>setView('invoices')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${view==='invoices'?'bg-white text-gray-900 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>
            {t('pb.invoicesView')}
          </button>
          <button onClick={()=>setView('estimates')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 ${view==='estimates'?'bg-white text-gray-900 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>
            {t('inv.tabEstimates')}
            {estimateJobs.length > 0 && <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-semibold">{estimateJobs.length}</span>}
          </button>
          <button onClick={()=>setView('pricebook')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 ${view==='pricebook'?'bg-white text-gray-900 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>
            📋 {t('pb.view')}
            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">{pricebook.length}</span>
          </button>
        </div>
        {view==='invoices' && (
          <button onClick={()=>{setModal('create');setSelected(null);}}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
            {t('inv.create')}
          </button>
        )}
      </div>

      {/* Pricebook view */}
      {view==='pricebook' && (
        <PricebookView pricebook={pricebook} jobs={jobs} onUpdate={updatePricebook}/>
      )}

      {/* Estimates view */}
      {view==='estimates' && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-sm text-gray-500">Jobs with <span className="font-semibold text-indigo-700">estimate</span> status — convert to invoice when approved</p>
          </div>
          {estimateJobs.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">{t('inv.noEstimates')}</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {estimateJobs.map(job => (
                <div key={job.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{job.customer}</p>
                    <p className="text-sm text-gray-500 truncate">{job.title}</p>
                    <p className="text-xs text-gray-400">{job.date}{job.technician ? ` · ${job.technician}` : ''}</p>
                  </div>
                  <div className="text-right flex-shrink-0 mr-3">
                    <p className="text-base font-bold text-gray-900">${(job.amount > 0 ? job.amount : job.estimate).toFixed(2)}</p>
                  </div>
                  <button onClick={() => convertJobToInvoice(job)}
                    className="flex-shrink-0 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors whitespace-nowrap">
                    {t('inv.convertInvoice')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Invoices view */}
      {view==='invoices' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {label:t('inv.totalInvoices'),value:stats.total,color:'bg-blue-600'},
              {label:t('inv.revenue'),value:`$${stats.revenue.toFixed(0)}`,color:'bg-emerald-500'},
              {label:t('inv.pending'),value:`$${stats.pending.toFixed(0)}`,color:'bg-orange-500'},
              {label:t('inv.overdue'),value:`$${stats.overdue.toFixed(0)}`,color:'bg-red-500'},
            ].map(s=>(
              <div key={s.label} className={`${s.color} rounded-2xl p-4 text-white`}>
                <p className="text-xs opacity-80">{s.label}</p>
                <p className="text-2xl font-bold mt-1">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center border-b border-gray-100 px-4 pt-3 gap-1 overflow-x-auto">
              {FILTER_TABS.map(tab=>{
                const active = activeTab===tab.key;
                return (
                  <button key={tab.key} onClick={()=>setActiveTab(tab.key)}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${active?'border-b-2 border-blue-600 text-blue-600':'text-gray-500 hover:text-gray-800'}`}>
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="px-4 py-3 border-b border-gray-100">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/></svg>
                <input type="text" placeholder={t('inv.searchPlaceholder')} value={search}
                  onChange={e=>setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-gray-50"/>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {[t('inv.colNum'),t('inv.colCustomer'),t('inv.colJob'),t('inv.colAmount'),t('inv.colStatus'),t('inv.colIssue'),t('inv.colDue'),t('inv.colActions')].map(h=>(
                      <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(inv=>{
                    const cls = STATUS_CLS[inv.status];
                    return (
                      <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-4 font-semibold text-gray-700 whitespace-nowrap">{inv.invoiceNumber}</td>
                        <td className="px-4 py-4 font-medium text-gray-900 whitespace-nowrap">{inv.customer}</td>
                        <td className="px-4 py-4 text-gray-600 max-w-[150px]"><span className="truncate block">{inv.jobTitle}</span></td>
                        <td className="px-4 py-4 font-semibold text-gray-900 whitespace-nowrap">${inv.amount.toFixed(2)}</td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${cls}`}>{STATUS_LABEL[inv.status]??inv.status}</span>
                        </td>
                        <td className="px-4 py-4 text-gray-500 whitespace-nowrap">{inv.issueDate}</td>
                        <td className="px-4 py-4 text-gray-500 whitespace-nowrap">{inv.dueDate}</td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button onClick={()=>{setSelected(inv);setModal('view');}}
                              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">{t('common.view')}</button>
                            {inv.status==='draft' && (
                              <button onClick={()=>changeStatus(inv.id,'sent')}
                                className="border border-blue-200 text-blue-600 hover:bg-blue-50 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">{t('common.send')}</button>
                            )}
                            {(inv.status==='sent'||inv.status==='overdue') && (
                              <button onClick={()=>changeStatus(inv.id,'paid')}
                                className="border border-emerald-200 text-emerald-600 hover:bg-emerald-50 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">{t('inv.markPaid')}</button>
                            )}
                            <button onClick={()=>deleteInvoice(inv.id)}
                              className="border border-red-100 text-red-400 hover:bg-red-50 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">{t('common.delete')}</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length===0 && <div className="text-center py-14 text-gray-400 text-sm">{t('inv.noInvoices')}</div>}
            </div>
          </div>
        </>
      )}

      {modal==='create' && <InvoiceFormModal allCustomers={allCustomers} onSave={f=>saveInvoice(f)} onClose={()=>setModal('none')}/>}
      {modal==='edit' && selected && <InvoiceFormModal initial={selected} allCustomers={allCustomers} onSave={f=>saveInvoice(f,selected.id)} onClose={()=>setModal('none')}/>}
      {modal==='view' && selected && (
        <InvoiceDetailModal invoice={selected}
          onEdit={()=>setModal('edit')}
          onStatusChange={s=>changeStatus(selected.id,s)}
          onClose={()=>{setModal('none');setSelected(null);}}/>
      )}
    </div>
  );
}
