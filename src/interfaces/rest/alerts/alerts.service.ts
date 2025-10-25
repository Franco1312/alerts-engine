import { AlertsRepository } from '@/infrastructure/db/alertsRepo.js';
import { RunDailyAlertsUseCase } from '@/application/use-cases/run-daily-alerts.use-case.js';
import { isDatabaseEnabled } from '@/infrastructure/config/env.js';
import { logger } from '@/infrastructure/log/logger.js';
import { ALERTS } from '@/infrastructure/log/log-events.js';
import { Alert } from '@/domain/alert.js';

export class AlertsService {
  constructor(
    private alertsRepository: AlertsRepository,
    private runDailyAlertsUseCase: RunDailyAlertsUseCase
  ) {}

  async getRecentAlerts(limit: number = 50): Promise<Alert[]> {
    const startTime = Date.now();

    logger.info({
      event: ALERTS.GET_RECENT,
      msg: 'Fetching recent alerts',
      data: { limit },
    });

    try {
      let alerts: Alert[];

      if (isDatabaseEnabled()) {
        alerts = await this.alertsRepository.getRecentAlerts(limit);

        logger.info({
          event: ALERTS.GET_RECENT,
          msg: 'Recent alerts retrieved from database',
          data: { count: alerts.length, limit },
        });
      } else {
        alerts = this.runDailyAlertsUseCase.getLastRunAlerts().slice(0, limit);

        logger.info({
          event: ALERTS.GET_RECENT,
          msg: 'Recent alerts retrieved from memory',
          data: { count: alerts.length, limit },
        });
      }

      const duration = Date.now() - startTime;
      logger.info({
        event: ALERTS.GET_RECENT,
        msg: 'Recent alerts retrieved successfully',
        data: { count: alerts.length, duration },
      });

      return alerts;
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error({
        event: ALERTS.GET_RECENT,
        msg: 'Failed to retrieve recent alerts',
        err: error instanceof Error ? error.message : String(error),
        data: { limit, duration },
      });

      throw error;
    }
  }
}
