import { AlertLevel, EnrichedAlertPayload } from './alert.js';

export interface EvaluationResult {
  triggered: boolean;
  value: number;
  threshold: string;
  level: AlertLevel;
  payload?: EnrichedAlertPayload;
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
    condition: string,
    value: number,
    rule: {
      alertId: string;
      level: AlertLevel;
      threshold?: number;
      units?: string;
      inputs?: string[];
      notes?: string;
      window?: string;
    },
    metadata?: {
      base_ts?: string;
      oficial_fx_source?: string;
    }
  ): EvaluationResult {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new Error(`Invalid value for evaluation: ${value}`);
    }

    const trimmedCondition = condition.trim();

    // Handle complex conditions with AND
    if (trimmedCondition.includes(' AND ')) {
      return this.evaluateComplexCondition(
        trimmedCondition,
        value,
        rule,
        metadata
      );
    }

    const operator = this.findOperator(trimmedCondition);

    if (!operator) {
      throw new Error(`Invalid condition format: ${condition}`);
    }

    let thresholdStr = trimmedCondition.replace(operator, '').trim();
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

  private static evaluateComplexCondition(
    condition: string,
    value: number,
    rule: any,
    metadata?: any
  ): EvaluationResult {
    const parts = condition.split(' AND ');
    if (parts.length !== 2) {
      throw new Error(`Invalid complex condition format: ${condition}`);
    }

    const leftResult = this.evaluateSimpleCondition(
      parts[0]?.trim() || '',
      value
    );
    const rightResult = this.evaluateSimpleCondition(
      parts[1]?.trim() || '',
      value
    );

    const triggered = leftResult.triggered && rightResult.triggered;

    const payload = this.buildEnrichedPayload(value, rule, metadata);

    return {
      triggered,
      value,
      threshold: condition,
      level: rule.level,
      payload,
    };
  }

  private static evaluateSimpleCondition(
    condition: string,
    value: number
  ): { triggered: boolean } {
    const operator = this.findOperator(condition);
    if (!operator) {
      throw new Error(`Invalid simple condition format: ${condition}`);
    }

    let thresholdStr = condition.replace(operator, '').trim();
    if (thresholdStr.startsWith('value')) {
      thresholdStr = thresholdStr.replace(/^value\s+/, '').trim();
    }
    const threshold = parseFloat(thresholdStr);

    if (isNaN(threshold)) {
      throw new Error(`Invalid threshold value: ${thresholdStr}`);
    }

    const triggered = this.compareValues(value, operator, threshold);

    return { triggered };
  }

  private static findOperator(condition: string): string | null {
    // Sort operators by length (longest first) to avoid partial matches
    const sortedOps = [...this.ALLOWED_OPERATORS].sort(
      (a, b) => b.length - a.length
    );

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
    rule: {
      threshold?: number;
      units?: string;
      inputs?: string[];
      notes?: string;
      window?: string;
    },
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
