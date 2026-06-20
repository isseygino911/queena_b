/**
 * RhythmSense API Server
 * Express application entry point – port 3001
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import dotenv from 'dotenv';
import { testConnection } from './db/database';
import uploadRouter from './routes/upload';
import tracksRouter from './routes/tracks';
import authRoutes from './routes/authRoutes';
import audioRouter from './routes/audio';
import aiSettingsRouter from './routes/aiSettings';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT ?? 3002);

// Trust proxy (required for rate-limit behind reverse proxy like Caddy)
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// Security headers
app.use(helmet());

// CORS with credentials for cookies
const allowedOrigins = [
  'http://localhost:5173',
  'https://ophieliu.com',
  'https://www.ophieliu.com',
  process.env.CLIENT_ORIGIN,
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., mobile apps, curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.use('/api/upload', uploadRouter);
app.use('/api/tracks', tracksRouter);
app.use('/api/auth', authRoutes);
app.use('/api/audio', audioRouter);
app.use('/api/ai', aiSettingsRouter);

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
