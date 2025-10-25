# Code Guidelines - Ingestor Project

## Overview

This document defines the coding standards, patterns, and architectural guidelines for the Ingestor project. These guidelines ensure consistency, maintainability, and readability across the codebase.

## Core Principles

### 1. **Simplicity Over Complexity**

- Avoid over-engineering
- Prefer direct functions over classes when possible
- Eliminate unnecessary abstractions
- Keep methods focused and single-purpose

### 2. **Consistent Logging**

- Use only essential logs: `INIT`, `FINISHED`, `ERROR`
- Avoid verbose logging and intermediate steps
- Include minimal but relevant data in logs
- Use structured logging with `event`, `msg`, `data`, `err` fields

### 3. **Date Handling**

- Always use `DateService` for date operations
- Never implement custom date parsing
- Centralize date validation and formatting
- Use `DateService.formatDate()`, `DateService.validateDateRange()`, etc.

### 4. **Error Handling**

- Never instantiate `Error` objects solely for logging
- Pass strings directly to logger when possible
- Use early returns to reduce nesting
- Handle errors at the appropriate level

## Architecture Patterns

### **Provider Pattern**

All data providers must implement the `SeriesProvider` interface:

```typescript
export interface SeriesProvider {
  readonly name: string;
  health(): Promise<ProviderHealth>;
  fetchRange(params: FetchRangeParams): Promise<FetchRangeResult>;
  getAvailableSeries?(): Promise<Array<{...}>>;
}
```

### **HTTP Client Pattern**

- Extend `BaseHttpClient` for all external API clients
- Use configuration from `config.externalServices`
- Implement health checks and proper error handling
- Follow the pattern: `BcraClient`, `DolarApiClient`, etc.

### **Repository Pattern**

- Domain services MUST access data through repository interfaces
- NEVER access database clients directly from domain services
- Repository interfaces belong in `domain/ports/`
- Repository implementations belong in `infrastructure/db/`
- Domain services receive repository instances via dependency injection
- Use singleton pattern for repository instances to reuse database connections

### **Dependency Injection Pattern**

All classes MUST use dependency injection with exported default instances:

```typescript
// ✅ CORRECT - Export default instances
export const defaultMetricsClient = new MetricsClient();
export const defaultAlertsRepository = new AlertsRepository();
export const defaultEvaluateAlertsUseCase = new EvaluateAlertsUseCase(
  defaultMetricsClient,
  defaultAlertsRepository
);

// ✅ CORRECT - Use private readonly with default instances in constructor
export class SomeService {
  constructor(
    private readonly metricsClient: MetricsClient = defaultMetricsClient,
    private readonly alertsRepository: AlertsRepository = defaultAlertsRepository,
    private readonly evaluateUseCase: EvaluateAlertsUseCase = defaultEvaluateAlertsUseCase
  ) {}
}

// ❌ WRONG - Direct instantiation in constructor
export class WrongService {
  constructor() {
    this.metricsClient = new MetricsClient(); // DON'T DO THIS
  }
}

// ❌ WRONG - No default instances
export class AlsoWrongService {
  constructor(
    private metricsClient: MetricsClient, // DON'T DO THIS
    private alertsRepository: AlertsRepository
  ) {}
}
```

**Key Principles:**

- Always export `default[ServiceName]` constants
- Use `private readonly` with default instances
- Constructor parameters are optional for testing/overrides
- Default instances enable easy testing and configuration
- Follow the pattern: `default[ServiceName] = new ServiceName()`
- Repository singletons should be exported from `infrastructure/db/` modules

### **Import Management**

- ALWAYS use absolute imports, never relative imports
- Use `@/` prefix for all imports from the `src/` directory
- Examples: `import { DateService } from '@/domain/utils/dateService.js'`
- This ensures consistency and makes refactoring easier

### **Configuration Management**

- All external service URLs and timeouts go in config files
- Use environment-specific configurations
- Never hardcode URLs or timeouts in providers/clients
- Follow the pattern: `config.externalServices.{serviceName}`

## Code Structure

### **File Organization**

