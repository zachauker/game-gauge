import { interactionRepository } from '../repositories/interaction.repository';
import { prisma } from '../config/database';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.util';

class InteractionService {
  // ── Reactions ────────────────────────────────────────────────────────────────

  async toggleReaction(userId: string, eventId: string) {
    await this.requireEvent(eventId);

    const already = await interactionRepository.hasReacted(userId, eventId);

    if (already) {
      await interactionRepository.removeReaction(userId, eventId);
    } else {
      await interactionRepository.addReaction(userId, eventId);
    }

    const count = await interactionRepository.getReactionCount(eventId);
    return { liked: !already, likeCount: count };
  }

  // ── Comments ─────────────────────────────────────────────────────────────────

  async addComment(userId: string, eventId: string, content: string) {
    const trimmed = content.trim();
    if (!trimmed) throw new ValidationError('Comment cannot be empty');
    if (trimmed.length > 500) throw new ValidationError('Comment must be 500 characters or fewer');

    await this.requireEvent(eventId);

    const comment = await interactionRepository.addComment(userId, eventId, trimmed);
    const count = await interactionRepository.getCommentCount(eventId);
    return { comment, commentCount: count };
  }

  async deleteComment(userId: string, commentId: string) {
    const comment = await interactionRepository.getComment(commentId);
    if (!comment) throw new NotFoundError('Comment not found');
    if (comment.userId !== userId)
      throw new ForbiddenError('You can only delete your own comments');

    await interactionRepository.deleteComment(commentId);
    const count = await interactionRepository.getCommentCount(comment.eventId);
    return { commentCount: count };
  }

  async getComments(eventId: string) {
    await this.requireEvent(eventId);
    return interactionRepository.getComments(eventId);
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private async requireEvent(eventId: string) {
    const count = await prisma.activityEvent.count({ where: { id: eventId } });
    if (!count) throw new NotFoundError('Activity event not found');
  }
}

export const interactionService = new InteractionService();
