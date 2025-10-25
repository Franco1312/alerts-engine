import {
  FetchLatestMetricsUseCase,
  defaultFetchLatestMetricsUseCase,
} from './fetch-latest-metrics.use-case.js';
import {
  FetchMetricWindowUseCase,
  defaultFetchMetricWindowUseCase,
} from './fetch-metric-window.use-case.js';
import { RuleEvaluator } from '@/domain/ruleEvaluator.js';
import { logger } from '@/infrastructure/log/logger.js';
import { RULES, EVALUATE } from '@/infrastructure/log/log-events.js';
import { Alert, Rule } from '@/domain/alert.js';
import { readFileSync } from 'fs';
import { join } from 'path';

export class EvaluateAlertsUseCase {
  private rules: Rule[] = [];

  constructor(
    private readonly fetchLatestMetricsUseCase: FetchLatestMetricsUseCase = defaultFetchLatestMetricsUseCase,
    private readonly fetchMetricWindowUseCase: FetchMetricWindowUseCase = defaultFetchMetricWindowUseCase
  ) {
    this.loadRules();
  }

  private loadRules(): void {
    try {
      const rulesPath = join(process.cwd(), 'rules', 'rules.json');
      const rulesData = readFileSync(rulesPath, 'utf-8');
      this.rules = JSON.parse(rulesData) as Rule[];

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

  async execute(): Promise<Alert[]> {
    const startTime = Date.now();
    const alerts: Alert[] = [];

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
        logger.warn({
          event: EVALUATE.RULE_ERROR,
          msg: 'Rule evaluation failed, skipping',
          err: error instanceof Error ? error.message : String(error),
          data: { ruleId: rule.alertId, metricId: rule.metricId },
        });
      }
    }

    const duration = Date.now() - startTime;
    logger.info({
      event: EVALUATE.COMPLETE,
      msg: 'Alert evaluation completed',
      data: {
        alertsGenerated: alerts.length,
        rulesEvaluated: this.rules.length,
        duration,
      },
    });

    return alerts;
  }

  private async evaluateRule(rule: Rule): Promise<Alert | null> {
    const startTime = Date.now();

    try {
      let metricValue: number;
      let metricTs: string;

      if (rule.window) {
        const params: { metricId: string; from?: string; to?: string } = {
          metricId: rule.metricId,
        };
        if (rule.window.from) params.from = rule.window.from;
        if (rule.window.to) params.to = rule.window.to;

        const windowResult =
          await this.fetchMetricWindowUseCase.execute(params);

        if (windowResult.points.length === 0) {
          logger.warn({
            event: EVALUATE.NO_DATA,
            msg: 'No data points found for rule',
            data: { ruleId: rule.alertId, metricId: rule.metricId },
          });
          return null;
        }

        const latestPoint = windowResult.points[windowResult.points.length - 1];
        if (!latestPoint) {
          logger.warn({
            event: EVALUATE.NO_DATA,
            msg: 'No data points found for rule',
            data: { ruleId: rule.alertId, metricId: rule.metricId },
          });
          return null;
        }
        metricValue = parseFloat(latestPoint.value);
        metricTs = latestPoint.ts;
      } else {
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

        metricValue = parseFloat(metricSummary.value);
        metricTs = metricSummary.ts;
      }

      const evaluation = RuleEvaluator.evaluate(rule.condition, metricValue);
      const duration = Date.now() - startTime;

      logger.info({
        event: EVALUATE.RULE_DECISION,
        msg: 'Rule evaluation completed',
        data: {
          ruleId: rule.alertId,
          metricId: rule.metricId,
          value: metricValue,
          condition: rule.condition,
          triggered: evaluation.triggered,
          level: evaluation.level,
          duration,
        },
      });

      if (evaluation.triggered) {
        return {
          alertId: rule.alertId,
          ts: metricTs,
          level: evaluation.level,
          message: rule.message,
          payload: {
            value: metricValue,
            threshold: evaluation.threshold,
            condition: rule.condition,
            metricId: rule.metricId,
          },
        };
      }

      return null;
    } catch (error) {
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

      throw error;
    }
  }
}

export const defaultEvaluateAlertsUseCase = new EvaluateAlertsUseCase();