```
src/
├── domain/           # Business logic and entities
├── application/      # Use cases
├── infrastructure/   # External concerns
│   ├── config/       # Configuration
│   ├── http/         # HTTP clients
│   ├── providers/    # Data providers
│   └── db/          # Database
└── interfaces/       # Entry points (CLI, REST)
    ├── cli/          # CLI commands
    ├── rest/         # HTTP API endpoints
    │   ├── health/   # Health feature
    │   │   ├── health.controller.ts
    │   │   ├── health.service.ts
    │   │   └── health.routes.ts
    │   └── metrics/  # Metrics feature
    │       ├── metrics.controller.ts
    │       ├── metrics.service.ts
    │       └── metrics.routes.ts
```

### **Provider Implementation**

```typescript
export class ExampleProvider implements SeriesProvider {
  readonly name = 'EXAMPLE_PROVIDER';
  private readonly httpClient: ExampleClient;

  constructor() {
    this.httpClient = new ExampleClient();
  }

  async health(): Promise<ProviderHealth> {
    // Health check implementation
  }

  async fetchRange(params: FetchRangeParams): Promise<FetchRangeResult> {
    // Fetch implementation with minimal logging
  }

  private normalizeResponse(
    response: unknown,
    seriesId: string
  ): SeriesPoint[] {
    // Normalization using DateService
  }
}
```

### **HTTP Server Implementation**

```typescript
// Server setup with Express
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { logger } from '@/infrastructure/log/logger.js';

const app = express();

// Middleware setup
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/metrics', metricsRoutes);

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error({
    event: 'SERVER.ERROR',
    msg: 'Unhandled server error',
    err,
    data: { path: req.path, method: req.method },
  });
  res.status(500).json({ error: 'Internal server error' });
});

export { app };
```

### **Feature Organization**

Each feature follows the same pattern:

- **Controller**: Handles HTTP requests/responses, validation, error handling
- **Service**: Contains business logic and orchestration
- **Routes**: Defines API endpoints and dependency injection
- **Repository**: Handles data access and persistence (when needed)

### **REST API Flow**

The standard flow for REST endpoints follows this pattern:

1. **Router** → Defines routes and injects dependencies
2. **Controller** → Validates input, calls service, formats response
3. **Service** → Contains business logic, calls repository
4. **Repository** → Handles data access (optional, can be direct DB access)

```typescript
// health.controller.ts
export class HealthController {
  constructor(private healthService: HealthService) {}

  async getHealth(req: Request, res: Response): Promise<void> {
    try {
      const health = await this.healthService.getHealthStatus();
      res.json(health);
    } catch (error) {
      res.status(500).json({ error: 'Health check failed' });
    }
  }
}

// health.service.ts
export class HealthService {
  async getHealthStatus(): Promise<HealthStatus> {
    // Business logic here
  }
}

// health.routes.ts
export const healthRoutes = Router();
const healthController = new HealthController(new HealthService());

healthRoutes.get('/', (req, res) => healthController.getHealth(req, res));
```

### **HTTP Client Implementation**

```typescript
export class ExampleClient extends BaseHttpClient {
  constructor() {
    super(
      config.externalServices.example.baseUrl,
      config.externalServices.example.timeout
    );
  }

  async getData(): Promise<unknown> {
    // Implementation using this.axiosInstance
  }
}
```

## Logging Standards

### **Essential Logs Only**

```typescript
// ✅ Good - Essential logs
logger.info({
  event: events.FETCH_RANGE,
  msg: 'Starting data fetch',
  data: { externalId, from, to },
});

logger.info({
  event: events.FETCH_RANGE,
  msg: 'Data fetch completed',
  data: { externalId, totalPointsFetched: points.length },
});

// ❌ Bad - Verbose logging
logger.info({
  event: events.FETCH_RANGE,
  msg: 'Fetched page',
  data: {
    externalId,
    pageOffset: currentOffset - limit,
    pagePointsCount: pagePoints.length,
    totalPointsSoFar: allPoints.length,
    hasMore,
  },
});
```

### **Error Logging**

```typescript
// ✅ Good - Direct string logging
logger.error({
  event: events.FETCH_RANGE,
  msg: 'Data fetch failed',
  err: error instanceof Error ? error.message : String(error),
  data: { externalId },
});

// ❌ Bad - Unnecessary Error instantiation
logger.error({
  event: events.FETCH_RANGE,
  msg: 'Data fetch failed',
  err: new Error('Custom error message'),
});
```

