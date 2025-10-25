import { Router } from 'express';
import { MetricsClient } from '@/infrastructure/http/metricsClient.js';
import { AlertsRepository } from '@/infrastructure/db/alertsRepo.js';
import { FetchLatestMetricsUseCase } from '@/application/use-cases/fetch-latest-metrics.use-case.js';
import { FetchMetricWindowUseCase } from '@/application/use-cases/fetch-metric-window.use-case.js';
import { EvaluateAlertsUseCase } from '@/application/use-cases/evaluate-alerts.use-case.js';
import { RunDailyAlertsUseCase } from '@/application/use-cases/run-daily-alerts.use-case.js';
import { AlertsService } from './alerts.service.js';
import { AlertsController } from './alerts.controller.js';

const alertsRoutes = Router();

const metricsClient = new MetricsClient();
const alertsRepository = new AlertsRepository();
const fetchLatestMetricsUseCase = new FetchLatestMetricsUseCase(metricsClient);
const fetchMetricWindowUseCase = new FetchMetricWindowUseCase(metricsClient);
const evaluateAlertsUseCase = new EvaluateAlertsUseCase(
  fetchLatestMetricsUseCase,
  fetchMetricWindowUseCase
);
const runDailyAlertsUseCase = new RunDailyAlertsUseCase(
  metricsClient,
  alertsRepository,
  evaluateAlertsUseCase
);

const alertsService = new AlertsService(
  alertsRepository,
  runDailyAlertsUseCase
);
const alertsController = new AlertsController(alertsService);

alertsRoutes.get('/recent', (req, res) =>
  alertsController.getRecentAlerts(req, res)
);

export { alertsRoutes };
