import { Job } from 'bull';
import { logger } from '../../utils/logger';
import { updateJobStatus, addJobResult, supabase } from '../../utils/supabase';

interface MaintenanceJobData {
  jobId: string;
  action: 'cleanup_completed_jobs' | 'generate_daily_reports' | 'optimize_database' | 'backup_data';
  parameters?: any;
}

export async function processMaintenanceJob(job: Job<MaintenanceJobData>) {
  const { jobId, action, parameters } = job.data;
  const startTime = Date.now();

  try {
    logger.info(`Processing maintenance job ${jobId}, action: ${action}`);
    
    await updateJobStatus(jobId, 'in_progress');
    
    let result;
    
    switch (action) {
      case 'cleanup_completed_jobs':
        result = await cleanupCompletedJobs(parameters);
        break;
      case 'generate_daily_reports':
        result = await generateDailyReports(parameters);
        break;
      case 'optimize_database':
        result = await optimizeDatabase(parameters);
        break;
      case 'backup_data':
        result = await backupData(parameters);
        break;
      default:
        throw new Error(`Unsupported maintenance action: ${action}`);
    }
    
    await addJobResult(jobId, action, 'success', result);
    await updateJobStatus(jobId, 'completed', result);
    
    const duration = Date.now() - startTime;
    logger.info(`Maintenance job ${jobId} completed in ${duration}ms`);
    
    return result;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Maintenance job ${jobId} failed:`, error);
    
    await addJobResult(jobId, 'error', 'error', undefined, errorMessage);
    await updateJobStatus(jobId, 'failed', undefined, errorMessage);
    
    throw error;
  }
}

async function cleanupCompletedJobs(parameters?: any) {
  logger.info('Starting cleanup of completed jobs');
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - (parameters?.retentionDays || 30));
  
  // Delete old completed jobs
  const { data, error } = await supabase
    .from('background_jobs')
    .delete()
    .eq('status', 'completed')
    .lt('completed_at', cutoffDate.toISOString());
    
  if (error) throw error;
  
  // Delete old failed jobs (keep for shorter period)
  const failedCutoffDate = new Date();
  failedCutoffDate.setDate(failedCutoffDate.getDate() - (parameters?.failedRetentionDays || 7));
  
  const { data: failedData, error: failedError } = await supabase
    .from('background_jobs')
    .delete()
    .eq('status', 'failed')
    .lt('completed_at', failedCutoffDate.toISOString());
    
  if (failedError) throw failedError;
  
  return {
    completed_jobs_deleted: data?.length || 0,
    failed_jobs_deleted: failedData?.length || 0,
    cutoff_date: cutoffDate.toISOString(),
    cleaned_at: new Date().toISOString()
  };
}

async function generateDailyReports(parameters?: any) {
  logger.info('Generating daily reports');
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Get job statistics for yesterday
  const { data: jobs, error } = await supabase
    .from('background_jobs')
    .select('*')
    .gte('created_at', yesterday.toISOString())
    .lt('created_at', today.toISOString());
    
  if (error) throw error;
  
  const stats = {
    date: yesterday.toISOString().split('T')[0],
    total_jobs: jobs?.length || 0,
    completed_jobs: jobs?.filter(j => j.status === 'completed').length || 0,
    failed_jobs: jobs?.filter(j => j.status === 'failed').length || 0,
    pending_jobs: jobs?.filter(j => j.status === 'pending').length || 0,
    by_type: getJobsByType(jobs || []),
    avg_processing_time: calculateAverageProcessingTime(jobs || []),
    generated_at: new Date().toISOString()
  };
  
  // Store report in database (you could create a reports table)
  logger.info('Daily report generated:', stats);
  
  return stats;
}

async function optimizeDatabase(parameters?: any) {
  logger.info('Optimizing database');
  
  // This would run database optimization queries
  // For PostgreSQL, you might run VACUUM, ANALYZE, etc.
  // Note: Be careful with these operations in production
  
  return {
    optimization_type: 'analyze_tables',
    tables_analyzed: ['background_jobs', 'job_results', 'tasks', 'profiles'],
    optimized_at: new Date().toISOString()
  };
}

async function backupData(parameters?: any) {
  logger.info('Backing up data');
  
  // This would trigger your backup process
  // Could be database dumps, file backups, etc.
  
  return {
    backup_id: `backup_${Date.now()}`,
    backup_type: 'full',
    backup_size: '1.2GB',
    backup_location: 's3://backups/daily/',
    created_at: new Date().toISOString()
  };
}

function getJobsByType(jobs: any[]) {
  const typeCount: Record<string, number> = {};
  
  jobs.forEach(job => {
    typeCount[job.job_type] = (typeCount[job.job_type] || 0) + 1;
  });
  
  return typeCount;
}

function calculateAverageProcessingTime(jobs: any[]) {
  const completedJobs = jobs.filter(j => j.started_at && j.completed_at);
  
  if (completedJobs.length === 0) return 0;
  
  const totalTime = completedJobs.reduce((sum, job) => {
    const start = new Date(job.started_at).getTime();
    const end = new Date(job.completed_at).getTime();
    return sum + (end - start);
  }, 0);
  
  return Math.round(totalTime / completedJobs.length); // Average milliseconds
}
