import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from '@/infrastructure/config/env.js';
import { logger } from '@/infrastructure/log/logger.js';
import { SERVER } from '@/infrastructure/log/log-events.js';
import { CronScheduler } from '@/infrastructure/sched/cron.js';
import { MetricsClient } from '@/infrastructure/http/metricsClient.js';
import { AlertsRepository } from '@/infrastructure/db/alertsRepo.js';
import { FetchLatestMetricsUseCase } from '@/application/use-cases/fetch-latest-metrics.use-case.js';
import { FetchMetricWindowUseCase } from '@/application/use-cases/fetch-metric-window.use-case.js';
import { EvaluateAlertsUseCase } from '@/application/use-cases/evaluate-alerts.use-case.js';
import { RunDailyAlertsUseCase } from '@/application/use-cases/run-daily-alerts.use-case.js';
import { healthRoutes } from '@/interfaces/rest/health/health.routes.js';
import { alertsRoutes } from '@/interfaces/rest/alerts/alerts.routes.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/health', healthRoutes);
app.use('/api/v1/alerts', alertsRoutes);

app.use((err: Error, req: express.Request, res: express.Response) => {
  logger.error({
    event: 'SERVER.ERROR',
    msg: 'Unhandled server error',
    err: err.message,
    data: { path: req.path, method: req.method },
  });
  res.status(500).json({ error: 'Internal server error' });
});

async function startServer(): Promise<void> {
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

    const scheduler = new CronScheduler(() => runDailyAlertsUseCase.execute());
    scheduler.start();

    const server = app.listen(config.PORT, () => {
      logger.info({
        event: SERVER.INIT,
        msg: 'Alerts engine server started',
        data: {
          port: config.PORT,
          timezone: config.APP_TIMEZONE,
          schedulerEnabled: config.ENABLE_SCHEDULER,
          databaseEnabled: config.ALERTS_DATABASE_URL !== undefined,
        },
      });
    });

    process.on('SIGTERM', async () => {
      logger.info({
        event: SERVER.SHUTDOWN,
        msg: 'Received SIGTERM, shutting down gracefully',
      });

      scheduler.stop();
      await alertsRepository.close();

      server.close(() => {
        logger.info({
          event: SERVER.SHUTDOWN,
          msg: 'Server shutdown complete',
        });
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      logger.info({
        event: SERVER.SHUTDOWN,
        msg: 'Received SIGINT, shutting down gracefully',
      });

      scheduler.stop();
      await alertsRepository.close();

      server.close(() => {
        logger.info({
          event: SERVER.SHUTDOWN,
          msg: 'Server shutdown complete',
        });
        process.exit(0);
      });
    });
  } catch (error) {
    logger.error({
      event: SERVER.ERROR,
      msg: 'Failed to start server',
      err: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

export { app };