## Date Handling

### **Always Use DateService**

```typescript
// ✅ Good
const date = DateService.formatDate(new Date(dateString));
const isValid = DateService.validateDateRange(from, to);

// ❌ Bad
const date = new Date(dateString).toISOString().split('T')[0];
```

### **Centralized Date Operations**

- Use `DateService.formatDate()` for date formatting
- Use `DateService.validateDateRange()` for validation
- Use `DateService.getYesterday()` instead of custom implementations
- Never implement custom date parsing logic

## Configuration Standards

### **External Services**

```typescript
// types.ts
export interface ExternalServicesConfig {
  bcra: ExternalServiceConfig;
  bcraCambiarias: ExternalServiceConfig;
  datosArgentina: ExternalServiceConfig;
  dolarApi: ExternalServiceConfig;
}

// environments/local.ts
export const localConfig: EnvironmentConfig = {
  externalServices: {
    bcra: {
      baseUrl: 'https://api.bcra.gob.ar',
      timeout: 30000,
      retries: 3,
      caBundlePath: process.env.BCRA_CA_BUNDLE_PATH,
    },
    dolarApi: {
      baseUrl: 'https://dolarapi.com/v1',
      timeout: 15000,
      retries: 3,
    },
  },
};
```

### **HTTP Client Configuration**

```typescript
export class ExampleClient extends BaseHttpClient {
  constructor() {
    super(
      config.externalServices.example.baseUrl,
      config.externalServices.example.timeout
    );

    if (config.externalServices.example.caBundlePath) {
      this.axiosInstance.defaults.httpsAgent = this.createHttpsAgent(
        config.externalServices.example.caBundlePath
      );
    }
  }
}
```

## Code Quality

### **Function Complexity**

- Keep functions under 20 lines when possible
- Use early returns to reduce nesting
- Extract complex logic into private methods
- Prefer functional programming patterns (`map`, `filter`, `some`, `find`)

### **Type Safety**

- Use proper TypeScript types
- Avoid `any` types
- Use type guards for runtime checks
- Leverage optional chaining (`?.`) for safe property access

### **Error Handling**

- Use try-catch blocks appropriately
- Don't catch errors just to re-throw them
- Provide meaningful error messages
- Handle errors at the right level of abstraction

### **Code Comments**

- **NO COMMENTS**: Do not add comments in the code
- Code should be self-explanatory through clear naming and structure
- If code needs explanation, refactor it to be more readable
- Use descriptive variable and function names instead of comments

### **Input Validation**

- Use **Zod** for all input validation in REST endpoints
- Create validation schemas in `{feature}.validation.ts`
- Validate in controllers before calling services
- Return structured error responses with field-specific details

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

// metrics.controller.ts
const validatedData = GetMetricPointsSchema.parse({
  metricId: req.params.metricId,
  from: req.query.from,
  to: req.query.to,
  limit: req.query.limit,
});
```

### **API Documentation**

- Use **OpenAPI/Swagger** for all REST endpoints
- Create comprehensive schemas in `swagger.config.ts`
- Include examples for all request/response types
- Document error codes and validation rules
- Make documentation available at `/api/docs`

```typescript
// swagger.config.ts
const swaggerDefinition: SwaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Metrics Engine API',
    version: '1.0.0',
    description: 'API for accessing computed financial metrics',
  },
  components: {
    schemas: {
      MetricPoint: {
        type: 'object',
        properties: {
          ts: { type: 'string', format: 'date', example: '2025-01-31' },
          value: { type: 'number', example: 0.0012 },
        },
        required: ['ts', 'value'],
      },
    },
  },
  paths: {
    '/api/v1/metrics/{metricId}': {
      get: {
        summary: 'Get historical metric values',
        parameters: [
          {
            name: 'metricId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: 'ratio.reserves_to_base',
          },
        ],
        responses: {
          '200': {
            description: 'Metric points retrieved successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MetricPointsResponse' },
              },
            },
          },
        },
      },
    },
  },
};
```

## Testing Standards

### **Test Organization**

```
src/
├── {feature}/
│   └── tests/
│       ├── unit/
│       │   └── {name}.spec.ts
│       └── e2e/
│           └── {name}.e2e.spec.ts
```

### **Test Naming**

- Use `.spec.ts` extension
- Organize by feature and type (unit/e2e)
- Use descriptive test names

## Documentation

### **Code Documentation**

- No JSDoc comments (ultra-clean code)
- No single-line comments (`//`)
- Self-documenting code through clear naming
- Business documentation in separate `.md` files

