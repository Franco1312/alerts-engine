import { AlertLevel, EnrichedAlertPayload, Rule, TrendConfig } from './alert.js';

export interface EvaluationResult {
  triggered: boolean;
  value: number;
  threshold: string;
  level: AlertLevel;
  payload?: EnrichedAlertPayload;
  reason?: string;
}

export interface TrendEvaluationResult {
  triggered: boolean;
  reason: string;
  trendValues: number[];
}

export class RuleEvaluator {
  private static readonly ALLOWED_OPERATORS = [
    '<=',
    '>=',
    '<',
    '>',
    '==',
    '!=',
  ] as const;

  static evaluate(
    rule: Rule,
    value: number,
    trendValues?: number[],
    metadata?: {
      base_ts?: string;
      oficial_fx_source?: string;
    }
  ): EvaluationResult {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new Error(`Invalid value for evaluation: ${value}`);
    }

    switch (rule.type) {
      case 'threshold':
        return this.evaluateThreshold(rule, value, metadata);
      case 'band':
        return this.evaluateBand(rule, value, metadata);
      case 'threshold_with_trend':
        return this.evaluateThresholdWithTrend(rule, value, trendValues || [], metadata);
      default:
        throw new Error(`Unsupported rule type: ${rule.type}`);
    }
  }

  private static evaluateThreshold(
    rule: Rule,
    value: number,
    metadata?: {
      base_ts?: string;
      oficial_fx_source?: string;
    }
  ): EvaluationResult {
    const operator = this.findOperator(rule.condition);
    if (!operator) {
      throw new Error(`Invalid condition format: ${rule.condition}`);
    }

    let thresholdStr = rule.condition.replace(operator, '').trim();
    if (thresholdStr.startsWith('value')) {
      thresholdStr = thresholdStr.replace(/^value\s+/, '').trim();
    }
    const threshold = parseFloat(thresholdStr);

    if (isNaN(threshold)) {
      throw new Error(`Invalid threshold value: ${thresholdStr}`);
    }

    const triggered = this.compareValues(value, operator, threshold);
    const payload = this.buildEnrichedPayload(value, rule, metadata);

    return {
      triggered,
      value,
      threshold: thresholdStr,
      level: rule.level,
      payload,
    };
  }

  private static evaluateBand(
    rule: Rule,
    value: number,
    metadata?: {
      base_ts?: string;
      oficial_fx_source?: string;
    }
  ): EvaluationResult {
    // For band evaluation, we need to parse the condition to extract bounds
    const condition = rule.condition;
    
    // Parse "0.002 < value AND value <= 0.01" format
    const parts = condition.split(' AND ');
    if (parts.length !== 2) {
      throw new Error(`Invalid band condition format: ${condition}`);
    }

    const lowerPart = parts[0]?.trim() || '';
    const upperPart = parts[1]?.trim() || '';

    const lowerMatch = lowerPart.match(/(\d+\.?\d*)\s*<\s*value/);
    const upperMatch = upperPart.match(/value\s*<=\s*(\d+\.?\d*)/);

    if (!lowerMatch || !upperMatch) {
      throw new Error(`Invalid band condition format: ${condition}`);
    }

    const lowerBound = parseFloat(lowerMatch[1]!);
    const upperBound = parseFloat(upperMatch[1]!);

    const triggered = value > lowerBound && value <= upperBound;
    const payload = this.buildEnrichedPayload(value, rule, metadata);

    return {
      triggered,
      value,
      threshold: `(${lowerBound}, ${upperBound}]`,
      level: rule.level,
      payload,
    };
  }

  private static evaluateThresholdWithTrend(
    rule: Rule,
    value: number,
    trendValues: number[],
    metadata?: {
      base_ts?: string;
      oficial_fx_source?: string;
    }
  ): EvaluationResult {
    // First check the threshold condition
    const thresholdResult = this.evaluateThreshold(rule, value, metadata);
    
    if (!thresholdResult.triggered) {
      return {
        ...thresholdResult,
        reason: 'threshold_not_met',
      };
    }

    // Then check the trend
    const trendResult = this.evaluateTrend(rule.trend!, trendValues);
    
    if (!trendResult.triggered) {
      return {
        ...thresholdResult,
        triggered: false,
        reason: trendResult.reason,
      };
    }

    return {
      ...thresholdResult,
      triggered: true,
      reason: 'threshold_and_trend_met',
    };
  }

  private static evaluateTrend(
    trendConfig: TrendConfig,
    values: number[]
  ): TrendEvaluationResult {
    const { windowPoints, rule } = trendConfig;

    if (values.length < windowPoints) {
      return {
        triggered: false,
        reason: 'insufficient_points',
        trendValues: values,
      };
    }

    const recentValues = values.slice(-windowPoints);

    switch (rule) {
      case 'non_decreasing':
        return this.evaluateNonDecreasing(recentValues);
      case 'at_least_4_of_5_increasing':
        return this.evaluateAtLeast4Of5Increasing(recentValues);
      default:
        return {
          triggered: false,
          reason: 'unsupported_trend_rule',
          trendValues: recentValues,
        };
    }
  }

  private static evaluateNonDecreasing(values: number[]): TrendEvaluationResult {
    for (let i = 1; i < values.length; i++) {
      const current = values[i];
      const previous = values[i - 1];
      if (current !== undefined && previous !== undefined && current < previous) {
        return {
          triggered: false,
          reason: 'trend_not_non_decreasing',
          trendValues: values,
        };
      }
    }

    return {
      triggered: true,
      reason: 'trend_non_decreasing',
      trendValues: values,
    };
  }

  private static evaluateAtLeast4Of5Increasing(values: number[]): TrendEvaluationResult {
    let increasingCount = 0;
    
    for (let i = 1; i < values.length; i++) {
      const current = values[i];
      const previous = values[i - 1];
      if (current !== undefined && previous !== undefined && current > previous) {
        increasingCount++;
      }
    }

    const triggered = increasingCount >= 4;
    
    return {
      triggered,
      reason: triggered ? 'trend_at_least_4_increasing' : 'trend_insufficient_increases',
      trendValues: values,
    };
  }

  private static findOperator(condition: string): string | null {
    const sortedOps = [...this.ALLOWED_OPERATORS].sort((a, b) => b.length - a.length);

    for (const op of sortedOps) {
      if (condition.includes(op)) {
        return op;
      }
    }
    return null;
  }

  private static compareValues(
    value: number,
    operator: string,
    threshold: number
  ): boolean {
    switch (operator) {
      case '<=':
        return value <= threshold;
      case '>=':
        return value >= threshold;
      case '<':
        return value < threshold;
      case '>':
        return value > threshold;
      case '==':
        return value === threshold;
      case '!=':
        return value !== threshold;
      default:
        throw new Error(`Unsupported operator: ${operator}`);
    }
  }

  private static buildEnrichedPayload(
    value: number,
    rule: Rule,
    metadata?: {
      base_ts?: string;
      oficial_fx_source?: string;
    }
  ): EnrichedAlertPayload {
    const payload: EnrichedAlertPayload = {
      value,
      value_pct: value * 100,
      threshold: rule.threshold || 0,
      units: rule.units || 'ratio',
    };

    if (rule.window) {
      payload.window = rule.window;
    }

    if (rule.inputs) {
      payload.inputs = rule.inputs;
    }

    if (metadata?.base_ts) {
      payload.base_ts = metadata.base_ts;
    }

    if (metadata?.oficial_fx_source) {
      payload.oficial_fx_source = metadata.oficial_fx_source;
    }

    if (rule.notes) {
      payload.notes = rule.notes;
    }

    return payload;
  }
}