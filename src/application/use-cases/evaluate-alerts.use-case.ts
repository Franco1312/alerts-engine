import {
  FetchLatestMetricsUseCase,
  defaultFetchLatestMetricsUseCase,
} from './fetch-latest-metrics.use-case.js';
import {
  FetchMetricWindowUseCase,
  defaultFetchMetricWindowUseCase,
} from './fetch-metric-window.use-case.js';
import {
  AlertsRepository,
  defaultAlertsRepository,
} from '@/infrastructure/db/alertsRepo.js';
import { RuleEvaluator } from '@/domain/ruleEvaluator.js';
import { logger } from '@/infrastructure/log/logger.js';
import { RULES, EVALUATE } from '@/infrastructure/log/log-events.js';
import { Alert, Rule } from '@/domain/alert.js';

interface MetricData {
  value: number;
  ts: string;
  trendValues?: number[];
  oficial_fx_source?: string;
}

export class EvaluateAlertsUseCase {
  private rules: Rule[] = [];

  constructor(
    private readonly fetchLatestMetricsUseCase: FetchLatestMetricsUseCase = defaultFetchLatestMetricsUseCase,
    private readonly fetchMetricWindowUseCase: FetchMetricWindowUseCase = defaultFetchMetricWindowUseCase,
    private readonly alertsRepository: AlertsRepository = defaultAlertsRepository
  ) {
    this.loadRules();
  }

  async execute(): Promise<Alert[]> {
    const startTime = Date.now();
    const alerts: Alert[] = [];

    await this.loadRules();

    logger.info({
      event: EVALUATE.START,
      msg: 'Starting alert evaluation',
      data: { rulesCount: this.rules.length },
    });

    for (const rule of this.rules) {
      try {
        const alert = await this.evaluateRule(rule);
        if (alert) {
          alerts.push(alert);
        }
      } catch (error) {
        this.logRuleError(rule, error);
      }
    }

    if (alerts.length > 0) {
      try {
        const result = await this.alertsRepository.upsertAlerts(alerts);
        logger.info({
          event: EVALUATE.STORED,
          msg: 'Alerts stored with deduplication',
          data: {
            inserted: result.inserted,
            updated: result.updated,
            total: alerts.length,
          },
        });
      } catch (error) {
        logger.error({
          event: EVALUATE.STORE_ERROR,
          msg: 'Failed to store alerts',
          err: error instanceof Error ? error.message : String(error),
          data: { count: alerts.length },
        });
      }
    }

    this.logEvaluationComplete(startTime, alerts.length);
    return alerts;
  }

