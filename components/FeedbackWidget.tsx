'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from './AuthProvider';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRec = any;

export default function FeedbackWidget() {
  const { user } = useAuth();
  const [open, setOpen]               = useState(false);
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot]   = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [speechSupported, setSpeechSupported] = useState(false);

  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const imgRef      = useRef<HTMLImageElement>(null);
  const recognitionRef = useRef<AnySpeechRec | null>(null);
  const isDrawingRef   = useRef(false);
  const lastPosRef     = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSpeechSupported(!!(( window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));
  }, []);

  // ── Clipboard paste ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith('image/'));
      if (!item) return;
      const blob = item.getAsFile();
      if (!blob) return;
      const reader = new FileReader();
      reader.onload = () => setScreenshot(reader.result as string);
      reader.readAsDataURL(blob);
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [open]);

  // ── Voice input ───────────────────────────────────────────────────────────
  const toggleVoice = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;
    const rec = new SpeechRec();
    rec.continuous     = true;
    rec.interimResults = false;
    rec.lang           = '';  // auto-detect language
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results as unknown[])
        .slice(e.resultIndex)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => r[0].transcript)
        .join('');
      setDescription(prev => prev ? prev + ' ' + transcript : transcript);
    };
    rec.onerror = () => setIsListening(false);
    rec.onend   = () => setIsListening(false);
    rec.start();
    recognitionRef.current = rec;
    setIsListening(true);
  }, [isListening]);

  // ── Canvas drawing ────────────────────────────────────────────────────────
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img) return;
    canvas.width  = img.clientWidth;
    canvas.height = img.clientHeight;
  }, []);

  const getPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const drawLine = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth   = 3;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const onPointerDown  = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    isDrawingRef.current  = true;
    lastPosRef.current    = getPos(e);
  };
  const onPointerMove  = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const pos = getPos(e);
    drawLine(lastPosRef.current, pos);
    lastPosRef.current = pos;
  };
  const onPointerUp    = () => { isDrawingRef.current = false; };

  const clearAnnotations = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  };

  // ── Merge screenshot + annotations into one base64 image ─────────────────
  const getAnnotatedImage = useCallback((): string | null => {
    if (!screenshot) return null;
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img) return screenshot;

    const out    = document.createElement('canvas');
    out.width    = img.naturalWidth  || img.clientWidth;
    out.height   = img.naturalHeight || img.clientHeight;
    const ctx    = out.getContext('2d')!;
    ctx.drawImage(img, 0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0, out.width, out.height);
    return out.toDataURL('image/jpeg', 0.82);
  }, [screenshot]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const submit = useCallback(async () => {
    if (!description.trim() && !screenshot) return;
    recognitionRef.current?.stop();
    setIsListening(false);
    setSubmitStatus('saving');

    try {
      const annotated = getAnnotatedImage();
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId:      user?.id ?? null,
          userEmail:   user?.email ?? null,
          description: description.trim(),
          screenshot:  annotated,
          pageUrl:     window.location.href,
          browserInfo: navigator.userAgent,
        }),
      });
      if (res.ok) {
        setSubmitStatus('done');
        setTimeout(() => {
          setOpen(false);
          setDescription('');
          setScreenshot(null);
          setSubmitStatus('idle');
        }, 1500);
      } else {
        setSubmitStatus('error');
      }
    } catch {
      setSubmitStatus('error');
    }
  }, [description, screenshot, user, getAnnotatedImage]);

  const close = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
    setOpen(false);
    setSubmitStatus('idle');
  };

  return (
    <>
      {/* Floating bug button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-5 z-40 w-11 h-11 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white rounded-full shadow-lg flex items-center justify-center transition-all text-lg"
        title="Report a bug or request a change"
        aria-label="Report feedback"
      >
        🐛
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <h2 className="font-bold text-gray-900 text-base">Report Issue / Change Request</h2>
                <p className="text-xs text-gray-400 mt-0.5">Any language · screenshot · voice — all welcome</p>
              </div>
              <button onClick={close} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 text-xl transition-colors">×</button>
            </div>

            <div className="p-5 space-y-4">

              {/* Description + voice */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-gray-700">Description</label>
                  {speechSupported && (
                    <button
                      onClick={toggleVoice}
                      className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors ${
                        isListening
                          ? 'bg-red-100 text-red-600'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {isListening ? (
                        <><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block"/> Stop</>
                      ) : (
                        <><span>🎤</span> Voice</>
                      )}
                    </button>
                  )}
                </div>
                <textarea
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-400 resize-none"
                  rows={4}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Describe the issue or feature request… (任何语言都可以)"
                />
                {isListening && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block"/>
                    Listening… speak now
                  </p>
                )}
              </div>

              {/* Screenshot */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-gray-700">Screenshot</label>
                  <span className="text-xs text-gray-400">Paste (Ctrl/⌘+V) or upload</span>
                </div>

                {!screenshot ? (
                  <label className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-xs cursor-pointer hover:border-orange-300 hover:text-orange-500 transition-colors gap-1">
                    <span className="text-2xl">📸</span>
                    Click to upload or paste a screenshot
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const reader = new FileReader();
                        reader.onload = () => setScreenshot(reader.result as string);
                        reader.readAsDataURL(f);
                      }}
                    />
                  </label>
                ) : (
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5">Draw in red to mark problem areas</p>
                    <div
                      className="relative border border-gray-200 rounded-xl overflow-hidden select-none"
                      style={{ touchAction: 'none' }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        ref={imgRef}
                        src={screenshot}
                        alt="Screenshot"
                        className="w-full block"
                        onLoad={initCanvas}
                        draggable={false}
                      />
                      <canvas
                        ref={canvasRef}
                        className="absolute inset-0 cursor-crosshair"
                        style={{ width: '100%', height: '100%' }}
                        onMouseDown={onPointerDown}
                        onMouseMove={onPointerMove}
                        onMouseUp={onPointerUp}
                        onMouseLeave={onPointerUp}
                        onTouchStart={onPointerDown}
                        onTouchMove={onPointerMove}
                        onTouchEnd={onPointerUp}
                      />
                    </div>
                    <div className="flex gap-3 mt-1.5">
                      <button onClick={clearAnnotations} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Clear drawings</button>
                      <button onClick={() => setScreenshot(null)} className="text-xs text-red-400 hover:text-red-600 transition-colors">Remove screenshot</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Submit */}
              <button
                onClick={submit}
                disabled={submitStatus === 'saving' || (!description.trim() && !screenshot)}
                className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
                  submitStatus === 'done'  ? 'bg-green-500 text-white' :
                  submitStatus === 'error' ? 'bg-red-100 text-red-600' :
                  'bg-orange-500 text-white hover:bg-orange-600'
                }`}
              >
                {submitStatus === 'saving' ? '⏳ Submitting…' :
                 submitStatus === 'done'   ? '✓ Submitted! Thank you!' :
                 submitStatus === 'error'  ? '✗ Failed — please try again' :
                 'Submit Feedback'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
