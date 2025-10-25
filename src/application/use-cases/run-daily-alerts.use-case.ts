import {
  MetricsClient,
  defaultMetricsClient,
} from '@/infrastructure/http/metricsClient.js';
import {
  AlertsRepository,
  defaultAlertsRepository,
} from '@/infrastructure/db/alertsRepo.js';
import {
  EvaluateAlertsUseCase,
  defaultEvaluateAlertsUseCase,
} from './evaluate-alerts.use-case.js';
import { logger } from '@/infrastructure/log/logger.js';
import { DAILY_RUN } from '@/infrastructure/log/log-events.js';
import { Alert } from '@/domain/alert.js';

export class RunDailyAlertsUseCase {
  private lastRunAlerts: Alert[] = [];
  private lastRunAt: string | null = null;

  constructor(
    private readonly metricsClient: MetricsClient = defaultMetricsClient,
    private readonly alertsRepository: AlertsRepository = defaultAlertsRepository,
    private readonly evaluateAlertsUseCase: EvaluateAlertsUseCase = defaultEvaluateAlertsUseCase
  ) {}

  async execute(): Promise<void> {
    const startTime = Date.now();
    const runId = `run_${Date.now()}`;

    logger.info({
      event: DAILY_RUN.START,
      msg: 'Starting daily alert evaluation',
      data: { runId },
    });

    try {
      await this.checkMetricsApiHealth();
      const alerts = await this.evaluateAlertsUseCase.execute();
      await this.persistAlerts(alerts);

      this.lastRunAlerts = alerts;
      this.lastRunAt = new Date().toISOString();

      const duration = Date.now() - startTime;
      logger.info({
        event: DAILY_RUN.COMPLETE,
        msg: 'Daily alert evaluation completed successfully',
        data: {
          runId,
          alertsGenerated: alerts.length,
          duration,
          alertsByLevel: this.getAlertsByLevel(alerts),
        },
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error({
        event: DAILY_RUN.ERROR,
        msg: 'Daily alert evaluation failed',
        err: error instanceof Error ? error.message : String(error),
        data: { runId, duration },
      });

      throw error;
    }
  }

  private async checkMetricsApiHealth(): Promise<void> {
    logger.info({
      event: DAILY_RUN.HEALTH_CHECK,
      msg: 'Checking metrics API health',
    });

    try {
      const health = await this.metricsClient.getHealth();

      if (health.status !== 'healthy') {
        logger.warn({
          event: DAILY_RUN.HEALTH_WARNING,
          msg: 'Metrics API reports unhealthy status',
          data: { status: health.status },
        });
      }

      logger.info({
        event: DAILY_RUN.HEALTH_CHECK,
        msg: 'Metrics API health check completed',
        data: {
          status: health.status,
          lastMetricTs: health.lastMetricTs,
          databases: health.databases,
        },
      });
    } catch (error) {
      logger.error({
        event: DAILY_RUN.HEALTH_ERROR,
        msg: 'Metrics API health check failed',
        err: error instanceof Error ? error.message : String(error),
      });

      throw new Error(
        `Metrics API is unreachable: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async persistAlerts(alerts: Alert[]): Promise<void> {
    if (alerts.length === 0) {
      logger.info({
        event: DAILY_RUN.PERSIST,
        msg: 'No alerts to persist',
      });
      return;
    }

    try {
      const result = await this.alertsRepository.upsertAlerts(alerts);

      logger.info({
        event: DAILY_RUN.PERSIST,
        msg: 'Alerts persisted successfully',
        data: {
          total: alerts.length,
          inserted: result.inserted,
          updated: result.updated,
        },
      });
    } catch (error) {
      logger.error({
        event: DAILY_RUN.PERSIST_ERROR,
        msg: 'Failed to persist alerts',
        err: error instanceof Error ? error.message : String(error),
        data: { count: alerts.length },
      });

      throw error;
    }
  }

  private getAlertsByLevel(alerts: Alert[]): Record<string, number> {
    return alerts.reduce(
      (acc, alert) => {
        acc[alert.level] = (acc[alert.level] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  getLastRunInfo(): { lastRunAt: string | null; alertsCount: number } {
    return {
      lastRunAt: this.lastRunAt,
      alertsCount: this.lastRunAlerts.length,
    };
  }

  getLastRunAlerts(): Alert[] {
    return [...this.lastRunAlerts];
  }
}

export const defaultRunDailyAlertsUseCase = new RunDailyAlertsUseCase();
