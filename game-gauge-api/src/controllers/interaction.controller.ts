import { Request, Response, NextFunction } from 'express';
import { interactionService } from '../services/interaction.service';
import { z } from 'zod';

const commentBodySchema = z.object({
  content: z.string().min(1).max(500),
});

export class InteractionController {
  /**
   * POST /api/feed/events/:eventId/reactions
   * Toggle a like on an activity event. Auth required.
   */
  async toggleReaction(req: Request, res: Response, next: NextFunction) {
    if (!req.user) throw new Error('User not authenticated');
    try {
      const result = await interactionService.toggleReaction(
        req.user.userId,
        req.params.eventId as string
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/feed/events/:eventId/comments
   * List comments for an event. Public.
   */
  async getComments(req: Request, res: Response, next: NextFunction) {
    try {
      const comments = await interactionService.getComments(req.params.eventId as string);
      res.status(200).json({ success: true, data: comments });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/feed/events/:eventId/comments
   * Add a comment to an event. Auth required.
   */
  async addComment(req: Request, res: Response, next: NextFunction) {
    if (!req.user) throw new Error('User not authenticated');
    try {
      const { content } = commentBodySchema.parse(req.body);
      const result = await interactionService.addComment(
        req.user.userId,
        req.params.eventId as string,
        content
      );
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/feed/events/:eventId/comments/:commentId
   * Delete a comment. Auth required, owner only.
   */
  async deleteComment(req: Request, res: Response, next: NextFunction) {
    if (!req.user) throw new Error('User not authenticated');
    try {
      const result = await interactionService.deleteComment(
        req.user.userId,
        req.params.commentId as string
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const interactionController = new InteractionController();
