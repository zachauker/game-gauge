import { interactionService } from '../../services/interaction.service';
import { NotFoundError, ForbiddenError, ValidationError } from '../../utils/errors.util';
import {
  testUser,
  testOtherUser,
  testActivityEvent,
  testComment,
  testCommentWithUser,
} from '../setup';
import { prisma } from '../../config/database';

// ── Repository mocks ────────────────────────────────────────────────────────────

jest.mock('../../repositories/interaction.repository', () => ({
  interactionRepository: {
    addReaction: jest.fn(),
    removeReaction: jest.fn(),
    hasReacted: jest.fn(),
    getReactionCount: jest.fn(),
    addComment: jest.fn(),
    deleteComment: jest.fn(),
    getComment: jest.fn(),
    getComments: jest.fn(),
    getCommentCount: jest.fn(),
    getBulkReactionData: jest.fn(),
    getBulkCommentCounts: jest.fn(),
  },
}));

import { interactionRepository } from '../../repositories/interaction.repository';

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('InteractionService', () => {
  // ── toggleReaction ──────────────────────────────────────────────────────────

  describe('toggleReaction', () => {
    beforeEach(() => {
      // Default: event exists
      (prisma.activityEvent.count as jest.Mock).mockResolvedValue(1);
      (interactionRepository.getReactionCount as jest.Mock).mockResolvedValue(1);
    });

    it('adds a reaction when user has not yet liked the event', async () => {
      (interactionRepository.hasReacted as jest.Mock).mockResolvedValue(false);
      (interactionRepository.addReaction as jest.Mock).mockResolvedValue(undefined);

      const result = await interactionService.toggleReaction(testUser.id, testActivityEvent.id);

      expect(interactionRepository.addReaction).toHaveBeenCalledWith(
        testUser.id,
        testActivityEvent.id
      );
      expect(interactionRepository.removeReaction).not.toHaveBeenCalled();
      expect(result.liked).toBe(true);
      expect(result.likeCount).toBe(1);
    });

    it('removes a reaction when user has already liked the event', async () => {
      (interactionRepository.hasReacted as jest.Mock).mockResolvedValue(true);
      (interactionRepository.removeReaction as jest.Mock).mockResolvedValue(undefined);
      (interactionRepository.getReactionCount as jest.Mock).mockResolvedValue(0);

      const result = await interactionService.toggleReaction(testUser.id, testActivityEvent.id);

      expect(interactionRepository.removeReaction).toHaveBeenCalledWith(
        testUser.id,
        testActivityEvent.id
      );
      expect(interactionRepository.addReaction).not.toHaveBeenCalled();
      expect(result.liked).toBe(false);
      expect(result.likeCount).toBe(0);
    });

    it('returns the updated likeCount from the repository', async () => {
      (interactionRepository.hasReacted as jest.Mock).mockResolvedValue(false);
      (interactionRepository.addReaction as jest.Mock).mockResolvedValue(undefined);
      (interactionRepository.getReactionCount as jest.Mock).mockResolvedValue(7);

      const result = await interactionService.toggleReaction(testUser.id, testActivityEvent.id);

      expect(result.likeCount).toBe(7);
    });

    it('throws NotFoundError when the event does not exist', async () => {
      (prisma.activityEvent.count as jest.Mock).mockResolvedValue(0);

      await expect(
        interactionService.toggleReaction(testUser.id, 'nonexistent-event')
      ).rejects.toThrow(NotFoundError);

      expect(interactionRepository.hasReacted).not.toHaveBeenCalled();
    });
  });

  // ── addComment ──────────────────────────────────────────────────────────────

  describe('addComment', () => {
    beforeEach(() => {
      (prisma.activityEvent.count as jest.Mock).mockResolvedValue(1);
      (interactionRepository.addComment as jest.Mock).mockResolvedValue(testCommentWithUser);
      (interactionRepository.getCommentCount as jest.Mock).mockResolvedValue(1);
    });

    it('creates a comment and returns it with the new count', async () => {
      const result = await interactionService.addComment(
        testUser.id,
        testActivityEvent.id,
        'Great review!'
      );

      expect(interactionRepository.addComment).toHaveBeenCalledWith(
        testUser.id,
        testActivityEvent.id,
        'Great review!'
      );
      expect(result.comment).toEqual(testCommentWithUser);
      expect(result.commentCount).toBe(1);
    });

    it('trims whitespace from the content before saving', async () => {
      await interactionService.addComment(testUser.id, testActivityEvent.id, '  trimmed content  ');

      expect(interactionRepository.addComment).toHaveBeenCalledWith(
        testUser.id,
        testActivityEvent.id,
        'trimmed content'
      );
    });

    it('throws ValidationError for empty content', async () => {
      await expect(
        interactionService.addComment(testUser.id, testActivityEvent.id, '   ')
      ).rejects.toThrow(ValidationError);

      expect(interactionRepository.addComment).not.toHaveBeenCalled();
    });

    it('throws ValidationError when content exceeds 500 characters', async () => {
      const longContent = 'x'.repeat(501);

      await expect(
        interactionService.addComment(testUser.id, testActivityEvent.id, longContent)
      ).rejects.toThrow(ValidationError);

      expect(interactionRepository.addComment).not.toHaveBeenCalled();
    });

    it('accepts content of exactly 500 characters', async () => {
      const maxContent = 'x'.repeat(500);

      await expect(
        interactionService.addComment(testUser.id, testActivityEvent.id, maxContent)
      ).resolves.not.toThrow();
    });

    it('throws NotFoundError when the event does not exist', async () => {
      (prisma.activityEvent.count as jest.Mock).mockResolvedValue(0);

      await expect(
        interactionService.addComment(testUser.id, 'nonexistent-event', 'Hello')
      ).rejects.toThrow(NotFoundError);

      expect(interactionRepository.addComment).not.toHaveBeenCalled();
    });
  });

  // ── deleteComment ───────────────────────────────────────────────────────────

  describe('deleteComment', () => {
    beforeEach(() => {
      (interactionRepository.getComment as jest.Mock).mockResolvedValue(testComment);
      (interactionRepository.deleteComment as jest.Mock).mockResolvedValue(undefined);
      (interactionRepository.getCommentCount as jest.Mock).mockResolvedValue(0);
    });

    it('deletes a comment owned by the requesting user', async () => {
      const result = await interactionService.deleteComment(testUser.id, testComment.id);

      expect(interactionRepository.deleteComment).toHaveBeenCalledWith(testComment.id);
      expect(result.commentCount).toBe(0);
    });

    it('throws NotFoundError when the comment does not exist', async () => {
      (interactionRepository.getComment as jest.Mock).mockResolvedValue(null);

      await expect(
        interactionService.deleteComment(testUser.id, 'nonexistent-comment')
      ).rejects.toThrow(NotFoundError);

      expect(interactionRepository.deleteComment).not.toHaveBeenCalled();
    });

    it('throws ForbiddenError when the user does not own the comment', async () => {
      // Comment belongs to testUser; request comes from testOtherUser
      await expect(
        interactionService.deleteComment(testOtherUser.id, testComment.id)
      ).rejects.toThrow(ForbiddenError);

      expect(interactionRepository.deleteComment).not.toHaveBeenCalled();
    });
  });

  // ── getComments ─────────────────────────────────────────────────────────────

  describe('getComments', () => {
    beforeEach(() => {
      (prisma.activityEvent.count as jest.Mock).mockResolvedValue(1);
    });

    it('returns the comment list for a valid event', async () => {
      (interactionRepository.getComments as jest.Mock).mockResolvedValue([testCommentWithUser]);

      const result = await interactionService.getComments(testActivityEvent.id);

      expect(interactionRepository.getComments).toHaveBeenCalledWith(testActivityEvent.id);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(testCommentWithUser);
    });

    it('returns an empty array when there are no comments', async () => {
      (interactionRepository.getComments as jest.Mock).mockResolvedValue([]);

      const result = await interactionService.getComments(testActivityEvent.id);

      expect(result).toEqual([]);
    });

    it('throws NotFoundError when the event does not exist', async () => {
      (prisma.activityEvent.count as jest.Mock).mockResolvedValue(0);

      await expect(interactionService.getComments('nonexistent-event')).rejects.toThrow(
        NotFoundError
      );
    });
  });
});
