export type AlertLevel = 'red' | 'amber' | 'green';

export interface Alert {
  alertId: string;
  ts: string;
  level: AlertLevel;
  message: string;
  payload?: Record<string, unknown>;
}

export type RuleType = 'threshold' | 'band' | 'threshold_with_trend';

export interface TrendConfig {
  windowPoints: number;
  rule: 'non_decreasing' | 'at_least_4_of_5_increasing';
}

export interface Rule {
  alertId: string;
  metricId: string;
  level: AlertLevel;
  type: RuleType;
  condition: string;
  message: string;
  threshold?: number;
  window?: string;
  units?: string;
  inputs?: string[];
  notes?: string;
  minConsecutive?: number;
  trend?: TrendConfig;
}

export interface EnrichedAlertPayload {
  value: number;
  value_pct: number;
  threshold: number;
  window?: string;
  units: string;
  inputs?: string[];
  base_ts?: string;
  oficial_fx_source?: string;
  notes?: string;
  [key: string]: unknown;
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
