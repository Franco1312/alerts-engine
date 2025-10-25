import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { config } from '@/infrastructure/config/env.js';
import { logger } from '@/infrastructure/log/logger.js';
import { METRICS } from '@/infrastructure/log/log-events.js';
import {
  HealthResponse,
  MetricPointsResponse,
  LatestMetricsResponse,
} from '@/domain/alert.js';

export class MetricsClient {
  private readonly axiosInstance: AxiosInstance;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;

  constructor() {
    this.baseUrl = config.METRICS_API_BASE;
    this.timeout = config.HTTP_TIMEOUT_MS;
    this.retries = config.HTTP_RETRIES;
    this.backoffBaseMs = config.HTTP_BACKOFF_BASE_MS;
    this.backoffMaxMs = config.HTTP_BACKOFF_MAX_MS;

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...(config.METRICS_API_KEY && { 'x-api-key': config.METRICS_API_KEY }),
      },
    });
  }

  async getHealth(): Promise<HealthResponse> {
    const startTime = Date.now();

    logger.info({
      event: METRICS.HEALTH_CHECK,
      msg: 'Checking metrics API health',
      data: { baseUrl: this.baseUrl },
    });

    try {
      const response = await this.makeRequest('GET', '/api/health');
      const duration = Date.now() - startTime;

      logger.info({
        event: METRICS.HEALTH_CHECK,
        msg: 'Metrics API health check successful',
        data: { duration, status: response.status },
      });

      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error({
        event: METRICS.HEALTH_CHECK,
        msg: 'Metrics API health check failed',
        err: error instanceof Error ? error.message : String(error),
        data: { duration, baseUrl: this.baseUrl },
      });

      throw error;
    }
  }

  async getMetricPoints(
    metricId: string,
    params: { from?: string; to?: string; limit?: number } = {}
  ): Promise<MetricPointsResponse> {
    const startTime = Date.now();
    const { from, to, limit = 500 } = params;

    logger.info({
      event: METRICS.GET_POINTS,
      msg: 'Fetching metric points',
      data: { metricId, from, to, limit },
    });

    try {
      const queryParams = new URLSearchParams();
      if (from) queryParams.append('from', from);
      if (to) queryParams.append('to', to);
      if (limit) queryParams.append('limit', limit.toString());

      const path = `/api/v1/metrics/${metricId}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await this.makeRequest('GET', path);
      const duration = Date.now() - startTime;

      logger.info({
        event: METRICS.GET_POINTS,
        msg: 'Metric points fetched successfully',
        data: { metricId, count: response.data.count, duration },
      });

      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error({
        event: METRICS.GET_POINTS,
        msg: 'Failed to fetch metric points',
        err: error instanceof Error ? error.message : String(error),
        data: { metricId, duration },
      });

      throw error;
    }
  }

  async getLatestMetrics(ids: string[]): Promise<LatestMetricsResponse> {
    const startTime = Date.now();

    logger.info({
      event: METRICS.GET_LATEST,
      msg: 'Fetching latest metrics',
      data: { metricIds: ids },
    });

    try {
      const queryParams = new URLSearchParams();
      queryParams.append('ids', ids.join(','));

      const path = `/api/v1/metrics/summary?${queryParams.toString()}`;
      const response = await this.makeRequest('GET', path);
      const duration = Date.now() - startTime;

      logger.info({
        event: METRICS.GET_LATEST,
        msg: 'Latest metrics fetched successfully',
        data: {
          count: response.data.items.length,
          missing: response.data.missing || [],
          duration,
        },
      });

      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error({
        event: METRICS.GET_LATEST,
        msg: 'Failed to fetch latest metrics',
        err: error instanceof Error ? error.message : String(error),
        data: { metricIds: ids, duration },
      });

      throw error;
    }
  }

  private async makeRequest(
    method: string,
    path: string,
    config?: AxiosRequestConfig
  ) {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const response = await this.axiosInstance.request({
          method: method as any,
          url: path,
          ...config,
        });

        return response;
      } catch (error) {
        lastError = error as Error;

        if (attempt === this.retries) {
          break;
        }

        const isRetryable = this.isRetryableError(error);
        if (!isRetryable) {
          throw error;
        }

        const delay = this.calculateBackoffDelay(attempt);

        logger.warn({
          event: METRICS.RETRY,
          msg: 'Retrying request after error',
          data: { attempt: attempt + 1, delay, path, error: lastError.message },
        });

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private isRetryableError(error: unknown): boolean {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      return !status || status >= 500 || status === 408 || status === 429;
    }
    return true;
  }

  private calculateBackoffDelay(attempt: number): number {
    const delay = Math.min(
      this.backoffBaseMs * Math.pow(2, attempt) + Math.random() * 1000,
      this.backoffMaxMs
    );
    return Math.floor(delay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const defaultMetricsClient = new MetricsClient();
