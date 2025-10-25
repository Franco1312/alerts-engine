import { Request, Response } from 'express';
import { z } from 'zod';
import { AlertsService } from './alerts.service.js';
import { logger } from '@/infrastructure/log/logger.js';
import { API } from '@/infrastructure/log/log-events.js';

const GetRecentAlertsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export class AlertsController {
  constructor(private alertsService: AlertsService) {}

  async getRecentAlerts(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = GetRecentAlertsSchema.parse({
        limit: req.query.limit,
      });

      const alerts = await this.alertsService.getRecentAlerts(
        validatedData.limit
      );

      res.json({
        alerts,
        count: alerts.length,
        limit: validatedData.limit,
      });
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
}
