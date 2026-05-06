'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useLanguage, SPEECH_LANG } from '../lib/i18n';
import { useAuth } from './AuthProvider';
import { usePathname } from 'next/navigation';

interface VoiceResult {
  type: 'customers' | 'jobs' | 'note' | 'error' | 'info';
  message: string;
  customers?: { id: string; name: string; email: string; phone: string }[];
  jobs?: { id: string; title: string; customer: string; status: string; date: string; amount: number }[];
  noteAdded?: string;
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
  const { data } = useAuth();
  const pathname = usePathname();
  const isDashboard = pathname === '/';

  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [result, setResult] = useState<VoiceResult | null>(null);
  const [supported, setSupported] = useState(true);
  const [pulse, setPulse] = useState(false);

  const recogRef = useRef<ISpeechRecognition | null>(null);
  const pulseRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) setSupported(false); // eslint-disable-next-line
  }, []);

  const stopListening = useCallback(() => {
    recogRef.current?.stop();
    recogRef.current = null;
    setListening(false);
    if (pulseRef.current) clearInterval(pulseRef.current);
    setPulse(false);
  }, []);

  const startListening = useCallback(() => {
    const SR: ISpeechRecognitionConstructor | undefined = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const recog: ISpeechRecognition = new SR();
    recog.lang = SPEECH_LANG[lang];
    recog.interimResults = true;
    recog.maxAlternatives = 1;
    recogRef.current = recog;

    recog.onstart = () => {
      setListening(true);
      setTranscript('');
      setResult(null);
      pulseRef.current = setInterval(() => setPulse(p => !p), 600);
    };

    recog.onresult = (e: ISpeechRecognitionEvent) => {
      const parts: string[] = [];
      for (let i = 0; i < e.results.length; i++) parts.push(e.results[i][0].transcript);
      const text = parts.join('');
      setTranscript(text);
    };

    recog.onerror = () => stopListening();
    recog.onend = async () => {
      stopListening();
      const finalText = recogRef.current ? '' : transcript;
      const text = document.getElementById('vox-transcript')?.getAttribute('data-text') ?? '';
      if (text.trim().length < 2) return;
      await processVoice(text);
    };

    recog.start();
  }, [lang, stopListening, transcript]);

  const processVoice = useCallback(async (text: string) => {
    setProcessing(true);
    try {
      const res = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: text,
          lang,
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
  }, [data, lang, pathname]);

  const handleToggle = () => {
    if (!open) { setOpen(true); return; }
    if (listening) { stopListening(); return; }
    startListening();
  };

  const handleMicClick = () => {
    if (listening) stopListening();
    else startListening();
  };

  // Store transcript in DOM for the onend handler to access
  useEffect(() => {
    const el = document.getElementById('vox-transcript');
    if (el) el.setAttribute('data-text', transcript);
  }, [transcript]);

  if (!supported && !open) return null;

  return (
    <>
      {/* Hidden transcript store */}
      <span id="vox-transcript" className="hidden" data-text=""/>

      {/* Floating Voice Button */}
      <div className={`fixed z-40 ${isDashboard ? 'bottom-8 right-8' : 'bottom-6 right-6'}`}>
        {/* Panel */}
        {open && (
          <div className={`absolute bottom-full mb-3 right-0 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden
            ${isDashboard ? 'w-80' : 'w-72'}`}>
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
                  <MicIcon className="w-4 h-4 text-white"/>
                </div>
                <span className="text-white font-semibold text-sm">{t('voice.title')}</span>
              </div>
              <button onClick={() => { setOpen(false); stopListening(); setResult(null); setTranscript(''); }}
                className="text-white/70 hover:text-white transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="p-4 space-y-3">
              {/* Mic button in panel */}
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

              {/* Processing indicator */}
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
                  {result.type === 'customers' && result.customers && result.customers.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('voice.customers')}</p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {result.customers.map(c => (
                          <a key={c.id} href="/customers"
                            className="flex items-center gap-2.5 p-2.5 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors">
                            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {c.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                              {c.phone && <p className="text-xs text-gray-500 truncate">{c.phone}</p>}
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.type === 'jobs' && result.jobs && result.jobs.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('voice.jobs')}</p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {result.jobs.map(j => (
                          <a key={j.id} href="/jobs"
                            className="block p-2.5 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold text-gray-900 truncate">{j.title}</p>
                              <span className="text-xs text-indigo-600 font-medium ml-2 flex-shrink-0">${j.amount}</span>
                            </div>
                            <p className="text-xs text-gray-500 truncate">{j.customer}</p>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.type === 'note' && (
                    <div className="bg-green-50 rounded-xl p-3 flex items-start gap-2">
                      <span className="text-green-600 text-sm">✓</span>
                      <div>
                        <p className="text-sm font-semibold text-green-800">{t('voice.note')}</p>
                        {result.noteAdded && <p className="text-xs text-green-700 mt-0.5">"{result.noteAdded}"</p>}
                      </div>
                    </div>
                  )}

                  {result.type === 'info' && (
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-sm text-gray-700">{result.message}</p>
                    </div>
                  )}

                  {result.type === 'error' && (
                    <div className="bg-red-50 rounded-xl p-3">
                      <p className="text-sm text-red-600">{result.message}</p>
                    </div>
                  )}

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

              {/* Hint */}
              {!transcript && !result && !processing && (
                <p className="text-xs text-gray-400 text-center leading-relaxed">{t('voice.hint')}</p>
              )}
            </div>
          </div>
        )}

        {/* Main FAB button */}
        <button
          onClick={handleToggle}
          title={t('voice.title')}
          className={`
            relative flex items-center justify-center rounded-full shadow-xl transition-all duration-300
            ${isDashboard ? 'w-16 h-16' : 'w-12 h-12'}
            ${open ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-blue-600 hover:bg-blue-700'}
            ${listening ? 'ring-4 ring-red-400 ring-opacity-60' : 'hover:scale-105'}
          `}
        >
          {listening && (
            <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-40"/>
          )}
          {open ? (
            <MicIcon className={`text-white relative z-10 ${isDashboard ? 'w-7 h-7' : 'w-5 h-5'}`}/>
          ) : (
            <MicIcon className={`text-white relative z-10 ${isDashboard ? 'w-7 h-7' : 'w-5 h-5'}`}/>
          )}
          {/* Indicator dot */}
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
