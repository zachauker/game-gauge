import { Request, Response, NextFunction } from 'express';
import { conversationService } from '../services/conversation.service';
import { messageService } from '../services/message.service';
import { paginationSchema } from '../validators/social.validator';
import {
  createConversationSchema,
  renameConversationSchema,
  sendMessageSchema,
  editMessageSchema,
  messagesCursorSchema,
} from '../validators/conversation.validator';

export class ConversationController {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const input = createConversationSchema.parse(req.body);
      const conversation = await conversationService.createConversation(req.user.userId, input);
      res.status(201).json({ success: true, data: conversation });
    } catch (error) {
      next(error);
    }
  }

  async getInbox(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const { page, limit } = paginationSchema.parse(req.query);
      const result = await conversationService.getInbox(req.user.userId, page, limit);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getRequests(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const requests = await conversationService.getRequests(req.user.userId);
      res.status(200).json({ success: true, data: requests });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const conversation = await conversationService.getConversation(
        req.params.id,
        req.user.userId
      );
      res.status(200).json({ success: true, data: conversation });
    } catch (error) {
      next(error);
    }
  }

  async accept(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const result = await conversationService.accept(req.params.id, req.user.userId);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async decline(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const result = await conversationService.decline(req.params.id, req.user.userId);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async archiveOrLeave(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const result = await conversationService.archiveOrLeave(req.params.id, req.user.userId);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async rename(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const { name } = renameConversationSchema.parse(req.body);
      const result = await conversationService.rename(req.params.id, req.user.userId, name);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async addMember(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const result = await conversationService.addMember(
        req.params.id,
        req.user.userId,
        req.params.username
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async removeMember(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const result = await conversationService.removeMember(
        req.params.id,
        req.user.userId,
        req.params.userId
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getUnreadCount(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const count = await conversationService.getUnreadCount(req.user.userId);
      res.status(200).json({ success: true, data: { count } });
    } catch (error) {
      next(error);
    }
  }

  async getMessages(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const { before, limit } = messagesCursorSchema.parse(req.query);
      const messages = await messageService.listMessages(
        req.params.id,
        req.user.userId,
        before,
        limit
      );
      res.status(200).json({ success: true, data: messages });
    } catch (error) {
      next(error);
    }
  }

  async sendMessage(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const input = sendMessageSchema.parse(req.body);
      const message = await messageService.send(req.params.id, req.user.userId, input);
      res.status(201).json({ success: true, data: message });
    } catch (error) {
      next(error);
    }
  }

  async editMessage(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const { content } = editMessageSchema.parse(req.body);
      const message = await messageService.edit(
        req.params.id,
        req.params.messageId,
        req.user.userId,
        content
      );
      res.status(200).json({ success: true, data: message });
    } catch (error) {
      next(error);
    }
  }

  async deleteMessage(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const result = await messageService.delete(
        req.params.id,
        req.params.messageId,
        req.user.userId
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const conversationController = new ConversationController();
