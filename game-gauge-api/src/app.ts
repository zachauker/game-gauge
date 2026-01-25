import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';

import { errorHandler } from './middleware/error.middleware';
import { requestLogger } from './middleware/requestLogger.middleware';
import routes from './routes';

const app: Application = express();

// Security middleware
app.use(helmet());

// CORS middleware
app.use(
  cors({
    origin:
      process.env.NODE_ENV === 'production'
        ? ['https://gamegauge.app', 'https://gamegauge.vercel.app']
        : 'http://localhost:3001',
    credentials: true,
  })
);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
    },
  });
});

// API routes
app.use('/api', routes);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      message: 'Route not found',
      code: 'NOT_FOUND',
    },
  });
});

// Global error handler (must be last)
app.use(errorHandler);

export { app };
