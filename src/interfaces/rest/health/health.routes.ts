import { Router } from 'express';
import { MetricsClient } from '@/infrastructure/http/metricsClient.js';
import { AlertsRepository } from '@/infrastructure/db/alertsRepo.js';
import { FetchLatestMetricsUseCase } from '@/application/use-cases/fetch-latest-metrics.use-case.js';
import { FetchMetricWindowUseCase } from '@/application/use-cases/fetch-metric-window.use-case.js';
import { EvaluateAlertsUseCase } from '@/application/use-cases/evaluate-alerts.use-case.js';
import { RunDailyAlertsUseCase } from '@/application/use-cases/run-daily-alerts.use-case.js';
import { HealthService } from './health.service.js';
import { HealthController } from './health.controller.js';

const healthRoutes = Router();

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

const healthService = new HealthService(
  metricsClient,
  alertsRepository,
  runDailyAlertsUseCase
);
const healthController = new HealthController(healthService);

healthRoutes.get('/', (req, res) => healthController.getHealth(req, res));

export { healthRoutes };
