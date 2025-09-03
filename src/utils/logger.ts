import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'biz-buddy-backend' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// If we're not in production, log to the console with a simple format
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf((info) => {
        // Include taskId prominently in console logs when present
        const taskId = info.taskId ? `[Task:${info.taskId}] ` : '';
        const message = typeof info.message === 'object' 
          ? JSON.stringify(info.message) 
          : info.message;
        return `${info.level}: ${taskId}${message}`;
      })
    )
  }));
}

/**
 * Create a child logger with taskId context for searchable logging
 */
export function createTaskLogger(taskId: string) {
  return logger.child({ taskId });
}

export { logger };