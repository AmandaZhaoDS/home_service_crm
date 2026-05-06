'use client';

interface Job {
  id: string;
  title: string;
  customer: string;
  status: 'estimate' | 'scheduled' | 'on-site' | 'completed' | 'invoiced' | 'paid';
  date: string;
  amount: number;
}

interface JobWorkflowProps {
  jobs: Job[];
  onStatusChange: (jobId: string, newStatus: Job['status']) => void;
}

const workflowStages = [
  { id: 'estimate', label: 'Estimate', color: 'bg-yellow-500' },
  { id: 'scheduled', label: 'Scheduled', color: 'bg-blue-500' },
  { id: 'on-site', label: 'On Site', color: 'bg-orange-500' },
  { id: 'completed', label: 'Done', color: 'bg-green-500' },
  { id: 'invoiced', label: 'Invoice', color: 'bg-purple-500' },
  { id: 'paid', label: 'Paid', color: 'bg-emerald-500' },
] as const;

export default function JobWorkflow({ jobs, onStatusChange }: JobWorkflowProps) {
  const getJobsByStatus = (status: Job['status']) => {
    return jobs.filter(job => job.status === status);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Job Workflow</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {workflowStages.map((stage) => {
          const stageJobs = getJobsByStatus(stage.id as Job['status']);

          return (
            <div key={stage.id} className="min-h-[300px]">
              <div className="flex items-center mb-4">
                <div className={`w-3 h-3 rounded-full ${stage.color} mr-2`}></div>
                <h3 className="font-medium text-gray-900">{stage.label}</h3>
                <span className="ml-auto bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs">
                  {stageJobs.length}
                </span>
              </div>

              <div className="space-y-3">
                {stageJobs.map((job) => (
                  <div
                    key={job.id}
                    className="bg-gray-50 rounded-md p-3 border cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => {
                      const nextStage = workflowStages.find(s => s.id === stage.id);
                      const nextIndex = workflowStages.indexOf(nextStage!) + 1;
                      if (nextIndex < workflowStages.length) {
                        onStatusChange(job.id, workflowStages[nextIndex].id as Job['status']);
                      }
                    }}
                  >
                    <h4 className="font-medium text-sm text-gray-900 truncate">{job.title}</h4>
                    <p className="text-xs text-gray-600 truncate">{job.customer}</p>
                    <p className="text-xs text-gray-500 mt-1">${job.amount}</p>
                  </div>
                ))}

                {stageJobs.length === 0 && (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    No jobs in {stage.label.toLowerCase()}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}