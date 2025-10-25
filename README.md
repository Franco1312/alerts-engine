# Alerts Engine

A microservice that consumes metrics from the metrics-engine via HTTP and generates alerts based on configurable rules.

## Overview

The alerts-engine is a rules-based alerting system that:

- Consumes metrics data via HTTP from the metrics-engine
- Evaluates configurable rules against metric values
- Generates alerts with different severity levels (red, amber, green)
- Persists alerts to an optional database or runs statelessly
- Provides REST API endpoints for health checks and alert retrieval
- Runs on a scheduled basis (08:25 Argentina time) or on-demand via CLI

## Architecture

```
metrics-engine → (HTTP) → alerts-engine → (optional DB) → REST API
```

## Features

- **HTTP Consumer**: Fetches metrics from metrics-engine via REST API
- **Rules Engine**: Evaluates conditions against metric values safely
- **Scheduled Execution**: Runs daily at 08:25 Argentina time
- **CLI Interface**: Manual execution via `pnpm alerts:run`
- **REST API**: Health checks and alert retrieval
- **Optional Persistence**: Database storage with idempotency
- **Resilient**: HTTP retries, backoff, and error handling
- **Structured Logging**: Comprehensive observability

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL (optional, for persistence)
- metrics-engine running on localhost:3000

### Installation

```bash
# Install dependencies
npm install

# Copy environment configuration
cp env.example .env

# Build the project
npm run build
```

### Environment Configuration

Create a `.env` file with the following variables:

```bash
# Metrics Engine API Configuration
METRICS_API_BASE=http://localhost:3000
METRICS_API_KEY=                    # Optional API key

# Application Configuration
APP_TIMEZONE=America/Argentina/Buenos_Aires
LOG_LEVEL=info
ENABLE_SCHEDULER=true

# Database Configuration (Optional)
ALERTS_DATABASE_URL=postgresql://user:pass@localhost:5432/alerts

# HTTP Client Configuration
HTTP_TIMEOUT_MS=10000
HTTP_RETRIES=3
HTTP_BACKOFF_BASE_MS=250
HTTP_BACKOFF_MAX_MS=4000

# Server Configuration
PORT=3001
```

### Running the Service

```bash
# Development mode with hot reload
npm run dev

# Production mode
npm run build
npm start

# Run alerts evaluation once (CLI)
npm run alerts:run
```

## API Documentation

### Health Check

**GET** `/health`

Returns the service health status including metrics API connectivity.

```json
{
  "ok": true,
  "time": "2025-01-31T10:30:00.000Z",
  "timezone": "America/Argentina/Buenos_Aires",
  "metricsApi": {
    "reachable": true,
    "status": "healthy",
    "lastMetricTs": "2025-01-31"
  },
  "lastRunAt": "2025-01-31T08:25:00.000Z",
  "alertsCountLastRun": 2
}
```

### Recent Alerts

**GET** `/api/v1/alerts/recent?limit=50`

Retrieves recent alerts (from database if enabled, otherwise from memory).

```json
{
  "alerts": [
    {
      "alertId": "ratio.low_reserves_backing",
      "ts": "2025-01-31",
      "level": "red",
      "message": "Reserves-to-base ratio is critically low.",
      "payload": {
        "value": 0.0012,
        "threshold": "0.002",
        "condition": "value <= 0.002",
        "metricId": "ratio.reserves_to_base"
      }
    }
  ],
  "count": 1,
  "limit": 50
}
```

## Rules Configuration

Rules are defined in `rules/rules.json`:

```json
[
  {
    "alertId": "ratio.low_reserves_backing",
    "metricId": "ratio.reserves_to_base",
    "level": "red",
    "condition": "value <= 0.002",
    "message": "Reserves-to-base ratio is critically low."
  },
  {
    "alertId": "reserves.fast_outflow",
    "metricId": "delta.reserves_7d",
    "level": "amber",
    "condition": "value <= -0.05",
    "message": "7-day reserves decrease indicates strong outflow/intervention."
  }
]
```

### Rule Format

- **alertId**: Unique identifier for the alert
- **metricId**: Metric ID from metrics-engine
- **level**: Alert severity (red, amber, green)
- **condition**: Expression to evaluate (e.g., `value <= 0.002`)
- **message**: Human-readable alert message
- **window** (optional): Time window for evaluation

### Supported Operators

- `<=` (less than or equal)
- `>=` (greater than or equal)
- `<` (less than)
- `>` (greater than)
- `==` (equal)
- `!=` (not equal)

## Database Schema

When `ALERTS_DATABASE_URL` is configured, alerts are persisted with the following schema:

```sql
CREATE SCHEMA IF NOT EXISTS alerts;

CREATE TABLE alerts.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id TEXT NOT NULL,
  ts DATE NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('red', 'amber', 'green')),
  message TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(alert_id, ts)
);
```

## Scheduler

The service runs on a cron schedule:

- **Time**: 08:25 America/Argentina/Buenos_Aires
- **Frequency**: Daily
- **Timezone**: Configurable via `APP_TIMEZONE`

To disable the scheduler, set `ENABLE_SCHEDULER=false`.

## Development

### Project Structure

```
src/
├── domain/              # Business objects and rules
├── application/          # Use cases and business logic
├── infrastructure/       # External concerns
│   ├── config/          # Environment configuration
│   ├── http/            # HTTP clients
│   ├── db/              # Database layer
│   ├── log/             # Logging
│   └── sched/           # Scheduling
└── interfaces/           # Entry points
    ├── cli/             # CLI commands
    └── rest/            # REST API endpoints
        ├── health/      # Health check
        └── alerts/      # Alerts API
```

### Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test ruleEvaluator.spec.ts
```

### Linting

```bash
# Check for linting errors
npm run lint

# Fix linting errors
npm run lint:fix

# Type checking
npm run typecheck
```

## Troubleshooting

### Common Issues

1. **Metrics API Unreachable**
   - Check `METRICS_API_BASE` configuration
   - Verify metrics-engine is running
   - Check network connectivity

2. **Database Connection Issues**
   - Verify `ALERTS_DATABASE_URL` format
   - Ensure PostgreSQL is running
   - Check database permissions

3. **Rule Evaluation Failures**
   - Validate rule conditions in `rules/rules.json`
   - Check metric IDs exist in metrics-engine
   - Review logs for specific error messages

4. **Scheduler Not Running**
   - Verify `ENABLE_SCHEDULER=true`
   - Check timezone configuration
   - Review cron expression

### Logs

The service uses structured JSON logging with the following events:

- `SERVER.START` - Server startup
- `DAILY_RUN.START` - Scheduled execution start
- `DAILY_RUN.COMPLETE` - Scheduled execution completion
- `EVALUATE.RULE_DECISION` - Rule evaluation results
- `DATABASE.UPSERT` - Alert persistence
- `HEALTH.CHECK` - Health check execution

### Performance

- HTTP client includes retry logic with exponential backoff
- Database operations use connection pooling
- Rules are loaded once at startup
- In-memory caching for stateless operation

## Contributing

1. Follow the code guidelines in `CODE_GUIDELINES.md`
2. Maintain test coverage above 80%
3. Use structured logging consistently
4. Follow the established architecture patterns
5. Update documentation for new features

## Containerization & Local Orchestration

### **Docker Build**

```bash
# Build the Docker image
docker build -t alerts-engine:dev .

# Run the container directly
docker run -p 3001:3001 --env-file .env alerts-engine:dev
```

### **Docker Compose**

#### **Run without Database (Stateless)**

```bash
# Start alerts-engine only (no persistence)
docker compose up --build

# Check health
curl -s http://localhost:3001/health | jq
```

#### **Run with Database (Persistent)**

```bash
# Start alerts-engine with PostgreSQL
docker compose --profile with-db up --build

# Check health
curl -s http://localhost:3001/health | jq

# Run manual alert evaluation
docker exec -it alerts-engine node dist/interfaces/cli/alerts.run.js
```

### **Metrics Engine Connectivity**

The service needs to connect to `metrics-engine`. Configure `METRICS_API_BASE` based on your setup:

#### **Option 1: Metrics-engine on Host**

```bash
# .env
METRICS_API_BASE=http://localhost:3000
```

#### **Option 2: Alerts-engine in Docker, Metrics-engine on Host**

```bash
# .env
METRICS_API_BASE=http://host.docker.internal:3000
```

#### **Option 3: Both Services in Same Docker Compose**

```bash
# .env
METRICS_API_BASE=http://metrics-engine:3000

# Uncomment the metrics-engine service in docker-compose.yml
```

### **Health Checks**

The service includes comprehensive health checks:

```bash
# Check service health
curl -s http://localhost:3001/health | jq

# Expected response:
{
  "ok": true,
  "time": "2025-01-31T10:30:00.000Z",
  "timezone": "America/Argentina/Buenos_Aires",
  "metricsApi": {
    "reachable": true,
    "status": "healthy",
    "lastMetricTs": "2025-01-31"
  },
  "lastRunAt": "2025-01-31T08:25:00.000Z",
  "alertsCountLastRun": 2
}
```

### **Environment Variables**

| Variable               | Default                            | Description                             |
| ---------------------- | ---------------------------------- | --------------------------------------- |
| `METRICS_API_BASE`     | `http://host.docker.internal:3000` | Metrics engine API URL                  |
| `METRICS_API_KEY`      | -                                  | Optional API key for metrics engine     |
| `APP_TIMEZONE`         | `America/Argentina/Buenos_Aires`   | Application timezone                    |
| `LOG_LEVEL`            | `info`                             | Logging level                           |
| `ENABLE_SCHEDULER`     | `true`                             | Enable cron scheduler                   |
| `ALERTS_DATABASE_URL`  | -                                  | PostgreSQL connection string (optional) |
| `HTTP_TIMEOUT_MS`      | `10000`                            | HTTP client timeout                     |
| `HTTP_RETRIES`         | `3`                                | HTTP retry attempts                     |
| `HTTP_BACKOFF_BASE_MS` | `250`                              | Exponential backoff base delay          |
| `HTTP_BACKOFF_MAX_MS`  | `4000`                             | Maximum backoff delay                   |

### **Profiles**

- **Default**: Run alerts-engine without database (stateless)
- **with-db**: Run alerts-engine with PostgreSQL persistence

### **Data Persistence**

When using the `with-db` profile:

- Alerts are persisted to PostgreSQL
- Database runs on port `5435` (to avoid conflicts)
- Data persists in Docker volume `alerts_db_data`
- Access database: `psql -h localhost -p 5435 -U alerts_user -d alerts_engine`

### **Troubleshooting**

#### **Service Won't Start**

```bash
# Check logs
docker compose logs alerts

# Check if metrics-engine is reachable
docker exec -it alerts-engine curl -f http://host.docker.internal:3000/api/health
```

#### **Database Connection Issues**

```bash
# Check database health
docker compose logs alerts-db

# Test database connection
docker exec -it alerts-db pg_isready -U alerts_user -d alerts_engine
```

#### **Health Check Failing**

```bash
# Manual health check
docker exec -it alerts-engine curl -f http://localhost:3001/health

# Check service status
docker compose ps
```

## License

MIT
