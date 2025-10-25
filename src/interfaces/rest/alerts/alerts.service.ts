import {
  AlertsRepository,
  defaultAlertsRepository,
} from '@/infrastructure/db/alertsRepo.js';
import { logger } from '@/infrastructure/log/logger.js';
import { ALERTS } from '@/infrastructure/log/log-events.js';
import { Alert, EnrichedAlertPayload } from '@/domain/alert.js';

export interface AlertsQueryParams {
  from?: string | undefined;
  to?: string | undefined;
  level?: string | undefined;
  limit?: number | undefined;
}

export interface AlertsResponse {
  alerts: Array<Alert & { payload: EnrichedAlertPayload }>;
  count: number;
  filters: AlertsQueryParams;
}

export class AlertsService {
  constructor(
    private readonly alertsRepository: AlertsRepository = defaultAlertsRepository
  ) {}

  async getAlerts(params: AlertsQueryParams): Promise<AlertsResponse> {
    const startTime = Date.now();
    const { from, to, level, limit = 50 } = params;

    logger.info({
      event: ALERTS.GET_RECENT,
      msg: 'Fetching alerts with filters',
      data: { from, to, level, limit },
    });

    try {
      const alerts = await this.alertsRepository.getAlerts(
        from,
        to,
        level,
        limit
      );

      const duration = Date.now() - startTime;
      logger.info({
        event: ALERTS.GET_RECENT,
        msg: 'Alerts retrieved successfully',
        data: {
          count: alerts.length,
          duration,
          filters: { from, to, level, limit },
        },
      });

      return {
        alerts,
        count: alerts.length,
        filters: { from, to, level, limit },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({
        event: ALERTS.GET_RECENT,
        msg: 'Failed to retrieve alerts',
        err: error instanceof Error ? error.message : String(error),
        data: { from, to, level, limit, duration },
      });

      throw error;
    }
  }

  async getRules(): Promise<any[]> {
    const startTime = Date.now();

    logger.info({
      event: ALERTS.GET_RULES,
      msg: 'Fetching alert rules',
    });

    try {
      const rules = await this.alertsRepository.getRules();

      const duration = Date.now() - startTime;
      logger.info({
        event: ALERTS.GET_RULES,
        msg: 'Rules retrieved successfully',
        data: {
          count: rules.length,
          duration,
        },
      });

      return rules;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({
        event: ALERTS.GET_RULES,
        msg: 'Failed to retrieve rules',
        err: error instanceof Error ? error.message : String(error),
        data: { duration },
      });

      throw error;
    }
  }
}

export const defaultAlertsService = new AlertsService();
