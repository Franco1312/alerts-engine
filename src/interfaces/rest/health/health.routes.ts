import { Router } from 'express';
import { defaultHealthController } from './health.controller.js';

const healthRoutes = Router();

healthRoutes.get('/', (req, res) =>
  defaultHealthController.getHealth(req, res)
);

export { healthRoutes };
