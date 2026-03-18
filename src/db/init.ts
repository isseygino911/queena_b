/**
 * One-shot script: reads schema.sql and executes it against the configured
 * MySQL instance.  Run with:  npm run db:init
 */

import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function init(): Promise<void> {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     ?? 'localhost',
    port:     Number(process.env.DB_PORT ?? 3306),
    user:     process.env.DB_USER     ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    multipleStatements: true,
  });

  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  await conn.query(sql);
  if (process.env.NODE_ENV !== 'production') console.log('[db:init] Schema applied successfully');
  await conn.end();
}

init().catch((err) => {
  console.error('[db:init] Failed:', err);
  process.exit(1);
});
