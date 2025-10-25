import { AlertLevel } from './alert.js';

export interface EvaluationResult {
  triggered: boolean;
  value: number;
  threshold: string;
  level: AlertLevel;
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

  static evaluate(condition: string, value: number): EvaluationResult {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new Error(`Invalid value for evaluation: ${value}`);
    }

    const trimmedCondition = condition.trim();
    const operator = this.findOperator(trimmedCondition);

    if (!operator) {
      throw new Error(`Invalid condition format: ${condition}`);
    }

    // Remove "value" prefix if present
    let thresholdStr = trimmedCondition.replace(operator, '').trim();
    if (thresholdStr.startsWith('value')) {
      thresholdStr = thresholdStr.replace(/^value\s+/, '').trim();
    }
    const threshold = parseFloat(thresholdStr);

    if (isNaN(threshold)) {
      throw new Error(`Invalid threshold value: ${thresholdStr}`);
    }

    const triggered = this.compareValues(value, operator, threshold);

    return {
      triggered,
      value,
      threshold: thresholdStr,
      level: this.determineLevel(triggered, operator, threshold),
    };
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
        return Math.abs(value - threshold) < Number.EPSILON;
      case '!=':
        return Math.abs(value - threshold) >= Number.EPSILON;
      default:
        throw new Error(`Unsupported operator: ${operator}`);
    }
  }

  private static determineLevel(
    triggered: boolean,
    operator: string,
    threshold: number
  ): AlertLevel {
    if (!triggered) {
      return 'green';
    }

    if (operator === '<=' || operator === '<') {
      return threshold <= 0.002 ? 'red' : 'amber';
    }

    if (operator === '>=' || operator === '>') {
      return threshold >= 0.08 ? 'red' : 'amber';
    }

    return 'amber';
  }

  static validateCondition(condition: string): boolean {
    try {
      const trimmedCondition = condition.trim();
      const operator = this.findOperator(trimmedCondition);

      if (!operator) {
        return false;
      }

      const thresholdStr = trimmedCondition.replace(operator, '').trim();
      const threshold = parseFloat(thresholdStr);

      return !isNaN(threshold);
    } catch {
      return false;
    }
  }
}
