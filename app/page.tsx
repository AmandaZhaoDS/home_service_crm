'use client';

import { useMemo, useState, useEffect } from 'react';
import { useAuth } from '../components/AuthProvider';
import { Job, JobStatus } from '../lib/fieldproStorage';

const WORKFLOW_STEPS: { key: JobStatus; label: string }[] = [
  { key: 'estimate', label: 'Estimate' },
  { key: 'scheduled', label: 'Schedule' },
  { key: 'on-site', label: 'On Site' },
  { key: 'done', label: 'Done' },
  { key: 'invoice-sent', label: 'Invoice' },
  { key: 'paid', label: 'Paid' },
];

const STATUS_BADGE: Record<JobStatus, { label: string; cls: string }> = {
  estimate: { label: 'Estimate', cls: 'bg-indigo-100 text-indigo-700' },
  scheduled: { label: 'Scheduled', cls: 'bg-blue-100 text-blue-700' },
  'on-site': { label: 'On Site', cls: 'bg-orange-500 text-white' },
  done: { label: 'Done', cls: 'bg-emerald-100 text-emerald-700' },
  'invoice-sent': { label: 'Invoice Sent', cls: 'bg-violet-100 text-violet-700' },
  paid: { label: 'Paid', cls: 'bg-green-100 text-green-700' },
};

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-orange-400',
  'bg-violet-500',
  'bg-teal-500',
  'bg-pink-500',
  'bg-amber-500',
  'bg-cyan-500',
];

function avatarColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[Math.abs(h)];
}

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function WorkflowProgress({ status }: { status: JobStatus }) {
  const currentIdx = WORKFLOW_STEPS.findIndex((s) => s.key === status);
  return (
    <div className="flex items-center w-full">
      {WORKFLOW_STEPS.map((step, idx) => {
        const done = idx < currentIdx;
        const current = idx === currentIdx;
        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div
              className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center transition-all ${
                done
                  ? 'bg-blue-600'
                  : current
                  ? 'bg-orange-400 ring-4 ring-orange-100'
                  : 'bg-gray-200'
              }`}
            >
              {done && (
                <svg
                  className="w-3.5 h-3.5 text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            {idx < WORKFLOW_STEPS.length - 1 && (
              <div
                className={`flex-1 h-0.5 ${idx < currentIdx ? 'bg-blue-500' : 'bg-gray-200'}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function JobDetailPanel({ job }: { job: Job }) {
  const total = job.items.reduce((s, i) => s + i.amount * (i.quantity ?? 1), 0);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-2">
          <button className="text-gray-400 hover:text-gray-600 mt-0.5">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-xl font-bold text-gray-900">{job.customer}</h2>
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          <button className="hover:text-blue-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </button>
          <button className="hover:text-gray-700 transition-colors">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="5" cy="12" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="19" cy="12" r="1.5" />
            </svg>
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-500 ml-7 mb-3">{job.address}</p>

      {/* Job title */}
      <div className="flex items-center gap-2 ml-7 mb-4">
        <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        <span className="font-semibold text-gray-800 text-sm">{job.title}</span>
      </div>

      {/* Workflow progress */}
      <div className="px-1 mb-4">
        <WorkflowProgress status={job.status} />
      </div>

      {/* Estimate total */}
      <p className="text-sm font-semibold text-gray-600 mb-4">
        ESTIMATE Total:{' '}
        <span className="text-gray-900">${job.estimate.toFixed(2)}</span>
      </p>

      {/* Work items */}
      {job.items.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            Work in Progress
          </p>
          <div className="space-y-2">
            {job.items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-gray-700">{item.label}</span>
                <span className="font-semibold text-gray-900">
                  ${(item.amount * (item.quantity ?? 1)).toFixed(2)}
                </span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-bold border-t border-gray-100 pt-2 mt-1">
              <span className="text-gray-900">Total:</span>
              <span className="text-gray-900">${total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Notes & Photos */}
      {job.notes && (
        <div className="mb-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            Notes &amp; Photos
          </p>
          <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3 leading-relaxed">
            {job.notes}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-auto pt-2">
        <button className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2.5 px-3 rounded-xl hover:bg-blue-700 transition-colors">
          + Add Work
        </button>
        <button className="flex-1 border border-gray-200 text-gray-700 text-sm font-semibold py-2.5 px-3 rounded-xl hover:bg-gray-50 transition-colors">
          + New Estimate
        </button>
        <button className="border border-gray-200 text-gray-600 text-sm font-semibold py-2.5 px-3 rounded-xl hover:bg-gray-50 transition-colors whitespace-nowrap">
          ··· More
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const { data } = useAuth();
  const jobs = data?.jobs ?? [];
  const today = new Date().toISOString().split('T')[0];

  const todayJobs = useMemo(
    () =>
      jobs.filter(
        (j) => j.date === today || j.status === 'on-site' || j.status === 'scheduled',
      ),
    [jobs, today],
  );

  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  useEffect(() => {
    if (!selectedJob && todayJobs.length > 0) {
      setSelectedJob(todayJobs[0]);
    }
  }, [todayJobs, selectedJob]);

  const stats = useMemo(
    () => ({
      scheduled: jobs.filter((j) => j.status === 'scheduled').length,
      onSite: jobs.filter((j) => j.status === 'on-site').length,
      done: jobs.filter((j) => j.status === 'done').length,
      estimates: jobs.filter((j) => j.status === 'estimate').length,
    }),
    [jobs],
  );

  const recentActivities = useMemo(() => {
    const list: string[] = [];
    jobs.forEach((j) => {
      if (j.status === 'invoice-sent')
        list.push(`Invoice sent to ${j.customer} – $${j.amount.toFixed(2)}.`);
      if (j.status === 'done')
        list.push(`Job completed: ${j.customer} – ${j.title}.`);
      if (j.status === 'estimate')
        list.push(`New estimate created for ${j.customer} – ${j.title}.`);
    });
    return list.slice(0, 5);
  }, [jobs]);

  return (
    <div className="space-y-5">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          A Complete Job{' '}
          <span className="text-blue-600">Workflow</span> on One Screen
        </h1>
        <p className="text-sm text-gray-500 mt-1">Streamlined CRM for home service providers.</p>
      </div>

      {/* 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_260px] gap-5 items-start">
        {/* Left: Today's Jobs */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Today&apos;s Jobs</h3>
            <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
              {todayJobs.length}
            </span>
          </div>

          {todayJobs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No jobs today.</p>
          ) : (
            <div className="space-y-1.5">
              {todayJobs.map((job) => {
                const badge = STATUS_BADGE[job.status];
                const isSelected = selectedJob?.id === job.id;
                return (
                  <button
                    key={job.id}
                    onClick={() => setSelectedJob(job)}
                    className={`w-full text-left p-3 rounded-xl transition-colors ${
                      isSelected
                        ? 'bg-blue-50 ring-1 ring-blue-200'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-full ${avatarColor(job.customer)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}
                      >
                        {initials(job.customer)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">
                          {job.customer}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{job.title}</p>
                        <p className="text-xs text-gray-400">{job.time}</p>
                      </div>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${badge.cls}`}
                      >
                        {badge.label}
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
            <JobDetailPanel job={selectedJob} />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm">
              Select a job from the left to view details.
            </div>
          )}
        </div>

        {/* Right: Today's Summary */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Today&apos;s Summary</h3>
            <span className="text-xs font-semibold text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
              Live
            </span>
          </div>
          <div className="space-y-3">
            <div className="bg-blue-600 rounded-xl p-4 flex items-center justify-between text-white">
              <span className="text-sm font-semibold">Scheduled</span>
              <span className="text-3xl font-bold">{stats.scheduled}</span>
            </div>
            <div className="bg-green-500 rounded-xl p-4 flex items-center justify-between text-white">
              <span className="text-sm font-semibold">On Site</span>
              <span className="text-3xl font-bold">{stats.onSite}</span>
            </div>
            <div className="bg-orange-500 rounded-xl p-4 flex items-center justify-between text-white">
              <span className="text-sm font-semibold">Completed</span>
              <span className="text-3xl font-bold">{stats.done}</span>
            </div>
            <div className="bg-indigo-600 rounded-xl p-4 flex items-center justify-between text-white">
              <span className="text-sm font-semibold">Estimates</span>
              <span className="text-3xl font-bold">{stats.estimates}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      {recentActivities.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="space-y-3">
            {recentActivities.map((activity, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-5 h-5 flex-shrink-0 mt-0.5">
                  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-blue-600">
                    <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth={2} />
                    <path d="M8 2v4M16 2v4M3 10h18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                  </svg>
                </div>
                <p className="text-sm text-gray-700">{activity}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
