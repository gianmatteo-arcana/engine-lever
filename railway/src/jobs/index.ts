import { 
  businessAnalysisQueue,
  documentProcessingQueue,
  aiTaskQueue,
  emailNotificationQueue,
  reportGenerationQueue 
} from '../services/queueService';

import { processBusinessAnalysis } from './businessAnalysisProcessor';
import { processDocument } from './documentProcessor';
import { processAITask } from './aiTaskProcessor';
import { processEmailNotification } from './emailNotificationProcessor';
import { processReportGeneration } from './reportGenerationProcessor';

import { logger } from '../utils/logger';

// Start all job processors
export async function startJobProcessors(): Promise<void> {
  try {
    // Business Analysis Jobs
    businessAnalysisQueue.process('analyze-business-data', 5, processBusinessAnalysis);
    businessAnalysisQueue.process('market-research', 3, processBusinessAnalysis);
    businessAnalysisQueue.process('competitor-analysis', 3, processBusinessAnalysis);
    
    // Document Processing Jobs
    documentProcessingQueue.process('parse-financial-document', 10, processDocument);
    documentProcessingQueue.process('extract-business-info', 10, processDocument);
    documentProcessingQueue.process('validate-documents', 5, processDocument);
    
    // AI Task Jobs
    aiTaskQueue.process('generate-business-plan', 2, processAITask);
    aiTaskQueue.process('create-marketing-strategy', 3, processAITask);
    aiTaskQueue.process('analyze-customer-feedback', 5, processAITask);
    aiTaskQueue.process('optimize-operations', 2, processAITask);
    
    // Email Notification Jobs
    emailNotificationQueue.process('send-welcome-email', 10, processEmailNotification);
    emailNotificationQueue.process('send-report-ready', 10, processEmailNotification);
    emailNotificationQueue.process('send-reminder', 15, processEmailNotification);
    
    // Report Generation Jobs
    reportGenerationQueue.process('generate-financial-report', 3, processReportGeneration);
    reportGenerationQueue.process('generate-business-insights', 3, processReportGeneration);
    reportGenerationQueue.process('generate-monthly-summary', 5, processReportGeneration);

    logger.info('✅ All job processors started successfully');
    
    // Log processor status
    logProcessorStatus();
    
  } catch (error) {
    logger.error('❌ Failed to start job processors:', error);
    throw error;
  }
}

// Log current processor status
function logProcessorStatus(): void {
  const processors = [
    { name: 'Business Analysis', queue: businessAnalysisQueue },
    { name: 'Document Processing', queue: documentProcessingQueue },
    { name: 'AI Tasks', queue: aiTaskQueue },
    { name: 'Email Notifications', queue: emailNotificationQueue },
    { name: 'Report Generation', queue: reportGenerationQueue },
  ];

  processors.forEach(processor => {
    logger.info(`📊 ${processor.name} processor: ${processor.queue.name} ready`);
  });
}

// Export job types for type safety
export const JobTypes = {
  BUSINESS_ANALYSIS: {
    ANALYZE_DATA: 'analyze-business-data',
    MARKET_RESEARCH: 'market-research',
    COMPETITOR_ANALYSIS: 'competitor-analysis',
  },
  DOCUMENT_PROCESSING: {
    PARSE_FINANCIAL: 'parse-financial-document',
    EXTRACT_BUSINESS_INFO: 'extract-business-info',
    VALIDATE_DOCUMENTS: 'validate-documents',
  },
  AI_TASKS: {
    GENERATE_BUSINESS_PLAN: 'generate-business-plan',
    CREATE_MARKETING_STRATEGY: 'create-marketing-strategy',
    ANALYZE_CUSTOMER_FEEDBACK: 'analyze-customer-feedback',
    OPTIMIZE_OPERATIONS: 'optimize-operations',
  },
  EMAIL_NOTIFICATIONS: {
    WELCOME_EMAIL: 'send-welcome-email',
    REPORT_READY: 'send-report-ready',
    REMINDER: 'send-reminder',
  },
  REPORT_GENERATION: {
    FINANCIAL_REPORT: 'generate-financial-report',
    BUSINESS_INSIGHTS: 'generate-business-insights',
    MONTHLY_SUMMARY: 'generate-monthly-summary',
  },
} as const;