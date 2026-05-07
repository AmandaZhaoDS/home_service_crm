'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../components/AuthProvider';
import { useT } from '../lib/i18n';
import { Job, JobStatus, JobItem, PricebookItem } from '../lib/fieldproStorage';
import Modal from '../components/Modal';

function uid() { return typeof crypto!=='undefined'&&'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

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

const INPUT_CLS = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 bg-white";
const LABEL_CLS = "block text-sm font-medium text-gray-700 mb-1.5";

const WORKFLOW_STEPS: JobStatus[] = ['estimate','scheduled','on-site','done','invoice-sent','paid'];

const STATUS_BADGE_CLS: Record<JobStatus,string> = {
  estimate:'bg-indigo-100 text-indigo-700', scheduled:'bg-blue-100 text-blue-700',
  'on-site':'bg-orange-500 text-white', done:'bg-emerald-100 text-emerald-700',
  'invoice-sent':'bg-violet-100 text-violet-700', paid:'bg-green-100 text-green-700',
};

const AVATAR_COLORS = ['bg-blue-500','bg-emerald-500','bg-orange-400','bg-violet-500','bg-teal-500','bg-pink-500','bg-amber-500','bg-cyan-500'];
function avatarColor(name: string) { let h=0; for (const c of name) h=(h*31+c.charCodeAt(0))%AVATAR_COLORS.length; return AVATAR_COLORS[Math.abs(h)]; }
function initials(name: string) { return name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2); }

