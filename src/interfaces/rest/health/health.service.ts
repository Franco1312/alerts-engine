import {
  MetricsClient,
  defaultMetricsClient,
} from '@/infrastructure/http/metricsClient.js';
import {
  AlertsRepository,
  defaultAlertsRepository,
} from '@/infrastructure/db/alertsRepo.js';
import {
  RunDailyAlertsUseCase,
  defaultRunDailyAlertsUseCase,
} from '@/application/use-cases/run-daily-alerts.use-case.js';
import { logger } from '@/infrastructure/log/logger.js';
import { HEALTH } from '@/infrastructure/log/log-events.js';

export interface HealthStatus {
  ok: boolean;
  time: string;
  timezone: string;
  metricsApi: {
    reachable: boolean;
    status?: string;
    lastMetricTs?: string;
  };
  lastRunAt?: string | undefined;
  alertsCountLastRun?: number;
}

export class HealthService {
  constructor(
    private readonly metricsClient: MetricsClient = defaultMetricsClient,
    private readonly alertsRepository: AlertsRepository = defaultAlertsRepository,
    private readonly runDailyAlertsUseCase: RunDailyAlertsUseCase = defaultRunDailyAlertsUseCase
  ) {}

  async getHealthStatus(): Promise<HealthStatus> {
    const startTime = Date.now();
    const now = new Date();

    logger.info({
      event: HEALTH.CHECK,
      msg: 'Performing health check',
    });

    try {
      const metricsApiHealth = await this.checkMetricsApi();
      const lastRunInfo = this.runDailyAlertsUseCase.getLastRunInfo();

      const health: HealthStatus = {
        ok: metricsApiHealth.reachable,
        time: now.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        metricsApi: metricsApiHealth,
        lastRunAt: lastRunInfo.lastRunAt || undefined,
        alertsCountLastRun: lastRunInfo.alertsCount,
      };

      const duration = Date.now() - startTime;
      logger.info({
        event: HEALTH.CHECK,
        msg: 'Health check completed',
        data: {
          ok: health.ok,
          metricsApiReachable: health.metricsApi.reachable,
          duration,
        },
      });

      return health;
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error({
        event: HEALTH.CHECK,
        msg: 'Health check failed',
        err: error instanceof Error ? error.message : String(error),
        data: { duration },
      });

      return {
        ok: false,
        time: now.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        metricsApi: {
          reachable: false,
        },
      };
    }
  }

  private async checkMetricsApi(): Promise<{
    reachable: boolean;
    status?: string;
    lastMetricTs?: string;
  }> {
    try {
      const health = await this.metricsClient.getHealth();

      return {
        reachable: true,
        status: health.status,
        lastMetricTs: health.lastMetricTs,
      };
    } catch (error) {
      logger.warn({
        event: HEALTH.METRICS_API,
        msg: 'Metrics API health check failed',
        err: error instanceof Error ? error.message : String(error),
      });

      return {
        reachable: false,
      };
    }
  }
}

export const defaultHealthService = new HealthService();
