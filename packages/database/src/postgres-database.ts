import { Pool, type PoolConfig, type QueryResultRow } from 'pg';
import { TenantContextMissingError } from './errors';

/** A real PostgreSQL transaction. Repositories must explicitly use this executor. */
export interface PostgresTransaction {
  query<T extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<T[]>;
  execute(sql: string, values?: unknown[]): Promise<number>;
}

export class PostgresDatabase {
  private readonly pool: Pool;

  constructor(config: PoolConfig) {
    if (!config.connectionString) throw new Error('An explicit PostgreSQL connection string is required.');
    this.pool = new Pool({ max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, ...config });
    // Idle connection failures are reported by readiness and subsequent operations;
    // never substitute an in-memory or SQLite connection.
    this.pool.on('error', () => { console.error('PostgreSQL idle connection failed; the pool will replace it.'); });
  }

  async ready(): Promise<boolean> {
    const result = await this.pool.query('SELECT 1 AS ready');
    return result.rows[0]?.ready === 1;
  }

  async transaction<T>(tenantId: string, work: (tx: PostgresTransaction) => Promise<T>): Promise<T> {
    if (!tenantId?.trim()) throw new TenantContextMissingError('A tenant ID is required for a PostgreSQL transaction.');
    const client = await this.pool.connect();
    let active = true;
    let discard = false;
    const assertActive = () => { if (!active) throw new Error('PostgreSQL transaction has already ended.'); };
    const tx: PostgresTransaction = {
      async query<R extends QueryResultRow>(sql: string, values?: unknown[]) {
        assertActive();
        return (await client.query<R>(sql, values)).rows;
      },
      async execute(sql: string, values?: unknown[]) {
        assertActive();
        return (await client.query(sql, values)).rowCount ?? 0;
      },
    };
    try {
      await client.query('BEGIN');
      // set_config accepts a bound value; SET LOCAL ... = $1 does not.
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const result = await work(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { discard = true; }
      throw error;
    } finally {
      active = false;
      client.release(discard);
    }
  }

  async close(): Promise<void> { await this.pool.end(); }
}
