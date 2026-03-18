/**
 * MySQL connection pool setup using mysql2/promise.
 * Configuration is driven entirely by environment variables so that
 * credentials are never hard-coded.
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

/** Shared connection pool – re-use this across the application. */
const pool = mysql.createPool({
  host:            process.env.DB_HOST     ?? 'localhost',
  port:            Number(process.env.DB_PORT ?? 3306),
  user:            process.env.DB_USER     ?? 'root',
  password:        process.env.DB_PASSWORD ?? '',
  database:        process.env.DB_NAME     ?? 'u553161013_quenna',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  enableKeepAlive:    true,
  keepAliveInitialDelay: 0,
});

/**
 * Verify that the pool can reach the database.
 * Call once at application startup.
 */
export async function testConnection(): Promise<void> {
  const conn = await pool.getConnection();
  await conn.ping();
  conn.release();
  if (process.env.NODE_ENV !== 'production') console.log('[db] MySQL connection pool ready');
}

export default pool;
