import { Router } from 'express';
import { defaultAlertsController } from './alerts.controller.js';

const alertsRoutes = Router();

alertsRoutes.get('/recent', (req, res) =>
  defaultAlertsController.getRecentAlerts(req, res)
);

export { alertsRoutes };