### **Business Documentation**

- Create comprehensive docs for data models
- Include examples with real data
- Document data sources and caveats
- Use Spanish for business context, English for technical terms

## Migration and Database

### **Database Migrations**

- Use numbered migration files: `001_schema.sql`, `002_add_timestamps.sql`
- Include automatic timestamp columns (`created_at`, `updated_at`)
- Create triggers for automatic `updated_at` updates
- Document schema changes

### **Data Model Documentation**

- Document each table and column with business meaning
- Include real examples from the system
- Explain data sources and update frequencies
- Provide FAQ for common questions

## Environment Configuration

### **Environment Variables**

```bash
# HTTP Configuration
HTTP_TIMEOUT_MS=20000
HTTP_RETRIES=3
HTTP_BACKOFF_BASE_MS=250
HTTP_BACKOFF_FACTOR=2
HTTP_BACKOFF_MAX_MS=8000

# External Services
BCRA_CA_BUNDLE_PATH=/app/certs/bcra-chain.pem
DATABASE_URL=postgresql://user:pass@localhost:5433/ingestor

# Provider Configuration
PRIMARY_PROVIDER=BCRA_MONETARIAS
FALLBACK_PROVIDER=DATOS_SERIES
```

## Code Review Checklist

### **Before Committing**

- [ ] No TypeScript errors (`npm run typecheck`)
- [ ] No linting errors (`npm run lint`)
- [ ] Code follows provider pattern
- [ ] Uses `DateService` for date operations
- [ ] Minimal logging (INIT, FINISHED, ERROR only)
- [ ] Configuration externalized
- [ ] No unnecessary Error instantiation
- [ ] No JSDoc or single-line comments
- [ ] Self-documenting code

### **Provider Review**

- [ ] Implements `SeriesProvider` interface
- [ ] Uses HTTP client pattern
- [ ] Configuration from external services
- [ ] Health check implementation
- [ ] Proper error handling
- [ ] Uses `DateService` for date operations

### **HTTP Client Review**

- [ ] Extends `BaseHttpClient`
- [ ] Uses configuration from config files
- [ ] Implements health check
- [ ] Proper error handling and logging
- [ ] No hardcoded URLs or timeouts

## Examples

### **Good Provider Implementation**

```typescript
export class BcraCambiariasProvider implements SeriesProvider {
  readonly name = 'BCRA_CAMBIARIAS';
  private readonly bcraCambiariasClient: BcraCambiariasClient;

  constructor() {
    this.bcraCambiariasClient = new BcraCambiariasClient();
  }

  async health(): Promise<ProviderHealth> {
    const startTime = Date.now();
    try {
      const healthResult = await this.bcraCambiariasClient.healthCheck();
      return {
        isHealthy: healthResult.isHealthy,
        responseTime: Date.now() - startTime,
        error: healthResult.error,
      };
    } catch (error) {
      return {
        isHealthy: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async fetchRange(params: FetchRangeParams): Promise<FetchRangeResult> {
    const { externalId, from, to, limit = 1000, offset = 0 } = params;

    logger.info({
      event: events.FETCH_RANGE,
      msg: 'Starting BCRA Cambiarias data fetch',
      data: { externalId, from, to },
    });

    try {
      const allPoints: SeriesPoint[] = [];
      let currentOffset = offset;
      let hasMore = true;

      while (hasMore) {
        const responseBody = await this.bcraCambiariasClient.getSeriesData({
          seriesId: externalId,
          from,
          to,
          limit,
          offset: currentOffset,
        });

        const pagePoints = this.normalizeResponse(responseBody, externalId);
        allPoints.push(...pagePoints);

        hasMore = pagePoints.length === limit;
        currentOffset += limit;
      }

      logger.info({
        event: events.FETCH_RANGE,
        msg: 'BCRA Cambiarias data fetch completed',
        data: { externalId, totalPointsFetched: allPoints.length },
      });

      return {
        points: allPoints,
        totalCount: allPoints.length,
        hasMore: false,
        provider: this.name,
      };
    } catch (error) {
      logger.error({
        event: events.FETCH_RANGE,
        msg: 'BCRA Cambiarias data fetch failed',
        err: error as Error,
        data: { externalId },
      });
      throw error;
    }
  }

  private normalizeResponse(
    response: unknown,
    seriesId: string
  ): SeriesPoint[] {
    const points: SeriesPoint[] = [];
    const responseData = response as Record<string, unknown>;

    if (responseData?.results) {
      const results = responseData.results as unknown[];
      for (const item of results) {
        const itemData = item as Record<string, unknown>;
        const date = DateService.formatDate(new Date(itemData.fecha as string));
        const value = this.parseValue(itemData.valor);

        if (date && value !== null) {
          points.push({ seriesId, ts: date, value });
        }
      }
    }
    return points;
  }

  private parseValue(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsedValue = Number(value);
    return isNaN(parsedValue) ? null : parsedValue;
  }
}
```

