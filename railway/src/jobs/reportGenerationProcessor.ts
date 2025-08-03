import { Job } from 'bull';
import { logger } from '../utils/logger';
import SupabaseService from '../services/supabaseService';

interface ReportJobData {
  userId: string;
  jobId: string;
  reportType: string;
  parameters: any;
}

export async function processReportGeneration(job: Job<ReportJobData>): Promise<any> {
  const { userId, jobId, reportType, parameters } = job.data;
  
  logger.info(`📊 Generating report: ${job.id}`, { userId, reportType });

  try {
    await SupabaseService.updateJobRecord(jobId, { status: 'processing' });

    // Simulate report generation
    job.progress(50);
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const report = {
      title: `${reportType} Report`,
      generatedAt: new Date().toISOString(),
      data: { summary: 'Report generated successfully' }
    };
    
    job.progress(100);
    logger.info(`✅ Report generated: ${reportType}`);
    
    await SupabaseService.updateJobRecord(jobId, {
      status: 'completed',
      result: report,
      completed_at: new Date().toISOString()
    });

    return report;
  } catch (error) {
    logger.error(`❌ Report generation failed: ${job.id}`, error);
    await SupabaseService.updateJobRecord(jobId, {
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}