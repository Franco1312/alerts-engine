import { MetricsClient } from '@/infrastructure/http/metricsClient.js';
import { logger } from '@/infrastructure/log/logger.js';
import { FETCH } from '@/infrastructure/log/log-events.js';
import { MetricPointsResponse } from '@/domain/alert.js';

export interface FetchMetricWindowParams {
  metricId: string;
  from?: string;
  to?: string;
  limit?: number;
}

export class FetchMetricWindowUseCase {
  constructor(private metricsClient: MetricsClient) {}

  async execute(
    params: FetchMetricWindowParams
  ): Promise<MetricPointsResponse> {
    const { metricId, from, to, limit } = params;

    logger.info({
      event: FETCH.WINDOW,
      msg: 'Fetching metric window',
      data: { metricId, from, to, limit },
    });

    try {
      const queryParams: { from?: string; to?: string; limit?: number } = {};
      if (from) queryParams.from = from;
      if (to) queryParams.to = to;
      if (limit) queryParams.limit = limit;

      const result = await this.metricsClient.getMetricPoints(
        metricId,
        queryParams
      );

      logger.info({
        event: FETCH.WINDOW,
        msg: 'Metric window fetched successfully',
        data: {
          metricId,
          count: result.count,
          points: result.points.length,
        },
      });

      return result;
    } catch (error) {
      logger.error({
        event: FETCH.WINDOW,
        msg: 'Failed to fetch metric window',
        err: error instanceof Error ? error.message : String(error),
        data: { metricId, from, to, limit },
      });
      throw error;
    }
  }
}
