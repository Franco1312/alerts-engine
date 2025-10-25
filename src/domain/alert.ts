export type AlertLevel = 'red' | 'amber' | 'green';

export interface Alert {
  alertId: string;
  ts: string;
  level: AlertLevel;
  message: string;
  payload?: Record<string, unknown>;
}

export interface Rule {
  alertId: string;
  metricId: string;
  level: AlertLevel;
  condition: string;
  message: string;
  window?: {
    from?: string;
    to?: string;
  };
}

export interface MetricPoint {
  ts: string;
  value: string;
}

export interface MetricPointsResponse {
  metric_id: string;
  points: MetricPoint[];
  count: number;
}

export interface MetricSummary {
  metric_id: string;
  ts: string;
  value: string;
}

export interface LatestMetricsResponse {
  items: MetricSummary[];
  missing: string[];
}

export interface ErrorResponse {
  error: string;
  details?: Array<{
    field: string;
    message: string;
  }>;
}

export interface HealthResponse {
  status: 'healthy';
  timestamp: string;
  timezone: string;
  databases: {
    source: boolean;
    target: boolean;
  };
  lastMetricTs: string;
}
