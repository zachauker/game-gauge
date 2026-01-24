import express, { Application, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler } from './middleware/error.middleware';
import { requestLogger } from './middleware/requestLogger.middleware';
import routes from './routes';

const app: Application = express();

// Security middleware
app.use(helmet());

// CORS configuration
const allowedOrigins = [
  'http://localhost:3001', // Next.js frontend
  'http://localhost:5173', // Vite frontend (if using)
  env.CORS_ORIGIN,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or Postman)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

// Health check endpoint
app.get('/health', (res: Response) => {
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
app.use((res: Response) => {
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
