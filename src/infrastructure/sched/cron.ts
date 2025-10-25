import cron from 'node-cron';
import { config } from '@/infrastructure/config/env.js';
import { logger } from '@/infrastructure/log/logger.js';
import { SCHEDULER } from '@/infrastructure/log/log-events.js';

export class CronScheduler {
  private task: cron.ScheduledTask | null = null;

  constructor(private runDaily: () => Promise<void>) {}

  start(): void {
    if (!config.ENABLE_SCHEDULER) {
      logger.info({
        event: SCHEDULER.INIT,
        msg: 'Scheduler disabled via configuration',
      });
      return;
    }

    const cronExpression = '25 8 * * *';

    logger.info({
      event: SCHEDULER.INIT,
      msg: 'Starting cron scheduler',
      data: {
        expression: cronExpression,
        timezone: config.APP_TIMEZONE,
        nextRun: '08:25 America/Argentina/Buenos_Aires',
      },
    });

    this.task = cron.schedule(
      cronExpression,
      async () => {
        const startTime = Date.now();

        logger.info({
          event: SCHEDULER.RUN,
          msg: 'Starting scheduled daily alert evaluation',
          data: { timezone: config.APP_TIMEZONE },
        });

        try {
          await this.runDaily();

          const duration = Date.now() - startTime;
          logger.info({
            event: SCHEDULER.RUN,
            msg: 'Scheduled daily alert evaluation completed',
            data: { duration },
          });
        } catch (error) {
          const duration = Date.now() - startTime;

          logger.error({
            event: SCHEDULER.RUN,
            msg: 'Scheduled daily alert evaluation failed',
            err: error instanceof Error ? error.message : String(error),
            data: { duration },
          });
        }
      },
      {
        scheduled: true,
        timezone: config.APP_TIMEZONE,
      }
    );
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;

      logger.info({
        event: SCHEDULER.STOP,
        msg: 'Cron scheduler stopped',
      });
    }
  }

  isRunning(): boolean {
    return this.task !== null;
  }
}
