/**
 * RhythmSense API Server
 * Express application entry point – port 3001
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { testConnection } from './db/database';
import uploadRouter from './routes/upload';
import tracksRouter from './routes/tracks';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT ?? 3002);

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve processed audio files statically so the client can stream them
app.use(
  '/uploads',
  express.static(path.join(__dirname, '..', 'uploads'))
);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.use('/api/upload', uploadRouter);
app.use('/api/tracks', tracksRouter);

/** Health-check endpoint */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[error]', err.message);
  const status = (err as Error & { status?: number }).status ?? 500;
  res.status(status).json({ error: err.message ?? 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  try {
    await testConnection();
  } catch (err) {
    console.warn(
      '[startup] MySQL not reachable – running without database.',
      (err as Error).message
    );
  }

  app.listen(PORT, () => {
    console.log(`[server] RhythmSense API running on http://localhost:${PORT}`);
  });
}

main();

export default app;
