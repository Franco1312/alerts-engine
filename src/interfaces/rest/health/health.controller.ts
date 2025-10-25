import { Request, Response } from 'express';
import { HealthService } from './health.service.js';
import { logger } from '@/infrastructure/log/logger.js';
import { API } from '@/infrastructure/log/log-events.js';

export class HealthController {
  constructor(private healthService: HealthService) {}

  async getHealth(req: Request, res: Response): Promise<void> {
    try {
      const health = await this.healthService.getHealthStatus();

      const statusCode = health.ok ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error) {
      logger.error({
        event: API.ERROR,
        msg: 'Health controller error',
        err: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        ok: false,
        error: 'Internal server error',
      });
    }
  }
}
