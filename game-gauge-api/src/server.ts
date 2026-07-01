import dotenv from 'dotenv';
import http from 'http';
import { app } from './app';
import { logger } from './utils/logger.util';
import { env } from './config/env';
import { initSocketServer } from './sockets';

// Load environment variables
dotenv.config();

const PORT = env.PORT || 3000;

const httpServer = http.createServer(app);
initSocketServer(httpServer);

const server = httpServer.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT} in ${env.NODE_ENV} mode`);
  logger.info(`📊 Database connected`);
  logger.info(`🔌 Socket.io real-time layer initialized`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  logger.error('Unhandled Rejection:', err);
  server.close(() => {
    process.exit(1);
  });
});
