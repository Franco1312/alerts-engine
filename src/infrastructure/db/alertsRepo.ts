import { Pool } from 'pg';
import { config, isDatabaseEnabled } from '@/infrastructure/config/env.js';
import { logger } from '@/infrastructure/log/logger.js';
import { DATABASE } from '@/infrastructure/log/log-events.js';
import { Alert, EnrichedAlertPayload } from '@/domain/alert.js';

export interface UpsertResult {
  inserted: number;
  updated: number;
}

export class AlertsRepository {
  private pool: Pool | null = null;

  constructor() {
    if (isDatabaseEnabled()) {
      this.pool = new Pool({
        connectionString: config.ALERTS_DATABASE_URL,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      this.pool.on('error', (err: Error) => {
        logger.error({
          event: DATABASE.ERROR,
          msg: 'Unexpected database error',
          err: err.message,
        });
      });
    }
  }

  async initialize(): Promise<void> {
    if (!this.pool) {
      logger.info({
        event: DATABASE.INIT,
        msg: 'Database disabled, using in-memory storage',
      });
      return;
    }

    try {
      await this.createSchema();
      logger.info({
        event: DATABASE.INIT,
        msg: 'Database schema initialized successfully',
      });
    } catch (error) {
      logger.error({
        event: DATABASE.INIT,
        msg: 'Failed to initialize database schema',
        err: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async createSchema(): Promise<void> {
    if (!this.pool) return;

    const client = await this.pool.connect();
    try {
      await client.query('CREATE SCHEMA IF NOT EXISTS alerts');

      await client.query(`
        CREATE TABLE IF NOT EXISTS alerts.alerts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          alert_id TEXT NOT NULL,
          ts DATE NOT NULL,
          level TEXT NOT NULL CHECK (level IN ('red', 'amber', 'green')),
          message TEXT NOT NULL,
          payload JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(alert_id, ts)
        )
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_alerts_alert_id ON alerts.alerts(alert_id)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts.alerts(ts DESC)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_alerts_level ON alerts.alerts(level)
      `);
    } finally {
      client.release();
    }
  }

  async upsertAlerts(alerts: Alert[]): Promise<UpsertResult> {
    if (!this.pool) {
      logger.warn({
        event: DATABASE.UPSERT,
        msg: 'Database disabled, alerts not persisted',
        data: { count: alerts.length },
      });
      return { inserted: 0, updated: 0 };
    }

    if (alerts.length === 0) {
      return { inserted: 0, updated: 0 };
    }

    const startTime = Date.now();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      let inserted = 0;
      let updated = 0;

      for (const alert of alerts) {
        const result = await client.query(
          `
          INSERT INTO alerts.alerts (alert_id, ts, level, message, payload)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (alert_id, ts)
          DO UPDATE SET
            level = EXCLUDED.level,
            message = EXCLUDED.message,
            payload = EXCLUDED.payload,
            created_at = NOW()
          RETURNING (xmax = 0) AS inserted
        `,
          [alert.alertId, alert.ts, alert.level, alert.message, alert.payload]
        );

        if (result.rows[0].inserted) {
          inserted++;
        } else {
          updated++;
        }
      }

      await client.query('COMMIT');

      const duration = Date.now() - startTime;
      logger.info({
        event: DATABASE.UPSERT,
        msg: 'Alerts upserted successfully',
        data: { inserted, updated, duration, total: alerts.length },
      });

      return { inserted, updated };
    } catch (error) {
      await client.query('ROLLBACK');

      logger.error({
        event: DATABASE.UPSERT,
        msg: 'Failed to upsert alerts',
        err: error instanceof Error ? error.message : String(error),
        data: { count: alerts.length },
      });

      throw error;
    } finally {
      client.release();
    }
  }

  async getRecentAlerts(limit: number = 50): Promise<Alert[]> {
    if (!this.pool) {
      logger.warn({
        event: DATABASE.GET_RECENT,
        msg: 'Database disabled, returning empty array',
      });
      return [];
    }

    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `
        SELECT alert_id, ts, level, message, payload
        FROM alerts.alerts
        ORDER BY ts DESC, created_at DESC
        LIMIT $1
      `,
        [limit]
      );

      const alerts: Alert[] = result.rows.map((row: any) => ({
        alertId: row.alert_id,
        ts: row.ts,
        level: row.level,
        message: row.message,
        payload: row.payload,
      }));

      const duration = Date.now() - startTime;
      logger.info({
        event: DATABASE.GET_RECENT,
        msg: 'Recent alerts retrieved successfully',
        data: { count: alerts.length, limit, duration },
      });

      return alerts;
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error({
        event: DATABASE.GET_RECENT,
        msg: 'Failed to retrieve recent alerts',
        err: error instanceof Error ? error.message : String(error),
        data: { limit, duration },
      });

      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      logger.info({
        event: DATABASE.CLOSE,
        msg: 'Database connection pool closed',
      });
    }
  }

  async getAlerts(
    from?: string,
    to?: string,
    level?: string,
    limit: number = 50
  ): Promise<Array<Alert & { payload: EnrichedAlertPayload }>> {
    if (!this.pool) {
      return [];
    }

    const startTime = Date.now();

    try {
      let query = `
        SELECT alert_id, ts, level, message, payload
        FROM alerts_emitted
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIndex = 1;

      if (from) {
        query += ` AND ts >= $${paramIndex}`;
        params.push(from);
        paramIndex++;
      }

      if (to) {
        query += ` AND ts <= $${paramIndex}`;
        params.push(to);
        paramIndex++;
      }

      if (level) {
        query += ` AND level = $${paramIndex}`;
        params.push(level);
        paramIndex++;
      }

      query += ` ORDER BY ts DESC, created_at DESC LIMIT $${paramIndex}`;
      params.push(limit);

      const result = await this.pool.query(query, params);

      const duration = Date.now() - startTime;
      logger.info({
        event: DATABASE.QUERY,
        msg: 'Alerts retrieved successfully',
        data: {
          count: result.rows.length,
          duration,
          filters: { from, to, level, limit },
        },
      });

      return result.rows.map(
        row =>
          ({
            alertId: row.alert_id,
            ts: row.ts,
            level: row.level,
            message: row.message,
            payload: row.payload as EnrichedAlertPayload,
          }) as Alert & { payload: EnrichedAlertPayload }
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({
        event: DATABASE.ERROR,
        msg: 'Failed to retrieve alerts',
        err: error instanceof Error ? error.message : String(error),
        data: { from, to, level, limit, duration },
      });
      throw error;
    }
  }

  async getRules(): Promise<any[]> {
    if (!this.pool) {
      return [];
    }

    const startTime = Date.now();

    try {
      const query = `
        SELECT alert_id, metric_id, level, condition, message, threshold, 
               units, inputs, notes, min_consecutive
        FROM alert_rules
        ORDER BY level DESC, alert_id
      `;

      const result = await this.pool.query(query);

      const duration = Date.now() - startTime;
      logger.info({
        event: DATABASE.QUERY,
        msg: 'Rules retrieved successfully',
        data: {
          count: result.rows.length,
          duration,
        },
      });

      return result.rows;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({
        event: DATABASE.ERROR,
        msg: 'Failed to retrieve rules',
        err: error instanceof Error ? error.message : String(error),
        data: { duration },
      });
      throw error;
    }
  }

  async upsertAlertWithDedup(
    alert: Alert & { payload?: EnrichedAlertPayload }
  ): Promise<UpsertResult> {
    if (!this.pool) {
      logger.warn({
        event: DATABASE.UPSERT,
        msg: 'Database disabled, alert not persisted',
        data: { alertId: alert.alertId },
      });
      return { inserted: 0, updated: 0 };
    }

    const startTime = Date.now();

    try {
      const query = `
        INSERT INTO alerts_emitted (alert_id, ts, level, message, payload)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (alert_id, ts) 
        DO UPDATE SET 
          level = EXCLUDED.level,
          message = EXCLUDED.message,
          payload = EXCLUDED.payload,
          created_at = now()
        RETURNING (xmax = 0) AS inserted
      `;

      const result = await this.pool.query(query, [
        alert.alertId,
        alert.ts,
        alert.level,
        alert.message,
        JSON.stringify(alert.payload || {}),
      ]);

      const inserted = result.rows[0]?.inserted ? 1 : 0;
      const updated = inserted ? 0 : 1;

      const duration = Date.now() - startTime;
      logger.info({
        event: DATABASE.UPSERT,
        msg: 'Alert upserted with deduplication',
        data: {
          alertId: alert.alertId,
          inserted,
          updated,
          duration,
        },
      });

      return { inserted, updated };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({
        event: DATABASE.ERROR,
        msg: 'Failed to upsert alert',
        err: error instanceof Error ? error.message : String(error),
        data: { alertId: alert.alertId, duration },
      });
      throw error;
    }
  }
}

// Default instance for dependency injection
export const defaultAlertsRepository = new AlertsRepository();
