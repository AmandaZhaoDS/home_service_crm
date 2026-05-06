'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../../components/AuthProvider';
import { Customer } from '../../lib/fieldproStorage';
import Modal from '../../components/Modal';

const AVATAR_COLORS = ['bg-blue-500','bg-emerald-500','bg-orange-400','bg-violet-500','bg-teal-500','bg-pink-500','bg-amber-500','bg-cyan-500'];
function avatarColor(name: string) { let h=0; for (const c of name) h=(h*31+c.charCodeAt(0))%AVATAR_COLORS.length; return AVATAR_COLORS[Math.abs(h)]; }
function initials(name: string) { return name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2); }
function uid() { return typeof crypto!=='undefined'&&'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

const INPUT_CLS = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 bg-white";
const LABEL_CLS = "block text-sm font-medium text-gray-700 mb-1.5";

interface GoogleContact { id: string; name: string; email: string; phone: string; address: string; }

function ImportContactsModal({ contacts, onImport, onClose }: {
  contacts: GoogleContact[];
  onImport: (selectedIds: string[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  return (
    <Modal title={`Import Contacts (${contacts.length})`} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="flex gap-2">
          <button onClick={() => setSelected(new Set(contacts.map(c => c.id)))}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg">
            Select All
          </button>
          <button onClick={() => setSelected(new Set())}
            className="text-xs font-semibold text-gray-600 hover:text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg">
            Clear All
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-50">
          {contacts.map(contact => (
            <div key={contact.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors">
              <input type="checkbox" checked={selected.has(contact.id)}
                onChange={e => {
                  const next = new Set(selected);
                  e.target.checked ? next.add(contact.id) : next.delete(contact.id);
                  setSelected(next);
                }}
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
          Import {selected.size > 0 ? `${selected.size} Contact${selected.size !== 1 ? 's' : ''}` : 'Contacts'}
        </button>
      </div>
    </Modal>
  );
}

interface FormData { name:string; email:string; phone:string; address:string; }
function blankForm(): FormData { return {name:'',email:'',phone:'',address:''}; }
function custToForm(c: Customer): FormData { return {name:c.name,email:c.email,phone:c.phone,address:c.address}; }

// ─── Customer Form Modal ──────────────────────────────────────────────────────

function CustomerFormModal({ initial, onSave, onClose }: {
  initial?: Customer; onSave:(f:FormData)=>void; onClose:()=>void;
}) {
  const [f, setF] = useState<FormData>(initial ? custToForm(initial) : blankForm());
  const set = <K extends keyof FormData>(k:K,v:string) => setF(p=>({...p,[k]:v}));
  const valid = f.name.trim() && f.email.trim();

  return (
    <Modal title={initial ? 'Edit Customer' : 'Add Customer'} onClose={onClose} size="md">
      <div className="space-y-4">
        <div>
          <label className={LABEL_CLS}>Full Name *</label>
          <input className={INPUT_CLS} value={f.name} onChange={e=>set('name',e.target.value)} placeholder="Jane Smith"/>
        </div>
        <div>
          <label className={LABEL_CLS}>Email *</label>
          <input type="email" className={INPUT_CLS} value={f.email} onChange={e=>set('email',e.target.value)} placeholder="jane@example.com"/>
        </div>
        <div>
          <label className={LABEL_CLS}>Phone</label>
          <input type="tel" className={INPUT_CLS} value={f.phone} onChange={e=>set('phone',e.target.value)} placeholder="(555) 123-4567"/>
        </div>
        <div>
          <label className={LABEL_CLS}>Address</label>
          <input className={INPUT_CLS} value={f.address} onChange={e=>set('address',e.target.value)} placeholder="123 Main St, San Jose, CA"/>
        </div>
        <button onClick={()=>{ if(valid) onSave(f); }} disabled={!valid}
          className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {initial ? 'Save Changes' : 'Add Customer'}
        </button>
      </div>
    </Modal>
  );
}

// ─── Customer Detail Modal ────────────────────────────────────────────────────

function CustomerDetailModal({ customer, jobs, onEdit, onClose }: {
  customer: Customer;
  jobs: { title:string; status:string; date:string; amount:number }[];
  onEdit: ()=>void; onClose: ()=>void;
}) {
  const totalSpent = jobs.filter(j=>j.status==='paid').reduce((s,j)=>s+j.amount,0);

  return (
    <Modal title="Customer Details" onClose={onClose} size="md">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl ${avatarColor(customer.name)} flex items-center justify-center text-white text-xl font-bold flex-shrink-0`}>
            {initials(customer.name)}
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">{customer.name}</h3>
            <p className="text-sm text-gray-500">{customer.email}</p>
          </div>
        </div>

        {/* Info */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label:'Phone', value:customer.phone||'—' },
            { label:'Address', value:customer.address||'—' },
            { label:'Total Jobs', value:jobs.length.toString() },
            { label:'Total Paid', value:`$${totalSpent.toFixed(2)}` },
          ].map(item=>(
            <div key={item.label} className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-0.5">{item.label}</p>
              <p className="text-sm font-semibold text-gray-900">{item.value}</p>
            </div>
          ))}
        </div>

        {/* Recent Jobs */}
        {jobs.length>0 && (
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Job History</p>
            <div className="space-y-2">
              {jobs.slice(0,5).map((j,i)=>(
                <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{j.title}</p>
                    <p className="text-xs text-gray-500">{j.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">${j.amount.toFixed(2)}</p>
                    <p className="text-xs text-gray-500 capitalize">{j.status.replace('-',' ')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={onEdit} className="w-full border border-gray-200 text-gray-700 font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
          Edit Customer
        </button>
      </div>
    </Modal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const { user, data, updateData } = useAuth();
  const customers = data?.customers ?? [];
  const jobs = data?.jobs ?? [];

  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'none'|'create'|'edit'|'view'>('none');
  const [selected, setSelected] = useState<Customer|null>(null);

  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleContacts, setGoogleContacts] = useState<GoogleContact[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    fetch(`/api/google/status?userId=${user.id}`)
      .then(r => r.json())
      .then(({ connected }) => setGoogleConnected(connected))
      .catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('google_connected') === 'true') {
      setGoogleConnected(true);
      window.history.replaceState({}, '', '/customers');
    }
  }, []);

  const handleConnectGoogle = () => {
    if (!user?.id) return;
    window.location.href = `/api/google/auth?userId=${user.id}&returnTo=/customers`;
  };

  const handleDisconnectGoogle = async () => {
    if (!user?.id || !confirm('Disconnect Google account?')) return;
    try {
      await fetch('/api/google/disconnect', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      setGoogleConnected(false);
      setGoogleContacts([]);
    } catch { alert('Failed to disconnect'); }
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

  const handleImportContacts = (selectedIds: string[]) => {
    if (!data) return;
    const toAdd = googleContacts
      .filter(c => selectedIds.includes(c.id))
      .filter(c => !(data.customers ?? []).some(ex => ex.name === c.name))
      .map(c => ({ id: uid(), name: c.name, email: c.email, phone: c.phone, address: c.address, totalJobs: 0, totalSpent: 0, lastService: new Date().toISOString().split('T')[0] }));
    if (toAdd.length > 0) {
      updateData({ ...data, customers: [...(data.customers ?? []), ...toAdd] });
      setShowImportModal(false);
      alert(`Imported ${toAdd.length} contact${toAdd.length !== 1 ? 's' : ''}`);
    } else {
      alert('All selected contacts are already in your customer list');
    }
  };

  const filtered = useMemo(()=>{
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(c=>c.name.toLowerCase().includes(q)||c.email.toLowerCase().includes(q)||c.phone.includes(q));
  }, [customers, search]);

  const saveCustomer = (f: FormData, existingId?: string) => {
    if (!data) return;
    if (existingId) {
      updateData({...data, customers:data.customers.map(c=>c.id===existingId?{...c,...f}:c)});
    } else {
      const newCust: Customer = {
        id:uid(), ...f,
        totalJobs:0, totalSpent:0,
        lastService:new Date().toISOString().split('T')[0],
      };
      updateData({...data, customers:[newCust,...data.customers]});
    }
    setModal('none'); setSelected(null);
  };

  const deleteCustomer = (id: string) => {
    if (!data || !confirm('Delete this customer?')) return;
    updateData({...data, customers:data.customers.filter(c=>c.id!==id)});
    setModal('none'); setSelected(null);
  };

  const totalRevenue = customers.reduce((s,c)=>{
    return s + jobs.filter(j=>j.customer===c.name&&j.status==='paid').reduce((a,j)=>a+j.amount,0);
  },0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
        <button onClick={()=>{setModal('create');setSelected(null);}}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
          + Add Customer
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label:'Total Customers', value:customers.length, color:'bg-blue-600' },
          { label:'Total Jobs', value:jobs.length, color:'bg-emerald-500' },
          { label:'Total Revenue', value:`$${totalRevenue.toFixed(0)}`, color:'bg-indigo-600' },
        ].map(stat=>(
          <div key={stat.label} className={`${stat.color} rounded-2xl p-4 text-white`}>
            <p className="text-sm opacity-80">{stat.label}</p>
            <p className="text-3xl font-bold mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Google Connect Banner */}
      {!googleConnected && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900">Import Customers from Google Contacts</h3>
              <p className="text-sm text-blue-700 mt-1">Connect Google to import your contacts directly as customers.</p>
            </div>
            <button onClick={handleConnectGoogle}
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
            <p className="text-sm text-green-700 mt-0.5">Import contacts from Google to add them as customers</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleFetchContacts} disabled={isLoadingGoogle}
              className="text-sm font-semibold text-green-700 bg-white border border-green-300 px-3 py-1.5 rounded-lg hover:bg-green-50 disabled:opacity-50 transition-colors">
              {isLoadingGoogle ? 'Loading...' : '📇 Import Contacts'}
            </button>
            <button onClick={handleDisconnectGoogle}
              className="text-sm font-semibold text-red-600 hover:text-red-700 px-3 py-1.5">
              Disconnect
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/></svg>
            <input type="text" placeholder="Search by name, email, or phone..." value={search}
              onChange={e=>setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-gray-50"/>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Customer','Contact','Address','Jobs','Last Service','Actions'].map(h=>(
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(c=>{
                const custJobs = jobs.filter(j=>j.customer===c.name);
                return (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full ${avatarColor(c.name)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>{initials(c.name)}</div>
                        <p className="font-semibold text-gray-900">{c.name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-gray-700">{c.email}</p>
                      <p className="text-xs text-gray-500">{c.phone}</p>
                    </td>
                    <td className="px-4 py-4 text-gray-600 max-w-[180px]">
                      <span className="truncate block">{c.address||'—'}</span>
                    </td>
                    <td className="px-4 py-4 text-gray-700 font-medium">{custJobs.length}</td>
                    <td className="px-4 py-4 text-gray-500">{c.lastService||'—'}</td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button onClick={()=>{setSelected(c);setModal('view');}}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">View</button>
                        <button onClick={()=>{setSelected(c);setModal('edit');}}
                          className="border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">Edit</button>
                        <button onClick={()=>deleteCustomer(c.id)}
                          className="border border-red-100 text-red-400 hover:bg-red-50 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length===0 && <div className="text-center py-14 text-gray-400 text-sm">No customers found.</div>}
        </div>
      </div>

      {/* Modals */}
      {modal==='create' && (
        <CustomerFormModal onSave={f=>saveCustomer(f)} onClose={()=>setModal('none')}/>
      )}
      {modal==='edit' && selected && (
        <CustomerFormModal initial={selected} onSave={f=>saveCustomer(f,selected.id)} onClose={()=>setModal('none')}/>
      )}
      {modal==='view' && selected && (
        <CustomerDetailModal
          customer={selected}
          jobs={jobs.filter(j=>j.customer===selected.name).map(j=>({title:j.title,status:j.status,date:j.date,amount:j.amount}))}
          onEdit={()=>setModal('edit')}
          onClose={()=>{setModal('none');setSelected(null);}}/>
      )}
      {showImportModal && (
        <ImportContactsModal contacts={googleContacts} onImport={handleImportContacts} onClose={() => setShowImportModal(false)}/>
      )}
    </div>
  );
}
