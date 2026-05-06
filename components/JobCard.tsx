'use client';

interface Job {
  id: string;
  title: string;
  customer: string;
  status: 'estimate' | 'scheduled' | 'on-site' | 'completed' | 'invoiced' | 'paid';
  date: string;
  amount: number;
}

interface JobCardProps {
  job: Job;
  onStatusChange?: (jobId: string, newStatus: Job['status']) => void;
}

const statusColors = {
  estimate: 'bg-yellow-100 text-yellow-800',
  scheduled: 'bg-blue-100 text-blue-800',
  'on-site': 'bg-orange-100 text-orange-800',
  completed: 'bg-green-100 text-green-800',
  invoiced: 'bg-purple-100 text-purple-800',
  paid: 'bg-emerald-100 text-emerald-800',
};

const statusLabels = {
  estimate: 'Estimate',
  scheduled: 'Scheduled',
  'on-site': 'On Site',
  completed: 'Done',
  invoiced: 'Invoice',
  paid: 'Paid',
};

export default function JobCard({ job, onStatusChange }: JobCardProps) {
  const getNextStatus = (currentStatus: Job['status']): Job['status'] | null => {
    const statusFlow: Job['status'][] = ['estimate', 'scheduled', 'on-site', 'completed', 'invoiced', 'paid'];
    const currentIndex = statusFlow.indexOf(currentStatus);
    return currentIndex < statusFlow.length - 1 ? statusFlow[currentIndex + 1] : null;
  };

  const nextStatus = getNextStatus(job.status);

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{job.title}</h3>
          <p className="text-sm text-gray-600">{job.customer}</p>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[job.status]}`}>
          {statusLabels[job.status]}
        </span>
      </div>

      <div className="flex justify-between items-center mb-4">
        <span className="text-sm text-gray-500">{job.date}</span>
        <span className="text-lg font-semibold text-gray-900">${job.amount}</span>
      </div>

      {nextStatus && onStatusChange && (
        <button
          onClick={() => onStatusChange(job.id, nextStatus)}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          Move to {statusLabels[nextStatus]}
        </button>
      )}
    </div>
  );
}