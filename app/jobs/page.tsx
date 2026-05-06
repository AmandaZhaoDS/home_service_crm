'use client';

import { useState, useMemo } from 'react';
import { useAuth } from '../../components/AuthProvider';
import { Job, JobStatus } from '../../lib/fieldproStorage';

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
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  estimate: { label: 'Estimate', cls: 'bg-indigo-100 text-indigo-700' },
  scheduled: { label: 'Scheduled', cls: 'bg-blue-100 text-blue-700' },
  'on-site': { label: 'On Site', cls: 'bg-orange-500 text-white' },
  done: { label: 'Done', cls: 'bg-emerald-100 text-emerald-700' },
  'invoice-sent': { label: 'Invoice Sent', cls: 'bg-violet-100 text-violet-700' },
  paid: { label: 'Paid', cls: 'bg-green-100 text-green-700' },
};

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'on-site', label: 'On Site' },
  { key: 'done', label: 'Done' },
];

const PAGE_SIZE = 8;

export default function JobsPage() {
  const { data, updateData } = useAuth();
  const jobs = data?.jobs ?? [];

  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let list = activeTab === 'all' ? jobs : jobs.filter((j) => j.status === activeTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (j) =>
          j.customer.toLowerCase().includes(q) ||
          j.title.toLowerCase().includes(q) ||
          j.address.toLowerCase().includes(q),
      );
    }
    return list;
  }, [jobs, activeTab, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleComplete(job: Job) {
    if (!data) return;
    const next: JobStatus =
      job.status === 'estimate'
        ? 'scheduled'
        : job.status === 'scheduled'
        ? 'on-site'
        : job.status === 'on-site'
        ? 'done'
        : job.status === 'done'
        ? 'invoice-sent'
        : 'paid';
    updateData({
      ...data,
      jobs: data.jobs.map((j) => (j.id === job.id ? { ...j, status: next } : j)),
    });
  }

  const nextStatusLabel = (status: JobStatus) => {
    if (status === 'estimate') return 'Schedule';
    if (status === 'scheduled') return 'Start';
    if (status === 'on-site') return 'Complete';
    if (status === 'done') return 'Invoice';
    if (status === 'invoice-sent') return 'Mark Paid';
    return null;
  };

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
            <span className="text-base leading-none">+</span> New Job
          </button>
          <button className="border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
            New Estimate
          </button>
        </div>
      </div>

      {/* Filter tabs + search */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="flex items-center border-b border-gray-100 px-4 pt-3 gap-1">
          {FILTER_TABS.map((tab) => {
            const active = activeTab === tab.key;
            const isOnSite = tab.key === 'on-site';
            return (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setPage(1); }}
                className={`px-5 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  active
                    ? isOnSite
                      ? 'bg-orange-500 text-white'
                      : 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search & filters */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100">
          <div className="relative flex-1 min-w-[200px]">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="8" />
              <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search by customer, address, job title..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-gray-50"
            />
          </div>
          <button className="flex items-center gap-1.5 border border-gray-200 bg-white text-gray-600 text-sm px-3 py-2.5 rounded-xl hover:bg-gray-50">
            Date Range
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button className="flex items-center gap-1.5 border border-gray-200 bg-white text-gray-600 text-sm px-3 py-2.5 rounded-xl hover:bg-gray-50">
            Technician
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button className="flex items-center gap-1.5 border border-gray-200 bg-white text-gray-600 text-sm px-3 py-2.5 rounded-xl hover:bg-gray-50">
            Status
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">
                  Job ID
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Customer</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Job</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">
                  Date &amp; Time
                  <svg className="inline-block w-3.5 h-3.5 ml-1 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Address</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Amount</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map((job) => {
                const jobId = `#${1000 + jobs.indexOf(job)}`;
                const badge = STATUS_CONFIG[job.status] ?? { label: job.status, cls: 'bg-gray-100 text-gray-700' };
                const nextLabel = nextStatusLabel(job.status);
                const shortAddr = job.address.split(',').slice(0, 2).join(',');

                return (
                  <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-4 font-semibold text-gray-700 whitespace-nowrap">
                      {jobId}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-full ${avatarColor(job.customer)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}
                        >
                          {initials(job.customer)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{job.customer}</p>
                          <p className="text-xs text-gray-500 truncate">{job.title}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-gray-700 whitespace-nowrap">{job.title}</td>
                    <td className="px-4 py-4 text-gray-600 whitespace-nowrap">
                      {formatDate(job.date)}, {job.time}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-gray-600 max-w-[160px]">
                      <span className="truncate block">{shortAddr}</span>
                    </td>
                    <td className="px-4 py-4 font-semibold text-gray-900 whitespace-nowrap">
                      ${job.amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                          View
                        </button>
                        {nextLabel && job.status !== 'paid' && (
                          <button
                            onClick={() => handleComplete(job)}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                          >
                            {nextLabel}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="text-center py-14 text-gray-400 text-sm">
              No jobs found.
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              &lt; Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                    p === page
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next &gt;
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
