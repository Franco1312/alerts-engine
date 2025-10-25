import {
  MetricsClient,
  defaultMetricsClient,
} from '@/infrastructure/http/metricsClient.js';
import { logger } from '@/infrastructure/log/logger.js';
import { FETCH } from '@/infrastructure/log/log-events.js';
import { LatestMetricsResponse } from '@/domain/alert.js';

export class FetchLatestMetricsUseCase {
  constructor(
    private readonly metricsClient: MetricsClient = defaultMetricsClient
  ) {}

  async execute(metricIds: string[]): Promise<LatestMetricsResponse> {
    logger.info({
      event: FETCH.LATEST,
      msg: 'Fetching latest metrics',
      data: { metricIds },
    });

    try {
      const result = await this.metricsClient.getLatestMetrics(metricIds);

      logger.info({
        event: FETCH.LATEST,
        msg: 'Latest metrics fetched successfully',
        data: {
          found: result.items.length,
          missing: result.missing.length,
          total: metricIds.length,
        },
      });

      return result;
    } catch (error) {
      logger.error({
        event: FETCH.LATEST,
        msg: 'Failed to fetch latest metrics',
        err: error instanceof Error ? error.message : String(error),
        data: { metricIds },
      });
      throw error;
    }
  }
}

export const defaultFetchLatestMetricsUseCase = new FetchLatestMetricsUseCase();
