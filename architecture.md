# Architecture Guide

## System Architecture

The Ingestor service follows Clean Architecture principles with clear separation of concerns.

## Clean Architecture Implementation

```
src/
├── domain/           # Business logic and entities
│   ├── entities/     # Core business objects
│   ├── ports/        # Interface definitions
│   ├── services/     # Domain services
│   └── utils/        # Domain utilities
├── application/      # Use cases and business rules
│   └── usecases/     # Application logic
├── infrastructure/   # External concerns
│   ├── config/       # Configuration management
│   ├── db/          # Database layer
│   ├── http/        # HTTP clients
│   ├── providers/   # Provider implementations
│   └── sched/       # Scheduling
└── interfaces/      # External interfaces
    ├── cli/         # Command-line interfaces
    └── rest/        # REST API endpoints
        ├── health/  # Health check feature
        └── metrics/ # Metrics API feature
```

## Key Components

### 1. Provider Chain

Orchestrates data fetching with automatic failover between multiple data sources.

### 2. Repository Pattern

Abstracts database operations with clear interfaces and implementations.

### 3. Use Cases

Encapsulates business logic and coordinates between domain and infrastructure layers.

### 4. HTTP Clients

Handle external API communication with retry logic and error handling.

### 5. Scheduler

Manages automated data updates with configurable cron jobs.

### 6. REST API Layer

Handles HTTP requests with validation, business logic, and data access.

## REST API Architecture

### Request Flow

```
HTTP Request → Router → Controller → Service → Repository → Database
                ↓         ↓          ↓         ↓
            Validation  Business   Data     Persistence
                       Logic     Access
```

### Component Responsibilities

#### Router (`{feature}.routes.ts`)

- Defines API endpoints and HTTP methods
- Injects dependencies (Repository → Service → Controller)
- Maps routes to controller methods

#### Controller (`{feature}.controller.ts`)

- Handles HTTP request/response
- Validates input using Zod schemas
- Calls service layer
- Formats and returns HTTP responses
- Handles errors and status codes

#### Service (`{feature}.service.ts`)

- Contains business logic
- Orchestrates multiple operations
- Calls repository layer
- Handles business rules and validation

#### Repository (`{feature}Repo.ts`)

- Handles data access and persistence
- Abstracts database operations
- Implements data access patterns
- Manages database connections

### Validation Flow

```
Request → Zod Schema → Validation → Controller → Service → Repository
```

### Error Handling Flow

```
Error → Controller → HTTP Status → Structured Response
```

## REST API Implementation Examples

### Feature Structure

```
src/interfaces/rest/{feature}/
├── {feature}.controller.ts    # HTTP request handling
├── {feature}.service.ts       # Business logic
├── {feature}.routes.ts       # Route definitions
└── {feature}.validation.ts    # Zod schemas
```

### Example: Metrics API

```typescript
// metrics.routes.ts
const metricsRoutes = Router();
const metricsRepository = new MetricsRepository();
const metricsService = new MetricsService(metricsRepository);
const metricsController = new MetricsController(metricsService);

metricsRoutes.get('/v1/metrics/:metricId', (req, res) =>
  metricsController.getMetricPoints(req, res)
);
```

```typescript
// metrics.controller.ts
export class MetricsController {
  constructor(private metricsService: MetricsService) {}

  async getMetricPoints(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = GetMetricPointsSchema.parse({
        metricId: req.params.metricId,
        from: req.query.from,
        to: req.query.to,
        limit: req.query.limit,
      });

      const points = await this.metricsService.getPoints(validatedData);
      res.json({
        metric_id: validatedData.metricId,
        points,
        count: points.length,
      });
    } catch (error) {
      // Handle validation and business errors
    }
  }
}
```

```typescript
// metrics.service.ts
export class MetricsService {
  constructor(private metricsRepository: MetricsRepository) {}

  async getPoints(request: GetPointsRequest) {
    const exists = await this.metricsRepository.metricExists(request.metricId);
    if (!exists) {
      throw new Error(`Metric ${request.metricId} not found`);
    }

    return await this.metricsRepository.getMetricPoints(
      request.metricId,
      request.from,
      request.to,
      request.limit || 500
    );
  }
}
```

### Validation Schema Example

```typescript
// metrics.validation.ts
export const GetMetricPointsSchema = z.object({
  metricId: z.string().min(1, 'Metric ID is required'),
  from: z
    .string()
    .optional()
    .refine(
      val => !val || /^\d{4}-\d{2}-\d{2}$/.test(val),
      'From date must be in YYYY-MM-DD format'
    ),
  limit: z.coerce.number().int().min(1).max(5000).optional().default(500),
});
```

## Data Flow

### Daily Update Flow

1. **Scheduler triggers** at 08:05 AM Argentina time
2. **Check database connectivity**
3. **Initialize provider chain** (BCRA Monetarias primary)
4. **For each mapped series**:
   - Get last stored date
   - Fetch new data from BCRA API
   - Perform idempotent upserts
   - Log results
5. **Send summary** with statistics

### Backfill Flow

1. **CLI command** with date range parameters
2. **Validate parameters** and connectivity
3. **For specified series**:
   - Fetch historical data with pagination
   - Normalize data format
   - Store in database
   - Handle duplicates with upserts
4. **Return statistics** and completion status

## Design Patterns

### Repository Pattern

- **Interface**: `ISeriesRepository`, `ISeriesMappingRepository`
- **Implementation**: Database-specific implementations
- **Benefits**: Testability, flexibility, clean separation

### Provider Pattern

- **Interface**: `SeriesProvider`
- **Implementation**: BCRA, DolarApi, INDEC providers
- **Benefits**: Pluggable data sources, fallback support

### Use Case Pattern

- **Application Logic**: `FetchAndStoreSeriesUseCase`, `BackfillSeriesUseCase`
- **Coordination**: Between domain and infrastructure
- **Benefits**: Business logic encapsulation, testability

## Error Handling

- **Retry Logic**: Exponential backoff with jitter
- **Circuit Breaker**: Automatic failover on repeated failures
- **Graceful Degradation**: Continue processing other series on individual failures
- **Comprehensive Logging**: Structured logs for debugging and monitoring

## Monitoring & Observability

### Structured Logging

All operations are logged with structured JSON format for easy parsing and analysis.

### Key Metrics

- **Data Points Processed**: Total points fetched and stored
- **API Response Times**: Latency to external APIs
- **Error Rates**: Failed requests and retry attempts
- **Database Performance**: Query execution times
- **Provider Health**: Availability of external services