### **Good HTTP Client Implementation**

```typescript
export class DolarApiClient extends BaseHttpClient {
  constructor() {
    super(
      config.externalServices.dolarApi.baseUrl,
      config.externalServices.dolarApi.timeout
    );
  }

  async getMEPData(): Promise<unknown> {
    logger.info({
      event: events.GET_SERIES_DATA,
      msg: 'Fetching MEP data from DolarApi',
    });

    try {
      const response = await this.axiosInstance.get('/dolares/bolsa');

      logger.info({
        event: events.GET_SERIES_DATA,
        msg: 'Successfully fetched MEP data from DolarApi',
      });

      return response.data;
    } catch (error) {
      logger.error({
        event: events.GET_SERIES_DATA,
        msg: 'Failed to fetch MEP data from DolarApi',
        err: error as Error,
      });
      throw new Error(
        `Failed to fetch MEP data: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async healthCheck(): Promise<{
    isHealthy: boolean;
    error?: string;
    responseTime?: number;
  }> {
    const startTime = Date.now();

    logger.info({
      event: events.HEALTH_CHECK,
      msg: 'Checking DolarApi health',
    });

    try {
      await this.axiosInstance.get('/dolares/blue');
      const responseTime = Date.now() - startTime;

      logger.info({
        event: events.HEALTH_CHECK,
        msg: 'DolarApi health check successful',
        data: { responseTime },
      });

      return { isHealthy: true, responseTime };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      logger.error({
        event: events.HEALTH_CHECK,
        msg: 'DolarApi health check failed',
        err: error as Error,
        data: { responseTime },
      });

      return {
        isHealthy: false,
        error: errorMessage,
        responseTime,
      };
    }
  }
}
```

---

## Summary

These guidelines ensure:

- **Consistency** across all providers and HTTP clients
- **Maintainability** through clear patterns and standards
- **Readability** with minimal logging and self-documenting code
- **Reliability** through proper error handling and configuration management
- **Scalability** through standardized patterns for new providers

Follow these guidelines for all new code and refactor existing code to match these standards.

## HTTP Communication with Axios

### **Axios Configuration**

All HTTP clients MUST use Axios with proper configuration:

```typescript
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

export class ExampleHttpClient {
  private readonly axiosInstance: AxiosInstance;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly retries: number;

  constructor() {
    this.baseUrl = config.EXTERNAL_API_BASE;
    this.timeout = config.HTTP_TIMEOUT_MS;
    this.retries = config.HTTP_RETRIES;

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...(config.API_KEY && { 'x-api-key': config.API_KEY }),
      },
    });
  }
}
```

### **Retry Logic with Exponential Backoff**

```typescript
private async makeRequest(method: string, path: string, config?: AxiosRequestConfig) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= this.retries; attempt++) {
    try {
      const response = await this.axiosInstance.request({
        method: method as any,
        url: path,
        ...config
      });
      return response;
    } catch (error) {
      lastError = error as Error;

      if (attempt === this.retries) break;

      const isRetryable = this.isRetryableError(error);
      if (!isRetryable) throw error;

      const delay = this.calculateBackoffDelay(attempt);
      await this.sleep(delay);
    }
  }
  throw lastError;
}

