import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRailwayJobs, type BackgroundJob } from '@/hooks/useRailwayJobs';
import { Clock, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const statusIcons = {
  pending: Clock,
  in_progress: RefreshCw,
  completed: CheckCircle,
  failed: XCircle,
};

const statusColors = {
  pending: 'bg-yellow-500',
  in_progress: 'bg-blue-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
};

const jobTypeLabels = {
  llm_processing: 'AI Processing',
  data_sync: 'Data Sync',
  notifications: 'Notifications',
  maintenance: 'Maintenance',
};

export function BackgroundJobsMonitor() {
  const { jobs, fetchJobs, loading, subscribeToJobUpdates } = useRailwayJobs();
  const [selectedTab, setSelectedTab] = useState('all');
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // Get current user and fetch jobs
    const initializeMonitor = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        await fetchJobs();
      }
    };

    initializeMonitor();
  }, [fetchJobs]);

  useEffect(() => {
    if (!user) return;

    // Subscribe to real-time job updates
    const unsubscribe = subscribeToJobUpdates(user.id, (updatedJob) => {
      fetchJobs(); // Refresh the jobs list when updates occur
    });

    return unsubscribe;
  }, [user, subscribeToJobUpdates, fetchJobs]);

  const filteredJobs = jobs.filter(job => {
    if (selectedTab === 'all') return true;
    return job.status === selectedTab;
  });

  const jobStats = {
    total: jobs.length,
    pending: jobs.filter(j => j.status === 'pending').length,
    in_progress: jobs.filter(j => j.status === 'in_progress').length,
    completed: jobs.filter(j => j.status === 'completed').length,
    failed: jobs.filter(j => j.status === 'failed').length,
  };

  const JobCard = ({ job }: { job: BackgroundJob }) => {
    const StatusIcon = statusIcons[job.status];
    const isInProgress = job.status === 'in_progress';
    
    return (
      <Card className="mb-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            {jobTypeLabels[job.job_type as keyof typeof jobTypeLabels] || job.job_type}
          </CardTitle>
          <Badge 
            variant="secondary" 
            className={`${statusColors[job.status]} text-white`}
          >
            <StatusIcon className="w-3 h-3 mr-1" />
            {job.status.replace('_', ' ')}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Priority: {job.priority}</span>
              <span>
                Created {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
              </span>
            </div>
            
            {isInProgress && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>Processing...</span>
                  <span>
                    Started {formatDistanceToNow(new Date(job.started_at!), { addSuffix: true })}
                  </span>
                </div>
                <Progress value={75} className="h-2" />
              </div>
            )}
            
            {job.status === 'completed' && job.completed_at && (
              <div className="text-sm text-green-600">
                ✓ Completed {formatDistanceToNow(new Date(job.completed_at), { addSuffix: true })}
              </div>
            )}
            
            {job.status === 'failed' && job.error_message && (
              <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                <AlertCircle className="w-4 h-4 inline mr-1" />
                {job.error_message}
              </div>
            )}
            
            {job.payload && Object.keys(job.payload).length > 0 && (
              <details className="mt-2">
                <summary className="text-sm text-muted-foreground cursor-pointer">
                  View Payload
                </summary>
                <pre className="text-xs bg-gray-50 p-2 rounded mt-1 overflow-auto">
                  {JSON.stringify(job.payload, null, 2)}
                </pre>
              </details>
            )}
            
            {job.result && Object.keys(job.result).length > 0 && (
              <details className="mt-2">
                <summary className="text-sm text-muted-foreground cursor-pointer">
                  View Result
                </summary>
                <pre className="text-xs bg-green-50 p-2 rounded mt-1 overflow-auto">
                  {JSON.stringify(job.result, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Background Jobs</h2>
        <Button 
          onClick={fetchJobs} 
          disabled={loading}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Job Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{jobStats.total}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">{jobStats.pending}</div>
            <div className="text-sm text-muted-foreground">Pending</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{jobStats.in_progress}</div>
            <div className="text-sm text-muted-foreground">In Progress</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{jobStats.completed}</div>
            <div className="text-sm text-muted-foreground">Completed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{jobStats.failed}</div>
            <div className="text-sm text-muted-foreground">Failed</div>
          </CardContent>
        </Card>
      </div>

      {/* Jobs List */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="all">All ({jobStats.total})</TabsTrigger>
          <TabsTrigger value="pending">Pending ({jobStats.pending})</TabsTrigger>
          <TabsTrigger value="in_progress">Running ({jobStats.in_progress})</TabsTrigger>
          <TabsTrigger value="completed">Done ({jobStats.completed})</TabsTrigger>
          <TabsTrigger value="failed">Failed ({jobStats.failed})</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedTab} className="mt-6">
          {filteredJobs.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                {jobs.length === 0 ? (
                  <>
                    <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No background jobs found.</p>
                    <p className="text-sm mt-2">
                      Background jobs will appear here when you start using AI processing, 
                      data sync, or notification features.
                    </p>
                  </>
                ) : (
                  <p>No jobs with status "{selectedTab}"</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredJobs.map(job => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}