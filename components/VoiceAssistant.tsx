'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLanguage, SPEECH_LANG, LANGUAGES } from '../lib/i18n';
import { useAuth } from './AuthProvider';
import { usePathname } from 'next/navigation';

interface VoiceResult {
  type: 'customers' | 'jobs' | 'note' | 'error' | 'info' | 'open_customer' | 'open_job' | 'navigate' | 'add_note' | 'note_saved' | 'update_job_status' | 'request_price_approval' | 'mark_job_done' | 'attach_photo';
  message: string;
  customers?: { id: string; name: string; email: string; phone: string }[];
  jobs?: { id: string; title: string; customer: string; status: string; date: string; amount: number }[];
  noteAdded?: string;
  customerId?: string;
  customerName?: string;
  jobId?: string;
  jobTitle?: string;
  path?: string;
  note?: string;
  newStatus?: 'on-site' | 'done';
  approvedPrice?: number;
}

interface ISpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onstart: ((this: ISpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: ISpeechRecognition, ev: ISpeechRecognitionEvent) => void) | null;
  onerror: ((this: ISpeechRecognition, ev: Event) => void) | null;
  onend: ((this: ISpeechRecognition, ev: Event) => void) | null;
}
interface ISpeechRecognitionEvent extends Event {
  results: { length: number; [index: number]: { length: number; [index: number]: { transcript: string } } };
}
interface ISpeechRecognitionConstructor {
  new(): ISpeechRecognition;
}
declare global {
  interface Window {
    SpeechRecognition: ISpeechRecognitionConstructor;
    webkitSpeechRecognition: ISpeechRecognitionConstructor;
  }
}

