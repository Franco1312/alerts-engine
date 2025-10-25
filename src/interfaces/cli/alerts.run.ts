import { MetricsClient } from '@/infrastructure/http/metricsClient.js';
import { AlertsRepository } from '@/infrastructure/db/alertsRepo.js';
import { FetchLatestMetricsUseCase } from '@/application/use-cases/fetch-latest-metrics.use-case.js';
import { FetchMetricWindowUseCase } from '@/application/use-cases/fetch-metric-window.use-case.js';
import { EvaluateAlertsUseCase } from '@/application/use-cases/evaluate-alerts.use-case.js';
import { RunDailyAlertsUseCase } from '@/application/use-cases/run-daily-alerts.use-case.js';
import { logger } from '@/infrastructure/log/logger.js';
import { CLI } from '@/infrastructure/log/log-events.js';

async function runAlerts(): Promise<void> {
  const startTime = Date.now();

  logger.info({
    event: CLI.INIT,
    msg: 'Starting alerts evaluation via CLI',
  });

  try {
    const metricsClient = new MetricsClient();
    const alertsRepository = new AlertsRepository();

    await alertsRepository.initialize();

    const fetchLatestMetricsUseCase = new FetchLatestMetricsUseCase(
      metricsClient
    );
    const fetchMetricWindowUseCase = new FetchMetricWindowUseCase(
      metricsClient
    );
    const evaluateAlertsUseCase = new EvaluateAlertsUseCase(
      fetchLatestMetricsUseCase,
      fetchMetricWindowUseCase
    );
    const runDailyAlertsUseCase = new RunDailyAlertsUseCase(
      metricsClient,
      alertsRepository,
      evaluateAlertsUseCase
    );

    await runDailyAlertsUseCase.execute();

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