function WorkflowProgress({ status }: { status: JobStatus }) {
  const currentIdx = WORKFLOW_STEPS.findIndex(s => s === status);
  return (
    <div className="flex items-center w-full">
      {WORKFLOW_STEPS.map((step, idx) => {
        const done = idx < currentIdx;
        const current = idx === currentIdx;
        return (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center transition-all ${done?'bg-blue-600':current?'bg-orange-400 ring-4 ring-orange-100':'bg-gray-200'}`}>
              {done && <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
            </div>
            {idx < WORKFLOW_STEPS.length - 1 && <div className={`flex-1 h-0.5 ${idx < currentIdx ? 'bg-blue-500' : 'bg-gray-200'}`}/>}
          </div>
        );
      })}
    </div>
  );
}

function AddWorkModal({ pricebook, onSave, onClose }: {
  pricebook: PricebookItem[];
  onSave: (item: { label: string; amount: number; quantity: number }) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [wi, setWi] = useState({ label: '', amount: 0, quantity: 1 });
  const valid = wi.label.trim();
  return (
    <Modal title={t('dash.addWorkTitle')} onClose={onClose} size="sm">
      <div className="space-y-4">
        {pricebook.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{t('pb.fromPb')}</p>
            <div className="flex flex-wrap gap-1.5 mb-1">
              {pricebook.slice(0, 6).map(item => (
                <button key={item.id}
                  onClick={() => onSave({ label: item.name, amount: item.unitPrice, quantity: 1 })}
                  className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors">
                  {item.name} · ${item.unitPrice}
                </button>
              ))}
            </div>
            <div className="border-t border-gray-100 pt-3"/>
          </div>
        )}
        <div>
          <label className={LABEL_CLS}>{t('dash.description')}</label>
          <input className={INPUT_CLS} value={wi.label} onChange={e => setWi(w => ({ ...w, label: e.target.value }))} placeholder="e.g. Labor, Parts..."/>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>{t('dash.amount')}</label>
            <input type="number" min={0} className={INPUT_CLS} value={wi.amount || ''} onChange={e => setWi(w => ({ ...w, amount: Number(e.target.value) }))} placeholder="0"/>
          </div>
          <div>
            <label className={LABEL_CLS}>{t('dash.quantity')}</label>
            <input type="number" min={1} className={INPUT_CLS} value={wi.quantity} onChange={e => setWi(w => ({ ...w, quantity: Number(e.target.value) }))} placeholder="1"/>
          </div>
        </div>
        {wi.amount > 0 && wi.quantity > 0 && (
          <p className="text-sm text-gray-600">{t('dash.subtotal')} <span className="font-semibold text-gray-900">${(wi.amount * wi.quantity).toFixed(2)}</span></p>
        )}
        <button onClick={() => { if (valid) onSave(wi); }} disabled={!valid}
          className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {t('dash.addItem')}
        </button>
      </div>
    </Modal>
  );
}

interface EstimateForm { title: string; customer: string; date: string; time: string; address: string; notes: string; estimate: number; }

function NewEstimateModal({ customers, onSave, onClose }: {
  customers: string[]; onSave: (f: EstimateForm) => void; onClose: () => void;
}) {
  const t = useT();
  const [f, setF] = useState<EstimateForm>({
    title: '', customer: '', date: new Date().toISOString().split('T')[0],
    time: '09:00 AM', address: '', notes: '', estimate: 0,
  });
  const set = <K extends keyof EstimateForm>(k: K, v: EstimateForm[K]) => setF(p => ({ ...p, [k]: v }));
  const valid = f.title.trim() && f.customer.trim();
  return (
    <Modal title={t('dash.newEstimateTitle')} onClose={onClose} size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>{t('dash.jobTitle')}</label>
            <input className={INPUT_CLS} value={f.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Roof Inspection"/>
          </div>
          <div>
            <label className={LABEL_CLS}>{t('dash.customer')}</label>
            <input className={INPUT_CLS} list="cust-est" value={f.customer} onChange={e => set('customer', e.target.value)}/>
            <datalist id="cust-est">{customers.map(c => <option key={c} value={c}/>)}</datalist>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>{t('dash.date')}</label>
            <input type="date" className={INPUT_CLS} value={f.date} onChange={e => set('date', e.target.value)}/>
          </div>
          <div>
            <label className={LABEL_CLS}>{t('dash.time')}</label>
            <input className={INPUT_CLS} value={f.time} onChange={e => set('time', e.target.value)} placeholder="09:00 AM"/>
          </div>
        </div>
        <div>
          <label className={LABEL_CLS}>{t('dash.address')}</label>
          <input className={INPUT_CLS} value={f.address} onChange={e => set('address', e.target.value)} placeholder="123 Main St"/>
        </div>
        <div>
          <label className={LABEL_CLS}>{t('dash.estimateAmt')}</label>
          <input type="number" min={0} className={INPUT_CLS} value={f.estimate || ''} onChange={e => set('estimate', Number(e.target.value))} placeholder="0"/>
        </div>
        <div>
          <label className={LABEL_CLS}>{t('dash.notes')}</label>
          <textarea className={INPUT_CLS + ' resize-none'} rows={3} value={f.notes} onChange={e => set('notes', e.target.value)}/>
        </div>
        <button onClick={() => { if (valid) onSave(f); }} disabled={!valid}
          className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {t('dash.createEstimate')}
        </button>
      </div>
    </Modal>
  );
}

function AddressCard({ address }: { address: string }) {
  const [showMap, setShowMap] = useState(false);
  const encoded = encodeURIComponent(address);
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <p className="text-sm text-gray-500 flex-1">{address}</p>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={() => setShowMap(m => !m)}
            className={`text-xs font-semibold px-2 py-1 rounded-lg border transition-colors ${showMap ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            Map
          </button>
          <a href={`https://www.google.com/maps?q=${encoded}&layer=c`} target="_blank" rel="noreferrer"
            className="text-xs font-semibold px-2 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            Street View
          </a>
          <a href={`https://maps.google.com?q=${encoded}`} target="_blank" rel="noreferrer"
            className="text-xs font-semibold px-2 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            ↗
          </a>
        </div>
      </div>
      {showMap && (
        <div className="mt-2 rounded-xl overflow-hidden border border-gray-100 shadow-sm">
          <iframe
            title="address-map"
            src={`https://maps.google.com/maps?q=${encoded}&output=embed&z=16`}
            width="100%" height="220" style={{ border: 0, display: 'block' }}
            loading="lazy" allowFullScreen/>
        </div>
      )}
    </div>
  );
}

function JobDetailPanel({ job, customerPhone, onAddWork, onNewEstimate, onEdit, onDelete }: {
  job: Job; customerPhone: string; onAddWork: () => void; onNewEstimate: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const t = useT();
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
      <div className="flex items-start justify-between mb-1">
        <h2 className="text-xl font-bold text-gray-900">{job.customer}</h2>
        <div className="flex items-center gap-2 text-gray-400">
          {customerPhone ? (
            <a href={`tel:${customerPhone.replace(/\D/g, '')}`}
              className="hover:text-blue-600 transition-colors" title={`Call ${customerPhone}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
              </svg>
            </a>
          ) : (
            <svg className="w-5 h-5 opacity-30" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
            </svg>
          )}
          <div className="relative" ref={moreRef}>
            <button onClick={() => setMoreOpen(o => !o)} className="hover:text-gray-700 transition-colors">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
              </svg>
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-20 min-w-[140px]">
                <button onClick={() => { setMoreOpen(false); onEdit(); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">{t('dash.editJob')}</button>
                <button onClick={() => { setMoreOpen(false); onDelete(); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors">{t('dash.deleteJob')}</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <AddressCard address={job.address}/>

      <div className="flex items-center gap-2 mb-4">
        <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
        </svg>
        <span className="font-semibold text-gray-800 text-sm">{job.title}</span>
      </div>

      <div className="px-1 mb-4"><WorkflowProgress status={job.status}/></div>

      <p className="text-sm font-semibold text-gray-600 mb-4">
        {t('dash.estimateTotal')} <span className="text-gray-900">${job.estimate.toFixed(2)}</span>
      </p>

      {job.items.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{t('dash.workInProgress')}</p>
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

      {job.notes && (
        <div className="mb-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('dash.notesPhotos')}</p>
          <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3 leading-relaxed">{job.notes}</p>
        </div>
      )}

      <div className="flex gap-2 mt-auto pt-2">
        <button onClick={onEdit}
          className="border border-gray-200 text-gray-700 text-sm font-semibold py-2.5 px-3 rounded-xl hover:bg-gray-50 transition-colors">
          {t('common.edit')}
        </button>
        <button onClick={onAddWork}
          className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2.5 px-3 rounded-xl hover:bg-blue-700 transition-colors">
          {t('dash.addWork')}
        </button>
        <button onClick={onNewEstimate}
          className="flex-1 border border-gray-200 text-gray-700 text-sm font-semibold py-2.5 px-3 rounded-xl hover:bg-gray-50 transition-colors">
          {t('dash.newEstimate')}
        </button>
      </div>
    </div>
  );
}

interface EditForm { title: string; customer: string; date: string; time: string; address: string; notes: string; photos: string[]; }

function EditJobModal({ job, customers, onSave, onClose }: {
  job: Job; customers: string[]; onSave: (f: EditForm) => void; onClose: () => void;
}) {
  const t = useT();
  const [f, setF] = useState<EditForm>({
    title: job.title, customer: job.customer, date: job.date,
    time: job.time, address: job.address, notes: job.notes, photos: job.photos ?? [],
  });
  const set = <K extends keyof EditForm>(k: K, v: EditForm[K]) => setF(p => ({ ...p, [k]: v }));
  const valid = f.title.trim() && f.customer.trim();
  const [photoUploading, setPhotoUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setPhotoUploading(true);
    const compressed = await Promise.all(files.map(f => compressImage(f)));
    setF(p => ({ ...p, photos: [...p.photos, ...compressed] }));
    setPhotoUploading(false);
    e.target.value = '';
  };

  return (
    <>
      <Modal title={t('dash.editJob')} onClose={onClose} size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>{t('dash.jobTitle')}</label>
              <input className={INPUT_CLS} value={f.title} onChange={e => set('title', e.target.value)}/>
            </div>
            <div>
              <label className={LABEL_CLS}>{t('dash.customer')}</label>
              <input className={INPUT_CLS} list="cust-edit" value={f.customer} onChange={e => set('customer', e.target.value)}/>
              <datalist id="cust-edit">{customers.map(c => <option key={c} value={c}/>)}</datalist>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>{t('dash.date')}</label>
              <input type="date" className={INPUT_CLS} value={f.date} onChange={e => set('date', e.target.value)}/>
            </div>
            <div>
              <label className={LABEL_CLS}>{t('dash.time')}</label>
              <input className={INPUT_CLS} value={f.time} onChange={e => set('time', e.target.value)} placeholder="09:00 AM"/>
            </div>
          </div>
          <div>
            <label className={LABEL_CLS}>{t('dash.address')}</label>
            <input className={INPUT_CLS} value={f.address} onChange={e => set('address', e.target.value)}/>
          </div>
          <div>
            <label className={LABEL_CLS}>{t('dash.notes')}</label>
            <textarea className={INPUT_CLS + ' resize-none'} rows={3} value={f.notes} onChange={e => set('notes', e.target.value)}/>
          </div>

          {/* Photos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={LABEL_CLS + ' mb-0'}>Photos ({f.photos.length})</label>
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
            {f.photos.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {f.photos.map((photo, i) => (
                  <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 cursor-pointer group"
                    onClick={() => setLightbox(photo)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo} alt={`Photo ${i+1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"/>
                    <button onClick={e => { e.stopPropagation(); setF(p => ({ ...p, photos: p.photos.filter((_, j) => j !== i) })); }}
                      className="absolute top-1 right-1 w-5 h-5 bg-black/50 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex gap-2">
                <label className="flex-1 flex flex-col items-center justify-center h-18 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-xs cursor-pointer hover:border-blue-300 hover:text-blue-500 transition-colors py-4">
                  <span className="text-xl mb-1">📷</span>
                  Take Photo
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload}/>
                </label>
                <label className="flex-1 flex flex-col items-center justify-center h-18 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-xs cursor-pointer hover:border-blue-300 hover:text-blue-500 transition-colors py-4">
                  <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
                  </svg>
                  From Gallery
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload}/>
                </label>
              </div>
            )}
          </div>

          <button onClick={() => { if (valid) onSave(f); }} disabled={!valid}
            className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {t('common.save')}
          </button>
        </div>
      </Modal>
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

export default function Home() {
  const { data, updateData } = useAuth();
  const t = useT();
  const jobs = data?.jobs ?? [];
  const customerNames = [...new Set((data?.customers ?? []).map(c => c.name))];
  const today = new Date().toISOString().split('T')[0];

  const STATUS_BADGE_LABEL: Record<JobStatus,string> = {
    estimate: t('status.estimate'), scheduled: t('status.scheduled'), 'on-site': t('status.onSite'),
    done: t('status.done'), 'invoice-sent': t('status.invoiceSent'), paid: t('status.paid'),
  };

  const todayJobs = useMemo(
    () => jobs.filter(j => j.date === today || j.status === 'on-site' || j.status === 'scheduled'),
    [jobs, today],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<'none' | 'addWork' | 'newEstimate' | 'editJob' | 'confirmDelete'>('none');

  useEffect(() => {
    if (!selectedId && todayJobs.length > 0) setSelectedId(todayJobs[0].id);
  }, [todayJobs, selectedId]);

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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {t('dash.title').includes('Workflow') ? (
            <>{t('dash.title').split('Workflow')[0]}<span className="text-blue-600">Workflow</span>{t('dash.title').split('Workflow')[1]}</>
          ) : t('dash.title')}
        </h1>
        <p className="text-sm text-gray-500 mt-1">{t('dash.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_260px] gap-5 items-start">
        {/* Left: Today's Jobs */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">{t('dash.todayJobs')}</h3>
            <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">{todayJobs.length}</span>
          </div>
          {todayJobs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">{t('dash.noJobs')}</p>
          ) : (
            <div className="space-y-1.5">
              {todayJobs.map(job => {
                const isSelected = selectedId === job.id;
                return (
                  <button key={job.id} onClick={() => setSelectedId(job.id)}
                    className={`w-full text-left p-3 rounded-xl transition-colors ${isSelected ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-50'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full ${avatarColor(job.customer)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                        {initials(job.customer)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{job.customer}</p>
                        <p className="text-xs text-gray-500 truncate">{job.title}</p>
                        <p className="text-xs text-gray-400">{job.time}</p>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${STATUS_BADGE_CLS[job.status]}`}>
                        {STATUS_BADGE_LABEL[job.status]}
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
              customerPhone={(data?.customers ?? []).find(c => c.name === selectedJob.customer)?.phone ?? ''}
              onAddWork={() => setModal('addWork')}
              onNewEstimate={() => setModal('newEstimate')}
              onEdit={() => setModal('editJob')}
              onDelete={() => setModal('confirmDelete')}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm">
              {t('dash.selectJob')}
            </div>
          )}
        </div>

        {/* Right: Today's Summary */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">{t('dash.todaySummary')}</h3>
            <span className="text-xs font-semibold text-green-600 bg-green-50 px-2.5 py-1 rounded-full">{t('dash.live')}</span>
          </div>
          <div className="space-y-3">
            <div className="bg-blue-600 rounded-xl p-4 flex items-center justify-between text-white">
              <span className="text-sm font-semibold">{t('status.scheduled')}</span>
              <span className="text-3xl font-bold">{stats.scheduled}</span>
            </div>
            <div className="bg-green-500 rounded-xl p-4 flex items-center justify-between text-white">
              <span className="text-sm font-semibold">{t('status.onSite')}</span>
              <span className="text-3xl font-bold">{stats.onSite}</span>
            </div>
            <div className="bg-orange-500 rounded-xl p-4 flex items-center justify-between text-white">
              <span className="text-sm font-semibold">{t('status.done')}</span>
              <span className="text-3xl font-bold">{stats.done}</span>
            </div>
            <div className="bg-indigo-600 rounded-xl p-4 flex items-center justify-between text-white">
              <span className="text-sm font-semibold">{t('status.estimate')}</span>
              <span className="text-3xl font-bold">{stats.estimates}</span>
            </div>
          </div>
        </div>
      </div>

      {recentActivities.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-semibold text-gray-900 mb-4">{t('dash.recentActivity')}</h3>
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

      {modal === 'addWork' && selectedJob && (
        <AddWorkModal pricebook={data?.pricebook ?? []} onSave={addWorkItem} onClose={() => setModal('none')}/>
      )}
      {modal === 'newEstimate' && (
        <NewEstimateModal customers={customerNames} onSave={saveEstimate} onClose={() => setModal('none')}/>
      )}
      {modal === 'editJob' && selectedJob && (
        <EditJobModal job={selectedJob} customers={customerNames} onSave={saveEdit} onClose={() => setModal('none')}/>
      )}
      {modal === 'confirmDelete' && selectedJob && (
        <Modal title={t('dash.deleteJob')} onClose={() => setModal('none')} size="sm">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              {t('dash.deleteConfirm')} <span className="font-semibold text-gray-900">&quot;{selectedJob.title}&quot;</span> {t('dash.deleteFor')} {selectedJob.customer}? {t('dash.deleteUndo')}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setModal('none')}
                className="flex-1 border border-gray-200 text-gray-700 font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                {t('common.cancel')}
              </button>
              <button onClick={deleteJob}
                className="flex-1 bg-red-500 text-white font-semibold py-2.5 rounded-xl hover:bg-red-600 transition-colors">
                {t('common.delete')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
