import { logger } from './logger.js';

export class SimpleLogger {
  private context: Record<string, unknown>;

  constructor(context: Record<string, unknown> = {}) {
    this.context = context;
  }

  info(event: string, msg: string, data?: Record<string, unknown>): void {
    logger.info({
      event,
      msg,
      data: { ...this.context, ...data },
    });
  }

  error(
    event: string,
    msg: string,
    err?: Error | string,
    data?: Record<string, unknown>
  ): void {
    logger.error({
      event,
      msg,
      err: err instanceof Error ? err.message : err,
      data: { ...this.context, ...data },
    });
  }

  warn(event: string, msg: string, data?: Record<string, unknown>): void {
    logger.warn({
      event,
      msg,
      data: { ...this.context, ...data },
    });
  }

  child(additionalContext: Record<string, unknown>): SimpleLogger {
    return new SimpleLogger({ ...this.context, ...additionalContext });
  }
}