private isRetryableError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    return !status || status >= 500 || status === 408 || status === 429;
  }
  return true;
}
```

### **Structured Logging for HTTP Requests**

```typescript
logger.info({
  event: 'HTTP.REQUEST',
  msg: 'Making HTTP request',
  data: { method, path, attempt },
});

logger.info({
  event: 'HTTP.RESPONSE',
  msg: 'HTTP request completed',
  data: { method, path, status, duration },
});
```

## Use Cases Pattern

### **Use Case Structure**

All business logic MUST be encapsulated in Use Cases:

```typescript
export class ExampleUseCase {
  constructor(
    private dependency1: Dependency1,
    private dependency2: Dependency2
  ) {}

  async execute(params: UseCaseParams): Promise<UseCaseResult> {
    // Business logic here
    // Use structured logging
    // Handle errors appropriately
  }
}
```

### **Use Case Guidelines**

- **Single Responsibility**: Each use case handles ONE business operation
- **Dependency Injection**: Inject dependencies through constructor
- **Structured Logging**: Use event-based logging for all operations
- **Error Handling**: Handle errors at the use case level
- **Return Types**: Always define explicit return types
- **File Naming**: Use kebab-case with `.use-case.ts` suffix (e.g., `fetch-data.use-case.ts`)

### **Use Case Examples**

#### **Fetch Data Use Case**

```typescript
export class FetchDataUseCase {
  constructor(private httpClient: HttpClient) {}

  async execute(id: string): Promise<DataResponse> {
    logger.info({
      event: 'FETCH_DATA.INIT',
      msg: 'Starting data fetch',
      data: { id },
    });

    try {
      const result = await this.httpClient.getData(id);

      logger.info({
        event: 'FETCH_DATA.FINISHED',
        msg: 'Data fetch completed',
        data: { id, count: result.items.length },
      });

      return result;
    } catch (error) {
      logger.error({
        event: 'FETCH_DATA.ERROR',
        msg: 'Data fetch failed',
        err: error instanceof Error ? error.message : String(error),
        data: { id },
      });
      throw error;
    }
  }
}
```

#### **Process Data Use Case**

```typescript
export class ProcessDataUseCase {
  constructor(
    private fetchUseCase: FetchDataUseCase,
    private repository: DataRepository
  ) {}

