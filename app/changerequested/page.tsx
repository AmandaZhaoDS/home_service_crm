'use client';

import { useState, useEffect, useCallback } from 'react';

interface Report {
  id: string;
  user_id: string | null;
  user_email: string | null;
  description: string;
  screenshot: string | null;
  page_url: string | null;
  created_at: string;
  status: 'open' | 'in_progress' | 'done';
  claimed_by: string | null;
  claimed_at: string | null;
  resolved_at: string | null;
}

const STATUS_CFG = {
  open:        { label: 'Open',        cls: 'bg-red-100 text-red-700',    dot: 'bg-red-500'    },
  in_progress: { label: 'In Progress', cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  done:        { label: 'Done',        cls: 'bg-green-100 text-green-700', dot: 'bg-green-500'  },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ChangeRequestedPage() {
  const [reports, setReports]     = useState<Report[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState<'all' | 'open' | 'in_progress' | 'done'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [claimNames, setClaimNames] = useState<Record<string, string>>({});
  const [actionStatus, setActionStatus] = useState<Record<string, 'idle' | 'busy' | 'ok'>>({});
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res  = await fetch('/api/feedback');
      const json = await res.json();
      if (json.reports) { setReports(json.reports); setLastRefresh(new Date()); }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 20_000);
    return () => clearInterval(t);
  }, [load]);

  const patch = useCallback(async (id: string, payload: Record<string, string | null>) => {
    setActionStatus(s => ({ ...s, [id]: 'busy' }));
    await fetch(`/api/feedback/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setActionStatus(s => ({ ...s, [id]: 'ok' }));
    load(true);
    setTimeout(() => setActionStatus(s => ({ ...s, [id]: 'idle' })), 1000);
  }, [load]);

  const claim = useCallback((id: string) => {
    const name = claimNames[id]?.trim();
    if (!name) return;
    patch(id, { claimedBy: name });
  }, [claimNames, patch]);

  const counts = {
    all:         reports.length,
    open:        reports.filter(r => r.status === 'open').length,
    in_progress: reports.filter(r => r.status === 'in_progress').length,
    done:        reports.filter(r => r.status === 'done').length,
  };

  const filtered = filter === 'all' ? reports : reports.filter(r => r.status === filter);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Change Requests</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Last updated {timeAgo(lastRefresh.toISOString())} · auto-refreshes every 20s
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {(['all', 'open', 'in_progress', 'done'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                  filter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {f === 'all' ? `All (${counts.all})` :
                 f === 'open' ? `Open (${counts.open})` :
                 f === 'in_progress' ? `In Progress (${counts.in_progress})` :
                 `Done (${counts.done})`}
              </button>
            ))}
          </div>
        </div>

        {/* Summary bar */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {([
            { key: 'open',        label: 'Open',        color: 'bg-red-500'   },
            { key: 'in_progress', label: 'In Progress', color: 'bg-amber-500' },
            { key: 'done',        label: 'Done',        color: 'bg-green-500' },
          ] as const).map(({ key, label, color }) => (
            <div key={key} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${color} flex-shrink-0`}/>
              <div>
                <p className="text-2xl font-bold text-gray-900 leading-none">{counts[key]}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="text-center text-gray-400 py-16">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🎉</p>
            <p className="text-gray-500 font-medium">No {filter !== 'all' ? filter.replace('_', ' ') + ' ' : ''}reports yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(r => {
              const cfg      = STATUS_CFG[r.status];
              const busy     = actionStatus[r.id] === 'busy';
              const isExpanded = expandedId === r.id;

              return (
                <div key={r.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-start gap-3">

                      {/* Status dot */}
                      <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot} flex-shrink-0 mt-1.5`}/>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
                          {r.claimed_by && (
                            <span className="text-xs text-gray-500">
                              👤 <span className="font-medium">{r.claimed_by}</span>
                              {r.status === 'in_progress' ? ' — in progress' : ' — resolved'}
                            </span>
                          )}
                          <span className="text-xs text-gray-400 ml-auto flex-shrink-0">{timeAgo(r.created_at)}</span>
                        </div>

                        <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words">
                          {r.description || <span className="italic text-gray-400">(no description)</span>}
                        </p>

                        {r.page_url && (
                          <p className="text-xs text-gray-400 mt-1 truncate">
                            📍 {r.page_url.replace(/^https?:\/\/[^/]+/, '')}
                          </p>
                        )}
                        {r.user_email && (
                          <p className="text-xs text-gray-400">from: {r.user_email}</p>
                        )}
                      </div>

                      {/* Screenshot thumbnail */}
                      {r.screenshot && (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : r.id)}
                          className="flex-shrink-0 rounded-lg overflow-hidden border border-gray-200 hover:border-blue-300 transition-colors"
                          title="Click to expand screenshot"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={r.screenshot}
                            alt="screenshot"
                            className="w-20 h-14 object-cover"
                          />
                        </button>
                      )}
                    </div>

                    {/* Actions row */}
                    <div className="flex items-center gap-2 mt-3 pl-5 flex-wrap">
                      {r.status === 'open' && (
                        <div className="flex items-center gap-1.5">
                          <input
                            className="border border-gray-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-blue-400 w-36"
                            placeholder="Your name to claim…"
                            value={claimNames[r.id] ?? ''}
                            onChange={e => setClaimNames(s => ({ ...s, [r.id]: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && claim(r.id)}
                          />
                          <button
                            onClick={() => claim(r.id)}
                            disabled={busy || !claimNames[r.id]?.trim()}
                            className="text-xs font-semibold px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                          >
                            {busy ? '…' : actionStatus[r.id] === 'ok' ? '✓' : 'Claim'}
                          </button>
                        </div>
                      )}
                      {r.status === 'in_progress' && (
                        <button
                          onClick={() => patch(r.id, { status: 'done' })}
                          disabled={busy}
                          className="text-xs font-semibold px-2.5 py-1 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 disabled:opacity-50 transition-colors"
                        >
                          {busy ? '…' : '✓ Mark Done'}
                        </button>
                      )}
                      {r.status !== 'open' && (
                        <button
                          onClick={() => patch(r.id, { status: 'open' })}
                          disabled={busy}
                          className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50 transition-colors"
                        >
                          Reopen
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded screenshot */}
                  {isExpanded && r.screenshot && (
                    <div className="border-t border-gray-100 bg-gray-50 p-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={r.screenshot}
                        alt="Full screenshot"
                        className="w-full rounded-xl shadow-sm border border-gray-200"
                      />
                      <p className="text-xs text-gray-400 text-center mt-2">Click thumbnail to collapse</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
