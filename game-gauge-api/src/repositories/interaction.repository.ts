import { prisma } from '../config/database';

export interface CommentWithUser {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    username: string;
    avatar: string | null;
  };
}

class InteractionRepository {
  // ── Reactions ────────────────────────────────────────────────────────────────

  async addReaction(userId: string, eventId: string): Promise<void> {
    await prisma.eventReaction.create({ data: { userId, eventId } });
  }

  async removeReaction(userId: string, eventId: string): Promise<void> {
    await prisma.eventReaction.delete({
      where: { userId_eventId: { userId, eventId } },
    });
  }

  async hasReacted(userId: string, eventId: string): Promise<boolean> {
    const count = await prisma.eventReaction.count({ where: { userId, eventId } });
    return count > 0;
  }

  async getReactionCount(eventId: string): Promise<number> {
    return prisma.eventReaction.count({ where: { eventId } });
  }

  /**
   * For a list of eventIds, return counts and whether the viewer has liked each.
   * Used when hydrating a page of feed events in one shot.
   */
  async getBulkReactionData(
    eventIds: string[],
    viewerId?: string,
  ): Promise<Map<string, { count: number; hasReacted: boolean }>> {
    const [counts, viewerReactions] = await Promise.all([
      prisma.eventReaction.groupBy({
        by: ['eventId'],
        where: { eventId: { in: eventIds } },
        _count: { _all: true },
      }),
      viewerId
        ? prisma.eventReaction.findMany({
            where: { eventId: { in: eventIds }, userId: viewerId },
            select: { eventId: true },
          })
        : Promise.resolve([]),
    ]);

    const reactedSet = new Set(viewerReactions.map((r) => r.eventId));
    const result = new Map<string, { count: number; hasReacted: boolean }>();

    for (const eventId of eventIds) {
      result.set(eventId, { count: 0, hasReacted: false });
    }
    for (const row of counts) {
      result.set(row.eventId, {
        count: row._count._all,
        hasReacted: reactedSet.has(row.eventId),
      });
    }

    return result;
  }

  // ── Comments ─────────────────────────────────────────────────────────────────

  async addComment(userId: string, eventId: string, content: string): Promise<CommentWithUser> {
    return prisma.eventComment.create({
      data: { userId, eventId, content },
      include: {
        user: { select: { id: true, username: true, avatar: true } },
      },
    });
  }

  async deleteComment(commentId: string): Promise<void> {
    await prisma.eventComment.delete({ where: { id: commentId } });
  }

  async getComment(commentId: string) {
    return prisma.eventComment.findUnique({ where: { id: commentId } });
  }

  async getComments(eventId: string): Promise<CommentWithUser[]> {
    return prisma.eventComment.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, username: true, avatar: true } },
      },
    });
  }

  async getCommentCount(eventId: string): Promise<number> {
    return prisma.eventComment.count({ where: { eventId } });
  }

  async getBulkCommentCounts(eventIds: string[]): Promise<Map<string, number>> {
    const rows = await prisma.eventComment.groupBy({
      by: ['eventId'],
      where: { eventId: { in: eventIds } },
      _count: { _all: true },
    });

    const result = new Map<string, number>();
    for (const eventId of eventIds) result.set(eventId, 0);
    for (const row of rows) result.set(row.eventId, row._count._all);
    return result;
  }
}

export const interactionRepository = new InteractionRepository();
