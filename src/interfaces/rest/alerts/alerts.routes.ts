import { Router } from 'express';
import { defaultAlertsController } from './alerts.controller.js';

const alertsRoutes = Router();

alertsRoutes.get('/', (req, res) =>
  defaultAlertsController.getAlerts(req, res)
);

alertsRoutes.get('/rules', (req, res) =>
  defaultAlertsController.getRules(req, res)
);

export { alertsRoutes };