  private async loadRules(): Promise<void> {
    try {
      this.rules = await this.alertsRepository.getRules();
      logger.info({
        event: RULES.LOAD,
        msg: 'Rules loaded successfully',
        data: { count: this.rules.length },
      });
    } catch (error) {
      logger.error({
        event: RULES.LOAD,
        msg: 'Failed to load rules',
        err: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async evaluateRule(rule: Rule): Promise<Alert | null> {
    const startTime = Date.now();

    try {
      const metricData = await this.fetchMetricData(rule);
      if (!metricData) {
        return null;
      }

      const evaluation = this.evaluateRuleCondition(rule, metricData);
      this.logRuleDecision(rule, metricData, evaluation, startTime);

      if (evaluation.triggered) {
        return this.createAlert(rule, metricData, evaluation);
      }

      return null;
    } catch (error) {
      this.logRuleEvaluationError(rule, error, startTime);
      throw error;
    }
  }

  private async fetchMetricData(rule: Rule): Promise<MetricData | null> {
    if (rule.type === 'threshold_with_trend' && rule.trend) {
      return this.fetchTrendData(rule);
    }

    if (rule.window) {
      return this.fetchWindowData(rule);
    }

    return this.fetchLatestData(rule);
  }

  private async fetchTrendData(rule: Rule): Promise<MetricData | null> {
    const windowResult = await this.fetchMetricWindowUseCase.execute({
      metricId: rule.metricId,
    });

    if (windowResult.points.length === 0) {
      this.logNoDataWarning(rule, 'trend rule');
      return null;
    }

    const latestPoint = windowResult.points[windowResult.points.length - 1];
    if (!latestPoint) {
      this.logNoDataWarning(rule, 'trend rule');
      return null;
    }

    return {
      value: parseFloat(latestPoint.value),
      ts: latestPoint.ts,
      trendValues: windowResult.points.map(point => parseFloat(point.value)),
      ...(latestPoint.oficial_fx_source && {
        oficial_fx_source: latestPoint.oficial_fx_source,
      }),
    };
  }

  private async fetchWindowData(rule: Rule): Promise<MetricData | null> {
    const windowResult = await this.fetchMetricWindowUseCase.execute({
      metricId: rule.metricId,
    });

    if (windowResult.points.length === 0) {
      this.logNoDataWarning(rule, 'rule');
      return null;
    }

    const latestPoint = windowResult.points[windowResult.points.length - 1];
    if (!latestPoint) {
      this.logNoDataWarning(rule, 'rule');
      return null;
    }

    return {
      value: parseFloat(latestPoint.value),
      ts: latestPoint.ts,
      ...(latestPoint.oficial_fx_source && {
        oficial_fx_source: latestPoint.oficial_fx_source,
      }),
    };
  }

  private async fetchLatestData(rule: Rule): Promise<MetricData | null> {
    const latestResult = await this.fetchLatestMetricsUseCase.execute([
      rule.metricId,
    ]);

    if (latestResult.missing.includes(rule.metricId)) {
      logger.warn({
        event: EVALUATE.MISSING_METRIC,
        msg: 'Metric not found in latest data',
        data: { ruleId: rule.alertId, metricId: rule.metricId },
      });
      return null;
    }

    const metricSummary = latestResult.items.find(
      item => item.metric_id === rule.metricId
    );
    if (!metricSummary) {
      logger.warn({
        event: EVALUATE.NO_METRIC_DATA,
        msg: 'Metric data not found',
        data: { ruleId: rule.alertId, metricId: rule.metricId },
      });
      return null;
    }

    return {
      value: parseFloat(metricSummary.value),
      ts: metricSummary.ts,
      ...(metricSummary.oficial_fx_source && {
        oficial_fx_source: metricSummary.oficial_fx_source,
      }),
    };
  }

  private evaluateRuleCondition(rule: Rule, metricData: MetricData) {
    return RuleEvaluator.evaluate(
      rule,
      metricData.value,
      metricData.trendValues,
      {
        base_ts: metricData.ts,
        ...(metricData.oficial_fx_source && {
          oficial_fx_source: metricData.oficial_fx_source,
        }),
      }
    );
  }

  private createAlert(
    rule: Rule,
    metricData: MetricData,
    evaluation: any
  ): Alert {
    return {
      alertId: rule.alertId,
      ts: metricData.ts,
      level: evaluation.level,
      message: rule.message,
      payload: evaluation.payload || {},
    };
  }

  private logNoDataWarning(rule: Rule, context: string): void {
    logger.warn({
      event: EVALUATE.NO_DATA,
      msg: `No data points found for ${context}`,
      data: { ruleId: rule.alertId, metricId: rule.metricId },
    });
  }

  private logRuleDecision(
    rule: Rule,
    metricData: MetricData,
    evaluation: any,
    startTime: number
  ): void {
    const duration = Date.now() - startTime;
    logger.info({
      event: EVALUATE.RULE_DECISION,
      msg: 'Rule evaluation completed',
      data: {
        ruleId: rule.alertId,
        metricId: rule.metricId,
        value: metricData.value,
        condition: rule.condition,
        triggered: evaluation.triggered,
        level: evaluation.level,
        reason: evaluation.reason,
        duration,
      },
    });
  }

  private logRuleError(rule: Rule, error: unknown): void {
    logger.warn({
      event: EVALUATE.RULE_ERROR,
      msg: 'Rule evaluation failed, skipping',
      err: error instanceof Error ? error.message : String(error),
      data: { ruleId: rule.alertId, metricId: rule.metricId },
    });
  }

  private logRuleEvaluationError(
    rule: Rule,
    error: unknown,
    startTime: number
  ): void {
    const duration = Date.now() - startTime;
    logger.error({
      event: EVALUATE.RULE_ERROR,
      msg: 'Rule evaluation failed',
      err: error instanceof Error ? error.message : String(error),
      data: {
        ruleId: rule.alertId,
        metricId: rule.metricId,
        duration,
      },
    });
  }

  private logEvaluationComplete(
    startTime: number,
    alertsGenerated: number
  ): void {
    const duration = Date.now() - startTime;
    logger.info({
      event: EVALUATE.COMPLETE,
      msg: 'Alert evaluation completed',
      data: {
        alertsGenerated,
        rulesEvaluated: this.rules.length,
        duration,
      },
    });
  }
}

export const defaultEvaluateAlertsUseCase = new EvaluateAlertsUseCase();
