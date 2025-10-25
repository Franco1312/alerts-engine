import { defaultRunDailyAlertsUseCase } from '@/application/use-cases/run-daily-alerts.use-case.js';
import { logger } from '@/infrastructure/log/logger.js';
import { CLI } from '@/infrastructure/log/log-events.js';

async function runAlerts(): Promise<void> {
  const startTime = Date.now();

  logger.info({
    event: CLI.INIT,
    msg: 'Starting alerts evaluation via CLI',
  });

  try {
    await defaultRunDailyAlertsUseCase.execute();

    const duration = Date.now() - startTime;
    logger.info({
      event: CLI.FINISHED,
      msg: 'Alerts evaluation completed successfully',
      data: { duration },
    });

    process.exit(0);
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error({
      event: CLI.ERROR,
      msg: 'Alerts evaluation failed',
      err: error instanceof Error ? error.message : String(error),
      data: { duration },
    });

    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAlerts().catch(error => {
    logger.error({
      event: CLI.FATAL,
      msg: 'Fatal error in CLI',
      err: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}
