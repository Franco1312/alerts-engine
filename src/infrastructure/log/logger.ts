import pino from 'pino';
import { config } from '@/infrastructure/config/env.js';

const isDevelopment = process.env.NODE_ENV !== 'production';

const loggerConfig: any = {
  level: config.LOG_LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label: string) => ({ level: label.toUpperCase() }),
  },
  base: {
    service: 'alerts-engine',
  },
};

if (isDevelopment) {
  loggerConfig.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  };
}

export const logger = pino(loggerConfig);

export const createChildLogger = (context: Record<string, unknown>) => {
  return logger.child(context);
};