export default function VoiceAssistant() {
  const { t, lang } = useLanguage();
  const { data, updateData } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isDashboard = pathname === '/';

  // voiceLang is independent from UI lang — stored in localStorage so users can speak
  // in a different language than the UI without changing the whole interface
  const [voiceLang, setVoiceLangState] = useState<typeof lang>(lang);
  const [showLangPicker, setShowLangPicker] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('fpVoiceLang') as typeof lang | null;
    setVoiceLangState(saved && SPEECH_LANG[saved] ? saved : lang);
  }, []); // eslint-disable-line

  const setVoiceLang = (l: typeof lang) => {
    setVoiceLangState(l);
    localStorage.setItem('fpVoiceLang', l);
    setShowLangPicker(false);
  };

  const currentVoiceLangLabel = LANGUAGES.find(l => l.code === voiceLang)?.label ?? 'EN';

  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [result, setResult] = useState<VoiceResult | null>(null);
  const [supported, setSupported] = useState(true);

  const recogRef = useRef<ISpeechRecognition | null>(null);
  const pulseRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) setSupported(false); // eslint-disable-next-line
  }, []);

  // Execute navigation/note-save side-effects when result arrives
  useEffect(() => {
    if (!result) return;

    if (result.type === 'navigate' && result.path) {
      router.push(result.path);
      return;
    }

    if (result.type === 'open_customer' && result.customerId) {
      if (pathname === '/customers') {
        window.dispatchEvent(new CustomEvent('voice:open-customer', { detail: { customerId: result.customerId } }));
      } else {
        sessionStorage.setItem('voice-nav', JSON.stringify({ type: 'open_customer', customerId: result.customerId }));
        router.push('/customers');
      }
      return;
    }

    if (result.type === 'open_job' && result.jobId) {
      if (pathname === '/jobs') {
        window.dispatchEvent(new CustomEvent('voice:open-job', { detail: { jobId: result.jobId } }));
      } else {
        sessionStorage.setItem('voice-nav', JSON.stringify({ type: 'open_job', jobId: result.jobId }));
        router.push('/jobs');
      }
      return;
    }

    if (result.type === 'add_note' && result.note) {
      if (result.jobId && data) {
        const job = data.jobs.find(j => j.id === result.jobId);
        if (job) {
          const updatedNote = job.notes ? `${job.notes}\n${result.note}` : result.note;
          updateData({ ...data, jobs: data.jobs.map(j => j.id === result.jobId ? { ...j, notes: updatedNote } : j) });
          setResult(prev => prev ? { ...prev, type: 'note_saved', noteAdded: result.note } : null);
          return;
        }
      }
      setResult(prev => prev ? { ...prev, type: 'note', noteAdded: result.note } : null);
    }

    // Technician action: Update job status
    if (result.type === 'update_job_status' && result.jobId && result.newStatus && data) {
      const job = data.jobs.find(j => j.id === result.jobId);
      if (job) {
        updateData({ ...data, jobs: data.jobs.map(j => j.id === result.jobId ? { ...j, status: result.newStatus! } : j) });
        setResult(prev => prev ? { ...prev, message: `✓ ${result.jobTitle} status updated to ${result.newStatus}` } : null);
        return;
      }
    }

    // Technician action: Request price approval
    if (result.type === 'request_price_approval' && result.jobId && result.approvedPrice && data) {
      const job = data.jobs.find(j => j.id === result.jobId);
      if (job) {
        updateData({ ...data, jobs: data.jobs.map(j => j.id === result.jobId ? { ...j, estimate: result.approvedPrice! } : j) });
        setResult(prev => prev ? { ...prev, message: `✓ Price of $${result.approvedPrice} recorded for ${result.jobTitle}` } : null);
        return;
      }
    }

    // Technician action: Attach photo — open job detail for photo upload
    if (result.type === 'attach_photo') {
      if (result.jobId) {
        if (pathname === '/jobs') {
          window.dispatchEvent(new CustomEvent('voice:attach-photo', { detail: { jobId: result.jobId } }));
        } else {
          sessionStorage.setItem('voice-nav', JSON.stringify({ type: 'open_job', jobId: result.jobId }));
          router.push('/jobs');
        }
      }
      return;
    }

    // Technician action: Mark job done
    if (result.type === 'mark_job_done' && result.jobId && data) {
      const job = data.jobs.find(j => j.id === result.jobId);
      if (job) {
        // Update job status to 'done' and auto-generate invoice if needed
        const updatedJobs = data.jobs.map(j =>
          j.id === result.jobId ? { ...j, status: 'done' as const } : j
        );

        // Check if invoice should be auto-generated
        let updatedInvoices = data.invoices;
        if (!data.invoices.find(inv => inv.jobTitle === job.title)) {
          const newInvoice = {
            id: `invoice-${Date.now()}`,
            invoiceNumber: `INV-${String(data.invoices.length + 1).padStart(3, '0')}`,
            customer: job.customer,
            jobTitle: job.title,
            amount: job.amount || job.estimate || 0,
            status: 'draft' as const,
            issueDate: new Date().toISOString().split('T')[0],
            dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            description: job.notes,
          };
          updatedInvoices = [...data.invoices, newInvoice];
        }

        updateData({ ...data, jobs: updatedJobs, invoices: updatedInvoices });
        setResult(prev => prev ? { ...prev, message: `✓ ${result.jobTitle} completed! Invoice auto-generated.` } : null);
        return;
      }
    }
  }, [result?.type, result?.customerId, result?.jobId, result?.path, result?.newStatus, result?.approvedPrice]); // eslint-disable-line

  const stopListening = useCallback(() => {
    recogRef.current?.stop();
    recogRef.current = null;
    setListening(false);
    if (pulseRef.current) clearInterval(pulseRef.current);
  }, []);

  const startListening = useCallback(() => {
    const SR: ISpeechRecognitionConstructor | undefined = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const recog: ISpeechRecognition = new SR();
    recog.lang = SPEECH_LANG[voiceLang];
    recog.interimResults = true;
    recog.maxAlternatives = 1;
    recogRef.current = recog;

    recog.onstart = () => {
      setListening(true);
      setTranscript('');
      setResult(null);
      pulseRef.current = setInterval(() => {}, 600);
    };

    recog.onresult = (e: ISpeechRecognitionEvent) => {
      const parts: string[] = [];
      for (let i = 0; i < e.results.length; i++) parts.push(e.results[i][0].transcript);
      setTranscript(parts.join(''));
    };

    recog.onerror = () => stopListening();
    recog.onend = async () => {
      stopListening();
      const text = document.getElementById('vox-transcript')?.getAttribute('data-text') ?? '';
      if (text.trim().length < 2) return;
      await processVoice(text);
    };

    recog.start();
  }, [voiceLang, stopListening, transcript]);

  const processVoice = useCallback(async (text: string) => {
    setProcessing(true);
    try {
      const res = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: text,
          lang: voiceLang,
          page: pathname,
          customers: (data?.customers ?? []).map(c => ({ id: c.id, name: c.name, email: c.email, phone: c.phone })),
          jobs: (data?.jobs ?? []).map(j => ({ id: j.id, title: j.title, customer: j.customer, status: j.status, date: j.date, amount: j.amount, notes: j.notes })),
        }),
      });
      const json = await res.json();
      setResult(json);
    } catch {
      setResult({ type: 'error', message: 'Failed to process voice command.' });
    }
    setProcessing(false);
  }, [data, voiceLang, pathname]);

  const handleToggle = () => {
    if (!open) { setOpen(true); return; }
    if (listening) { stopListening(); return; }
    startListening();
  };

  const handleMicClick = () => {
    if (listening) stopListening();
    else startListening();
  };

  useEffect(() => {
    const el = document.getElementById('vox-transcript');
    if (el) el.setAttribute('data-text', transcript);
  }, [transcript]);

  // Auto-dismiss non-critical results after 2 s (action results stay longer)
  useEffect(() => {
    if (!result) return;
    if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    const quickDismiss = ['info', 'navigate', 'note_saved', 'attach_photo', 'update_job_status', 'request_price_approval', 'mark_job_done'];
    if (quickDismiss.includes(result.type)) {
      autoDismissRef.current = setTimeout(() => { setResult(null); setTranscript(''); }, 2500);
    }
    return () => { if (autoDismissRef.current) clearTimeout(autoDismissRef.current); };
  }, [result]);

  if (!supported && !open) return null;

  return (
    <>
      <span id="vox-transcript" className="hidden" data-text=""/>

      <div className={`fixed z-40 ${isDashboard ? 'bottom-8 right-8' : 'bottom-6 right-6'}`}>
        {open && (
          <div className={`absolute bottom-full mb-3 right-0 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden
            ${isDashboard ? 'w-80' : 'w-72'}`}>
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
                  <MicIcon className="w-4 h-4 text-white"/>
                </div>
                <div>
                  <span className="text-white font-semibold text-sm">{t('voice.title')}</span>
                  {/* Clickable language label — changes voice recognition language independently from UI */}
                  <button
                    onClick={() => setShowLangPicker(p => !p)}
                    className="flex items-center gap-1 text-white/70 hover:text-white text-xs leading-none mt-0.5 transition-colors"
                  >
                    {t('voice.lang')} <span className="underline underline-offset-2">{currentVoiceLangLabel}</span>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                    </svg>
                  </button>
                </div>
              </div>
              <button onClick={() => { setOpen(false); stopListening(); setResult(null); setTranscript(''); setShowLangPicker(false); }}
                className="text-white/70 hover:text-white transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Language picker — appears between header and body so it's not clipped by overflow-hidden */}
            {showLangPicker && (
              <div className="bg-gray-50 border-b border-gray-100 px-4 py-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('voice.lang')}</p>
                <div className="grid grid-cols-5 gap-1">
                  {LANGUAGES.map(l => (
                    <button
                      key={l.code}
                      onClick={() => setVoiceLang(l.code)}
                      className={`text-xs py-1.5 px-1 rounded-lg font-medium transition-colors ${
                        voiceLang === l.code
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4 space-y-3">
              {/* Mic button */}
              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={handleMicClick}
                  disabled={processing}
                  className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg
                    ${listening ? 'bg-red-500 hover:bg-red-600 scale-110' : 'bg-blue-600 hover:bg-blue-700'}
                    ${processing ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  {listening && (
                    <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-50"/>
                  )}
                  <MicIcon className="w-7 h-7 text-white relative z-10"/>
                </button>
                <p className="text-xs font-medium text-gray-500">
                  {processing ? t('voice.processing') : listening ? t('voice.listening') : t('voice.tap')}
                </p>
              </div>

              {/* Transcript */}
              {transcript && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">🎙</p>
                  <p className="text-sm text-gray-800 italic">"{transcript}"</p>
                </div>
              )}

              {/* Processing */}
              {processing && (
                <div className="flex items-center justify-center gap-2 py-2">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}/>
                    ))}
                  </div>
                  <span className="text-xs text-gray-500">{t('voice.processing')}</span>
                </div>
              )}

              {/* Results */}
              {result && !processing && (
                <div className="space-y-2">
                  {/* Customer list */}
                  {result.type === 'customers' && result.customers && result.customers.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('voice.customers')}</p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {result.customers.map(c => (
                          <Link key={c.id} href="/customers"
                            className="flex items-center gap-2.5 p-2.5 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors">
                            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {c.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                              {c.phone && <p className="text-xs text-gray-500 truncate">{c.phone}</p>}
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Job list */}
                  {result.type === 'jobs' && result.jobs && result.jobs.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('voice.jobs')}</p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {result.jobs.map(j => (
                          <Link key={j.id} href="/jobs"
                            className="block p-2.5 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold text-gray-900 truncate">{j.title}</p>
                              <span className="text-xs text-indigo-600 font-medium ml-2 flex-shrink-0">${j.amount}</span>
                            </div>
                            <p className="text-xs text-gray-500 truncate">{j.customer}</p>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Open customer / open job / navigate — action confirmation */}
                  {(result.type === 'open_customer' || result.type === 'open_job' || result.type === 'navigate') && (
                    <div className="bg-blue-50 rounded-xl p-3 flex items-center gap-2">
                      <span className="text-blue-600 text-base font-bold">→</span>
                      <p className="text-sm font-semibold text-blue-800">{result.message}</p>
                    </div>
                  )}

                  {/* Note saved */}
                  {(result.type === 'note_saved' || result.type === 'note') && (
                    <div className="bg-green-50 rounded-xl p-3 flex items-start gap-2">
                      <span className="text-green-600 text-sm">✓</span>
                      <div>
                        <p className="text-sm font-semibold text-green-800">{result.message || t('voice.note')}</p>
                        {result.noteAdded && <p className="text-xs text-green-700 mt-0.5">"{result.noteAdded}"</p>}
                      </div>
                    </div>
                  )}

                  {/* add_note — no job matched */}
                  {result.type === 'add_note' && !result.jobId && (
                    <div className="bg-amber-50 rounded-xl p-3">
                      <p className="text-sm font-semibold text-amber-800">{t('voice.noJobFound')}</p>
                      {result.note && <p className="text-xs text-amber-700 mt-0.5">"{result.note}"</p>}
                    </div>
                  )}

                  {/* Attach photo confirmation */}
                  {result.type === 'attach_photo' && (
                    <div className="bg-violet-50 rounded-xl p-3 flex items-center gap-2">
                      <span className="text-violet-600 text-base">📷</span>
                      <p className="text-sm font-semibold text-violet-800">{result.message}</p>
                    </div>
                  )}

                  {/* Info */}
                  {result.type === 'info' && (
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-sm text-gray-700">{result.message}</p>
                    </div>
                  )}

                  {/* Error */}
                  {result.type === 'error' && (
                    <div className="bg-red-50 rounded-xl p-3">
                      <p className="text-sm text-red-600">{result.message}</p>
                    </div>
                  )}

                  {/* Empty search results */}
                  {((result.type === 'customers' && (!result.customers || result.customers.length === 0)) ||
                    (result.type === 'jobs' && (!result.jobs || result.jobs.length === 0))) && (
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-sm text-gray-500">{t('common.noResults')}</p>
                    </div>
                  )}

                  <button onClick={() => { setResult(null); setTranscript(''); }}
                    className="w-full text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors">
                    {t('voice.clear')}
                  </button>
                </div>
              )}

              {/* Text chat input */}
              <form
                onSubmit={e => {
                  e.preventDefault();
                  const text = chatInput.trim();
                  if (!text || processing) return;
                  setChatInput('');
                  processVoice(text);
                }}
                className="flex gap-2"
              >
                <input
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 bg-white"
                  placeholder={t('voice.typeHint')}
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  disabled={processing}
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || processing}
                  className="px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors flex-shrink-0"
                >
                  {t('voice.send')}
                </button>
              </form>

              {/* Hint */}
              {!transcript && !result && !processing && !chatInput && (
                <p className="text-xs text-gray-400 text-center leading-relaxed">{t('voice.hint')}</p>
              )}
            </div>
          </div>
        )}

        {/* FAB */}
        <button
          onClick={handleToggle}
          title={t('voice.title')}
          className={`
            relative flex items-center justify-center rounded-full shadow-xl transition-all duration-300
            ${isDashboard ? 'w-16 h-16' : 'w-14 h-14'}
            ${open ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-blue-600 hover:bg-blue-700'}
            ${listening ? 'ring-4 ring-red-400 ring-opacity-60' : 'hover:scale-105'}
          `}
        >
          {listening && (
            <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-40"/>
          )}
          <MicIcon className={`text-white relative z-10 ${isDashboard ? 'w-7 h-7' : 'w-6 h-6'}`}/>
          <span className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white
            ${listening ? 'bg-red-500 animate-pulse' : 'bg-green-400'}`}/>
        </button>
      </div>
    </>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23" strokeLinecap="round"/>
      <line x1="8" y1="23" x2="16" y2="23" strokeLinecap="round"/>
    </svg>
  );
}
