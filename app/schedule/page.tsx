'use client';

import { useState } from 'react';

interface ScheduledJob {
  id: string;
  title: string;
  customer: string;
  date: string;
  time: string;
  status: 'scheduled' | 'on-site' | 'completed';
  technician?: string;
}

export default function SchedulePage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week' | 'day'>('week');

  const scheduledJobs: ScheduledJob[] = [
    {
      id: '1',
      title: 'Kitchen Plumbing Repair',
      customer: 'John Smith',
      date: '2024-01-15',
      time: '09:00',
      status: 'scheduled',
      technician: 'Mike Johnson',
    },
    {
      id: '2',
      title: 'Bathroom Renovation',
      customer: 'Sarah Johnson',
      date: '2024-01-16',
      time: '14:00',
      status: 'scheduled',
      technician: 'Alex Chen',
    },
    {
      id: '3',
      title: 'HVAC Maintenance',
      customer: 'Mike Davis',
      date: '2024-01-14',
      time: '11:00',
      status: 'on-site',
      technician: 'Sarah Wilson',
    },
    {
      id: '4',
      title: 'Electrical Outlet Installation',
      customer: 'Lisa Brown',
      date: '2024-01-13',
      time: '10:00',
      status: 'completed',
      technician: 'Tom Anderson',
    },
  ];

  const getJobsForDate = (date: string) => {
    return scheduledJobs.filter(job => job.date === date);
  };

  const getWeekDates = () => {
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const formatDate = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const formatDisplayDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  const weekDates = getWeekDates();

  const timeSlots = [
    '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Schedule</h1>
          <p className="text-gray-600 mt-1">Manage your service appointments and technician schedules</p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => setView('month')}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              view === 'month' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
            }`}
          >
            Month
          </button>
          <button
            onClick={() => setView('week')}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              view === 'week' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setView('day')}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              view === 'day' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
            }`}
          >
            Day
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              const newDate = new Date(currentDate);
              if (view === 'week') {
                newDate.setDate(currentDate.getDate() - 7);
              } else if (view === 'month') {
                newDate.setMonth(currentDate.getMonth() - 1);
              } else {
                newDate.setDate(currentDate.getDate() - 1);
              }
              setCurrentDate(newDate);
            }}
            className="p-2 hover:bg-gray-100 rounded-md"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <h2 className="text-lg font-semibold text-gray-900">
            {view === 'week' &&
              `${formatDisplayDate(weekDates[0])} - ${formatDisplayDate(weekDates[6])}`
            }
            {view === 'month' &&
              currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
            }
            {view === 'day' &&
              formatDisplayDate(currentDate)
            }
          </h2>

          <button
            onClick={() => {
              const newDate = new Date(currentDate);
              if (view === 'week') {
                newDate.setDate(currentDate.getDate() + 7);
              } else if (view === 'month') {
                newDate.setMonth(currentDate.getMonth() + 1);
              } else {
                newDate.setDate(currentDate.getDate() + 1);
              }
              setCurrentDate(newDate);
            }}
            className="p-2 hover:bg-gray-100 rounded-md"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Week View */}
      {view === 'week' && (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="grid grid-cols-8 border-b">
            <div className="p-4 border-r bg-gray-50">
              <span className="text-sm font-medium text-gray-500">Time</span>
            </div>
            {weekDates.map((date, index) => (
              <div key={index} className="p-4 border-r bg-gray-50 text-center">
                <div className="text-sm font-medium text-gray-900">
                  {formatDisplayDate(date)}
                </div>
              </div>
            ))}
          </div>

          {timeSlots.map((time) => (
            <div key={time} className="grid grid-cols-8 border-b">
              <div className="p-4 border-r bg-gray-50">
                <span className="text-sm text-gray-500">{time}</span>
              </div>
              {weekDates.map((date, index) => {
                const dateStr = formatDate(date);
                const jobsAtTime = scheduledJobs.filter(job =>
                  job.date === dateStr && job.time === time
                );

                return (
                  <div key={index} className="p-2 border-r min-h-[60px] relative">
                    {jobsAtTime.map((job) => (
                      <div
                        key={job.id}
                        className={`p-2 rounded-md text-xs mb-1 ${
                          job.status === 'scheduled' ? 'bg-blue-100 text-blue-800' :
                          job.status === 'on-site' ? 'bg-orange-100 text-orange-800' :
                          'bg-green-100 text-green-800'
                        }`}
                      >
                        <div className="font-medium truncate">{job.title}</div>
                        <div className="text-xs opacity-75">{job.customer}</div>
                        {job.technician && (
                          <div className="text-xs opacity-75">{job.technician}</div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Today's Schedule Summary */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Today's Schedule</h3>
        <div className="space-y-3">
          {getJobsForDate(formatDate(new Date())).map((job) => (
            <div key={job.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center space-x-4">
                <div className={`w-3 h-3 rounded-full ${
                  job.status === 'scheduled' ? 'bg-blue-500' :
                  job.status === 'on-site' ? 'bg-orange-500' :
                  'bg-green-500'
                }`}></div>
                <div>
                  <h4 className="font-medium text-gray-900">{job.title}</h4>
                  <p className="text-sm text-gray-600">{job.customer}</p>
                  {job.technician && (
                    <p className="text-xs text-gray-500">Technician: {job.technician}</p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-gray-900">{job.time}</div>
                <div className={`text-xs px-2 py-1 rounded-full ${
                  job.status === 'scheduled' ? 'bg-blue-100 text-blue-800' :
                  job.status === 'on-site' ? 'bg-orange-100 text-orange-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                </div>
              </div>
            </div>
          ))}

          {getJobsForDate(formatDate(new Date())).length === 0 && (
            <p className="text-gray-500 text-center py-8">No jobs scheduled for today</p>
          )}
        </div>
      </div>
    </div>
  );
}