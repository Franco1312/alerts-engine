import { Request, Response } from 'express';
import { z } from 'zod';
import { AlertsService, defaultAlertsService } from './alerts.service.js';
import { logger } from '@/infrastructure/log/logger.js';
import { API } from '@/infrastructure/log/log-events.js';

const GetAlertsSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  level: z.enum(['red', 'amber', 'green']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export class AlertsController {
  constructor(
    private readonly alertsService: AlertsService = defaultAlertsService
  ) {}

  async getAlerts(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = GetAlertsSchema.parse({
        from: req.query.from,
        to: req.query.to,
        level: req.query.level,
        limit: req.query.limit,
      });

      const result = await this.alertsService.getAlerts(validatedData);

      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Invalid request parameters',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
        return;
      }

      logger.error({
        event: API.ERROR,
        msg: 'Alerts controller error',
        err: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: 'Internal server error',
      });
    }
  }

  async getRules(req: Request, res: Response): Promise<void> {
    try {
      const rules = await this.alertsService.getRules();

      res.json({
        rules,
        count: rules.length,
      });
    } catch (error) {
      logger.error({
        event: API.ERROR,
        msg: 'Rules controller error',
        err: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: 'Internal server error',
      });
    }
  }
}

export const defaultAlertsController = new AlertsController();
