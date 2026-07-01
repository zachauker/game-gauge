import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { verifyToken } from '../utils/jwt.util';
import { conversationRepository } from '../repositories/conversation.repository';
import { logger } from '../utils/logger.util';

let io: SocketIOServer | null = null;

function getAllowedOrigins(): string[] {
  const fromEnv = process.env.FRONTEND_URL?.split(',').map((url) => url.trim());
  return fromEnv && fromEnv.length > 0 ? fromEnv : ['http://localhost:3001'];
}

export function initSocketServer(httpServer: HTTPServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: getAllowedOrigins(),
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) throw new Error('No token provided');
      const payload = verifyToken(token);
      socket.data.userId = payload.userId;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);

    try {
      const conversationIds = await conversationRepository.findActiveConversationIdsForUser(
        userId
      );
      conversationIds.forEach((id) => socket.join(`conversation:${id}`));
    } catch (error) {
      logger.error('Failed to join conversation rooms', error);
    }
  });

  return io;
}

export function emitToConversation(conversationId: string, event: string, payload: unknown): void {
  io?.to(`conversation:${conversationId}`).emit(event, payload);
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(`user:${userId}`).emit(event, payload);
}