  async execute(params: ProcessParams): Promise<ProcessResult> {
    logger.info({
      event: 'PROCESS_DATA.INIT',
      msg: 'Starting data processing',
      data: { params },
    });

    try {
      const data = await this.fetchUseCase.execute(params.id);
      const processed = this.transformData(data);
      await this.repository.save(processed);

      logger.info({
        event: 'PROCESS_DATA.FINISHED',
        msg: 'Data processing completed',
        data: { processedCount: processed.length },
      });

      return { success: true, count: processed.length };
    } catch (error) {
      logger.error({
        event: 'PROCESS_DATA.ERROR',
        msg: 'Data processing failed',
        err: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
```

### **Use Case Composition**

Use cases can be composed together for complex operations:

```typescript
export class ComplexOperationUseCase {
  constructor(
    private useCase1: UseCase1,
    private useCase2: UseCase2,
    private useCase3: UseCase3
  ) {}

  async execute(): Promise<void> {
    const result1 = await this.useCase1.execute();
    const result2 = await this.useCase2.execute(result1);
    await this.useCase3.execute(result2);
  }
}
```

### **Use Case Testing**

```typescript
describe('ExampleUseCase', () => {
  let useCase: ExampleUseCase;
  let mockDependency: MockDependency;

  beforeEach(() => {
    mockDependency = new MockDependency();
    useCase = new ExampleUseCase(mockDependency);
  });

  it('should execute successfully', async () => {
    mockDependency.mockResolvedValue(expectedResult);

    const result = await useCase.execute(params);

    expect(result).toEqual(expectedResult);
    expect(mockDependency.execute).toHaveBeenCalledWith(params);
  });
});
```

## Updated Architecture

### **Use Case Layer**

```
src/application/use-cases/
├── fetch-data.use-case.ts
├── process-data.use-case.ts
├── evaluate-alerts.use-case.ts
└── run-daily-alerts.use-case.ts
```

### **HTTP Client Layer**

```
src/infrastructure/http/
├── baseHttpClient.ts
├── metricsClient.ts
└── externalApiClient.ts
```

### **Dependency Injection**

Use cases receive their dependencies through constructor injection, making them testable and maintainable.

## Git & Development Tools

### **Required Repository Files**

Every project **MUST** include these essential files:

#### **1. .gitignore**

- **Purpose**: Exclude unnecessary files from version control
- **Required patterns**:

  ```gitignore
  # Dependencies
  node_modules/
  npm-debug.log*
  yarn-debug.log*

  # Build outputs
  dist/
  build/
  coverage/

  # Environment files
  .env
  .env.local
  .env.*.local

  # IDE files
  .vscode/
  .idea/
  *.swp
  *.swo

  # OS files
  .DS_Store
  Thumbs.db

  # Logs
  *.log
  logs/

  # Temporary files
  tmp/
  temp/
  ```

#### **2. Pre-commit Hooks**

- **Purpose**: Ensure code quality before commits
- **Required tools**: `husky` + `lint-staged`
- **Configuration**:

```json
// package.json
{
  "scripts": {
    "prepare": "husky"
  },
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix"],
    "*.{js,jsx,ts,tsx,json,md}": ["prettier --write"]
  }
}
```

```bash
# .husky/pre-commit
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx lint-staged
```

### **Code Quality Tools**

#### **ESLint Configuration**

```json
// .eslintrc.json
{
  "extends": ["eslint:recommended"],
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "rules": {
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": "error",
    "no-console": "warn",
    "no-debugger": "error"
  },
  "ignorePatterns": [
    "dist/",
    "node_modules/",
    "*.js",
    "**/*.spec.ts",
    "**/*.test.ts"
  ]
}
```

#### **Prettier Configuration**

```json
// .prettierrc
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "arrowParens": "avoid",
  "endOfLine": "lf"
}
```

### **Pre-commit Hook Requirements**

#### **What Runs on Commit**

1. **ESLint**: Lint TypeScript files with auto-fix
2. **Prettier**: Format all supported files
3. **Only staged files**: Performance optimization

#### **Bypass Rules**

- **Never bypass** pre-commit hooks in production code
- **Emergency bypass**: `git commit --no-verify` (document reason)
- **Test bypass**: Only for experimental/test branches

#### **Hook Installation**

```bash
# Install dependencies
npm install --save-dev husky lint-staged prettier

# Initialize husky
npx husky init

# Make pre-commit executable
chmod +x .husky/pre-commit
```

### **Development Workflow**

#### **Before First Commit**

1. Create comprehensive `.gitignore`
2. Set up pre-commit hooks
3. Configure ESLint and Prettier
4. Test hooks with `npx lint-staged`

#### **Code Quality Checklist**

- [ ] `.gitignore` covers all unnecessary files
- [ ] Pre-commit hooks configured and working
- [ ] ESLint rules defined and enforced
- [ ] Prettier formatting consistent
- [ ] All staged files pass quality checks
- [ ] No console.log or debugger statements
- [ ] No unused imports or variables

### **Repository Standards**

#### **File Organization**

```
project-root/
├── .gitignore          # REQUIRED
├── .husky/             # REQUIRED
│   └── pre-commit      # REQUIRED
├── .eslintrc.json      # REQUIRED
├── .prettierrc         # REQUIRED
├── .prettierignore     # REQUIRED
├── package.json        # REQUIRED
└── src/               # Project code
```

#### **Package.json Scripts**

```json
{
  "scripts": {
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "prepare": "husky"
  }
}
```

### **Quality Enforcement**

#### **Pre-commit Validation**

- **ESLint errors**: Block commit
- **Prettier formatting**: Auto-fix and continue
- **TypeScript errors**: Block commit
- **Test failures**: Block commit (if tests exist)

#### **Team Standards**

- **All developers** must have hooks installed
- **No exceptions** for bypassing hooks
- **Documentation** required for any hook modifications
- **Regular updates** of linting rules and dependencies
