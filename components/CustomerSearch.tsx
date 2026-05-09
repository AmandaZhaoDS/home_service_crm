'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Customer } from '../lib/fieldproStorage';

const INPUT_CLS = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 bg-white";
const LABEL_CLS = "block text-sm font-medium text-gray-700 mb-1.5";

function uid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface Props {
  customers: Customer[];
  value: string;
  onChange: (name: string) => void;
  onNewCustomer?: (c: Customer) => void;
  placeholder?: string;
  className?: string;
}

interface NewForm { name: string; email: string; phone: string; address: string; }

export default function CustomerSearch({ customers, value, onChange, onNewCustomer, placeholder, className }: Props) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<NewForm>({ name: '', email: '', phone: '', address: '' });
  const ref = useRef<HTMLDivElement>(null);

  // Keep query in sync when value is changed externally (e.g. form reset)
  useEffect(() => { setQuery(value); }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = query.trim().length === 0
    ? customers.slice(0, 8)
    : customers.filter(c => c.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8);

  const selectedCustomer = customers.find(c => c.name === value) ?? null;

  const pick = useCallback((c: Customer) => {
    setQuery(c.name);
    onChange(c.name);
    setOpen(false);
  }, [onChange]);

  const handleInput = (v: string) => {
    setQuery(v);
    onChange(v);
    setOpen(true);
  };

  const handleCreateSave = () => {
    if (!form.name.trim()) return;
    const newCust: Customer = {
      id: uid(),
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      totalJobs: 0,
      totalSpent: 0,
      lastService: new Date().toISOString().split('T')[0],
    };
    onNewCustomer?.(newCust);
    setQuery(newCust.name);
    onChange(newCust.name);
    setShowCreate(false);
    setOpen(false);
    setForm({ name: '', email: '', phone: '', address: '' });
  };

  return (
    <div className={`relative ${className ?? ''}`} ref={ref}>
      <input
        className={INPUT_CLS}
        value={query}
        placeholder={placeholder ?? 'Search customer…'}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />

      {/* Dropdown */}
      {open && (
        <div className="absolute z-[55] top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden max-h-72 overflow-y-auto">
          {filtered.length === 0 && query.trim() && (
            <p className="px-4 py-3 text-sm text-gray-400">No match — create below.</p>
          )}
          {filtered.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => pick(c)}
              className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0"
            >
              <p className="text-sm font-semibold text-gray-900">{c.name}</p>
              <div className="flex gap-3 mt-0.5">
                {c.phone && <span className="text-xs text-gray-500">{c.phone}</span>}
                {c.address && <span className="text-xs text-gray-400 truncate">{c.address.split(',')[0]}</span>}
              </div>
            </button>
          ))}
          {onNewCustomer && (
            <button
              type="button"
              onClick={() => { setShowCreate(true); setOpen(false); }}
              className="w-full text-left px-4 py-3 text-sm font-semibold text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-2 border-t border-gray-100"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
              New Customer
            </button>
          )}
        </div>
      )}

      {/* Selected customer info card */}
      {selectedCustomer && !open && (selectedCustomer.phone || selectedCustomer.address) && (
        <div className="mt-1.5 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-3">
          <div className="flex-1 min-w-0 space-y-0.5">
            {selectedCustomer.phone && (
              <a href={`tel:${selectedCustomer.phone.replace(/\D/g,'')}`}
                className="flex items-center gap-1.5 text-xs text-blue-700 font-medium hover:underline">
                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                </svg>
                {selectedCustomer.phone}
              </a>
            )}
            {selectedCustomer.address && (
              <p className="text-xs text-gray-500 truncate">{selectedCustomer.address}</p>
            )}
          </div>
        </div>
      )}

      {/* Inline new-customer mini form */}
      {showCreate && (
        <div className="mt-2 p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
          <p className="text-sm font-semibold text-gray-800">New Customer</p>
          <div>
            <label className={LABEL_CLS}>Name *</label>
            <input className={INPUT_CLS} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" autoFocus/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Phone</label>
              <input className={INPUT_CLS} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(555) 123-4567"/>
            </div>
            <div>
              <label className={LABEL_CLS}>Email</label>
              <input className={INPUT_CLS} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@example.com"/>
            </div>
          </div>
          <div>
            <label className={LABEL_CLS}>Address</label>
            <input className={INPUT_CLS} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="123 Main St, City, CA"/>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={handleCreateSave} disabled={!form.name.trim()}
              className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
              Add &amp; Select
            </button>
            <button type="button" onClick={() => setShowCreate(false)}
              className="flex-1 border border-gray-200 text-gray-600 text-sm font-semibold py-2 rounded-xl hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
