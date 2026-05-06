'use client';

import { useState, useMemo } from 'react';
import { useAuth } from '../../components/AuthProvider';
import { Invoice, InvoiceStatus } from '../../lib/fieldproStorage';
import Modal from '../../components/Modal';

function uid() { return typeof crypto!=='undefined'&&'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

const STATUS_CONFIG: Record<InvoiceStatus,{label:string;cls:string}> = {
  draft:   { label:'Draft',   cls:'bg-gray-100 text-gray-600' },
  sent:    { label:'Sent',    cls:'bg-blue-100 text-blue-700' },
  paid:    { label:'Paid',    cls:'bg-emerald-100 text-emerald-700' },
  overdue: { label:'Overdue', cls:'bg-red-100 text-red-700' },
};

const INPUT_CLS = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 bg-white";
const LABEL_CLS = "block text-sm font-medium text-gray-700 mb-1.5";

function todayStr() { return new Date().toISOString().split('T')[0]; }
function dueDateStr() { return new Date(Date.now()+14*86400000).toISOString().split('T')[0]; }
function invNum() { return `INV-${Date.now().toString().slice(-6)}`; }

// ─── Invoice Form Modal ───────────────────────────────────────────────────────

interface FormData { customer:string; jobTitle:string; amount:number; status:InvoiceStatus; issueDate:string; dueDate:string; description:string; }

function InvoiceFormModal({ initial, customers, onSave, onClose }: {
  initial?: Invoice; customers: string[]; onSave:(f:FormData)=>void; onClose:()=>void;
}) {
  const [f, setF] = useState<FormData>(initial ? {
    customer:initial.customer, jobTitle:initial.jobTitle, amount:initial.amount,
    status:initial.status, issueDate:initial.issueDate, dueDate:initial.dueDate, description:initial.description,
  } : { customer:'', jobTitle:'', amount:0, status:'draft', issueDate:todayStr(), dueDate:dueDateStr(), description:'' });

  const set = <K extends keyof FormData>(k:K, v:FormData[K]) => setF(p=>({...p,[k]:v}));
  const valid = f.customer.trim() && f.jobTitle.trim() && f.amount>0;

  return (
    <Modal title={initial ? 'Edit Invoice' : 'New Invoice'} onClose={onClose} size="md">
      <div className="space-y-4">
        <div>
          <label className={LABEL_CLS}>Customer *</label>
          <input className={INPUT_CLS} list="inv-cust-list" value={f.customer} onChange={e=>set('customer',e.target.value)} placeholder="Customer name"/>
          <datalist id="inv-cust-list">{customers.map(c=><option key={c} value={c}/>)}</datalist>
        </div>
        <div>
          <label className={LABEL_CLS}>Job / Service *</label>
          <input className={INPUT_CLS} value={f.jobTitle} onChange={e=>set('jobTitle',e.target.value)} placeholder="e.g. Kitchen Sink Repair"/>
        </div>
        <div>
          <label className={LABEL_CLS}>Description</label>
          <textarea className={INPUT_CLS+' resize-none'} rows={2} value={f.description} onChange={e=>set('description',e.target.value)} placeholder="Services provided..."/>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>Amount ($) *</label>
            <input type="number" min={0} step={0.01} className={INPUT_CLS} value={f.amount||''} onChange={e=>set('amount',Number(e.target.value))} placeholder="0.00"/>
          </div>
          <div>
            <label className={LABEL_CLS}>Status</label>
            <select className={INPUT_CLS} value={f.status} onChange={e=>set('status',e.target.value as InvoiceStatus)}>
              {(Object.keys(STATUS_CONFIG) as InvoiceStatus[]).map(s=><option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>Issue Date</label>
            <input type="date" className={INPUT_CLS} value={f.issueDate} onChange={e=>set('issueDate',e.target.value)}/>
          </div>
          <div>
            <label className={LABEL_CLS}>Due Date</label>
            <input type="date" className={INPUT_CLS} value={f.dueDate} onChange={e=>set('dueDate',e.target.value)}/>
          </div>
        </div>
        <button onClick={()=>{ if(valid) onSave(f); }} disabled={!valid}
          className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {initial ? 'Save Changes' : 'Create Invoice'}
        </button>
      </div>
    </Modal>
  );
}

// ─── Invoice Detail Modal ─────────────────────────────────────────────────────

function InvoiceDetailModal({ invoice, onEdit, onStatusChange, onClose }: {
  invoice: Invoice; onEdit:()=>void; onStatusChange:(s:InvoiceStatus)=>void; onClose:()=>void;
}) {
  const badge = STATUS_CONFIG[invoice.status];
  return (
    <Modal title={invoice.invoiceNumber} onClose={onClose} size="md">
      <div className="space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-bold text-gray-900">{invoice.customer}</h3>
            <p className="text-sm text-gray-500">{invoice.jobTitle}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${badge.cls}`}>{badge.label}</span>
        </div>

        {invoice.description && (
          <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3">{invoice.description}</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          {[
            { label:'Issue Date', value:invoice.issueDate },
            { label:'Due Date', value:invoice.dueDate },
            { label:'Invoice #', value:invoice.invoiceNumber },
            { label:'Amount', value:`$${invoice.amount.toFixed(2)}` },
          ].map(item=>(
            <div key={item.label} className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-0.5">{item.label}</p>
              <p className="text-sm font-semibold text-gray-900">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-blue-50 rounded-xl p-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-blue-800">Total Amount</span>
          <span className="text-2xl font-bold text-blue-900">${invoice.amount.toFixed(2)}</span>
        </div>

        <div className="flex gap-2">
          <button onClick={onEdit} className="flex-1 border border-gray-200 text-gray-700 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors">Edit</button>
          {invoice.status==='draft' && (
            <button onClick={()=>onStatusChange('sent')} className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-blue-700 transition-colors">Send Invoice</button>
          )}
          {invoice.status==='sent' && (
            <button onClick={()=>onStatusChange('paid')} className="flex-1 bg-emerald-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-emerald-700 transition-colors">Mark as Paid</button>
          )}
          {invoice.status==='overdue' && (
            <button onClick={()=>onStatusChange('paid')} className="flex-1 bg-emerald-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-emerald-700 transition-colors">Mark as Paid</button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const FILTER_TABS = [
  { key:'all', label:'All' },
  { key:'draft', label:'Draft' },
  { key:'sent', label:'Sent' },
  { key:'paid', label:'Paid' },
  { key:'overdue', label:'Overdue' },
];

export default function InvoicesPage() {
  const { data, updateData } = useAuth();
  const invoices = data?.invoices ?? [];
  const customerNames = [...new Set((data?.customers??[]).map(c=>c.name))];

  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'none'|'create'|'edit'|'view'>('none');
  const [selected, setSelected] = useState<Invoice|null>(null);

  const filtered = useMemo(()=>{
    let list = activeTab==='all' ? invoices : invoices.filter(i=>i.status===activeTab);
    if (search.trim()) { const q=search.toLowerCase(); list=list.filter(i=>i.customer.toLowerCase().includes(q)||i.invoiceNumber.toLowerCase().includes(q)||i.jobTitle.toLowerCase().includes(q)); }
    return list;
  }, [invoices, activeTab, search]);

  const stats = useMemo(()=>({
    total: invoices.length,
    revenue: invoices.filter(i=>i.status==='paid').reduce((s,i)=>s+i.amount,0),
    pending: invoices.filter(i=>i.status==='sent').reduce((s,i)=>s+i.amount,0),
    overdue: invoices.filter(i=>i.status==='overdue').reduce((s,i)=>s+i.amount,0),
  }), [invoices]);

  const saveInvoice = (f: FormData & {customer:string;jobTitle:string;amount:number;status:InvoiceStatus;issueDate:string;dueDate:string;description:string}, existingId?: string) => {
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
    const updated = data.invoices.map(i=>i.id===id?{...i,status}:i);
    updateData({...data, invoices:updated});
    setSelected(prev=>prev&&prev.id===id?{...prev,status}:prev);
  };

  const deleteInvoice = (id: string) => {
    if (!data || !confirm('Delete this invoice?')) return;
    updateData({...data, invoices:data.invoices.filter(i=>i.id!==id)});
    setModal('none'); setSelected(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
        <button onClick={()=>{setModal('create');setSelected(null);}}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
          + Create Invoice
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label:'Total Invoices', value:stats.total,          color:'bg-blue-600' },
          { label:'Revenue',        value:`$${stats.revenue.toFixed(0)}`,  color:'bg-emerald-500' },
          { label:'Pending',        value:`$${stats.pending.toFixed(0)}`,  color:'bg-orange-500' },
          { label:'Overdue',        value:`$${stats.overdue.toFixed(0)}`,  color:'bg-red-500' },
        ].map(s=>(
          <div key={s.label} className={`${s.color} rounded-2xl p-4 text-white`}>
            <p className="text-xs opacity-80">{s.label}</p>
            <p className="text-2xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="flex items-center border-b border-gray-100 px-4 pt-3 gap-1 overflow-x-auto">
          {FILTER_TABS.map(tab=>{
            const active = activeTab===tab.key;
            return (
              <button key={tab.key} onClick={()=>setActiveTab(tab.key)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${
                  active ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-800'
                }`}>
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/></svg>
            <input type="text" placeholder="Search invoices..." value={search}
              onChange={e=>setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-gray-50"/>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Invoice #','Customer','Job','Amount','Status','Issue Date','Due Date','Actions'].map(h=>(
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(inv=>{
                const badge = STATUS_CONFIG[inv.status];
                return (
                  <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-4 font-semibold text-gray-700 whitespace-nowrap">{inv.invoiceNumber}</td>
                    <td className="px-4 py-4 font-medium text-gray-900 whitespace-nowrap">{inv.customer}</td>
                    <td className="px-4 py-4 text-gray-600 max-w-[150px]"><span className="truncate block">{inv.jobTitle}</span></td>
                    <td className="px-4 py-4 font-semibold text-gray-900 whitespace-nowrap">${inv.amount.toFixed(2)}</td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${badge.cls}`}>{badge.label}</span>
                    </td>
                    <td className="px-4 py-4 text-gray-500 whitespace-nowrap">{inv.issueDate}</td>
                    <td className="px-4 py-4 text-gray-500 whitespace-nowrap">{inv.dueDate}</td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button onClick={()=>{setSelected(inv);setModal('view');}}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">View</button>
                        {inv.status==='draft' && (
                          <button onClick={()=>changeStatus(inv.id,'sent')}
                            className="border border-blue-200 text-blue-600 hover:bg-blue-50 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">Send</button>
                        )}
                        {(inv.status==='sent'||inv.status==='overdue') && (
                          <button onClick={()=>changeStatus(inv.id,'paid')}
                            className="border border-emerald-200 text-emerald-600 hover:bg-emerald-50 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">Mark Paid</button>
                        )}
                        <button onClick={()=>deleteInvoice(inv.id)}
                          className="border border-red-100 text-red-400 hover:bg-red-50 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length===0 && <div className="text-center py-14 text-gray-400 text-sm">No invoices found.</div>}
        </div>
      </div>

      {/* Modals */}
      {modal==='create' && (
        <InvoiceFormModal customers={customerNames} onSave={f=>saveInvoice(f as Parameters<typeof saveInvoice>[0])} onClose={()=>setModal('none')}/>
      )}
      {modal==='edit' && selected && (
        <InvoiceFormModal initial={selected} customers={customerNames} onSave={f=>saveInvoice(f as Parameters<typeof saveInvoice>[0],selected.id)} onClose={()=>setModal('none')}/>
      )}
      {modal==='view' && selected && (
        <InvoiceDetailModal invoice={selected}
          onEdit={()=>setModal('edit')}
          onStatusChange={s=>changeStatus(selected.id,s)}
          onClose={()=>{setModal('none');setSelected(null);}}/>
      )}
    </div>
  );
}
