import { Job } from 'bull';
import { logger } from '../utils/logger';
import SupabaseService from '../services/supabaseService';

interface EmailJobData {
  userId: string;
  jobId: string;
  emailType: string;
  emailData: any;
}

export async function processEmailNotification(job: Job<EmailJobData>): Promise<any> {
  const { userId, jobId, emailType, emailData } = job.data;
  
  logger.info(`📧 Processing email notification: ${job.id}`, { userId, emailType });

  try {
    await SupabaseService.updateJobRecord(jobId, { status: 'processing' });

    // Simulate email sending
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    logger.info(`✅ Email sent: ${emailType}`);
    
    await SupabaseService.updateJobRecord(jobId, {
      status: 'completed',
      result: { emailSent: true, emailType },
      completed_at: new Date().toISOString()
    });

    return { success: true, emailType };
  } catch (error) {
    logger.error(`❌ Email job failed: ${job.id}`, error);
    await SupabaseService.updateJobRecord(jobId, {
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}