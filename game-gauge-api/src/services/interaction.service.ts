import { interactionRepository } from '../repositories/interaction.repository';
import { prisma } from '../config/database';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.util';
import { notificationService } from './notification.service';

class InteractionService {
  // ── Reactions ────────────────────────────────────────────────────────────────

  async toggleReaction(userId: string, eventId: string) {
    const event = await this.requireEvent(eventId);

    const already = await interactionRepository.hasReacted(userId, eventId);

    if (already) {
      await interactionRepository.removeReaction(userId, eventId);
    } else {
      await interactionRepository.addReaction(userId, eventId);
      notificationService.create({
        userId: event.userId,
        actorId: userId,
        type: 'LIKED_EVENT',
        eventId,
      }).catch(() => {});
    }

    const count = await interactionRepository.getReactionCount(eventId);
    return { liked: !already, likeCount: count };
  }

  // ── Comments ─────────────────────────────────────────────────────────────────

  async addComment(userId: string, eventId: string, content: string) {
    const trimmed = content.trim();
    if (!trimmed) throw new ValidationError('Comment cannot be empty');
    if (trimmed.length > 500) throw new ValidationError('Comment must be 500 characters or fewer');

    const event = await this.requireEvent(eventId);

    const comment = await interactionRepository.addComment(userId, eventId, trimmed);
    const count = await interactionRepository.getCommentCount(eventId);

    notificationService.create({
      userId: event.userId,
      actorId: userId,
      type: 'COMMENTED_EVENT',
      eventId,
    }).catch(() => {});

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
    const event = await prisma.activityEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundError('Activity event not found');
    return event;
  }
}

export const interactionService = new InteractionService();
