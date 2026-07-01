import { prisma } from '../config/database';

export type MessageType = 'TEXT' | 'GAME_SHARE' | 'LIST_SHARE' | 'REVIEW_SHARE' | 'ACTIVITY_SHARE';

const MESSAGE_INCLUDE = {
  sender: { select: { id: true, username: true, avatar: true } },
  game: { select: { id: true, title: true, slug: true, coverImage: true } },
  list: { select: { id: true, name: true, isPublic: true, _count: { select: { items: true } } } },
  review: {
    select: {
      id: true,
      content: true,
      game: { select: { title: true, slug: true } },
      rating: { select: { score: true } },
    },
  },
  activityEvent: {
    select: {
      id: true,
      type: true,
      meta: true,
      user: { select: { username: true } },
      game: { select: { title: true, slug: true } },
    },
  },
} as const;

class MessageRepository {
  async create(data: {
    conversationId: string;
    senderId: string;
    type: MessageType;
    content?: string;
    gameId?: string;
    listId?: string;
    reviewId?: string;
    activityEventId?: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const message = await tx.message.create({ data, include: MESSAGE_INCLUDE });
      await tx.conversation.update({
        where: { id: data.conversationId },
        data: { lastMessageAt: new Date() },
      });
      return message;
    });
  }

  async findForConversation(conversationId: string, before?: string, limit = 30) {
    return prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
      include: MESSAGE_INCLUDE,
    });
  }

  async findById(messageId: string) {
    return prisma.message.findUnique({ where: { id: messageId }, include: MESSAGE_INCLUDE });
  }

  async update(messageId: string, content: string) {
    return prisma.message.update({
      where: { id: messageId },
      data: { content, editedAt: new Date() },
      include: MESSAGE_INCLUDE,
    });
  }

  async softDelete(messageId: string) {
    return prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), content: null },
    });
  }

  async hasSharedListAccess(listId: string, userId: string): Promise<boolean> {
    const count = await prisma.message.count({
      where: {
        type: 'LIST_SHARE',
        listId,
        deletedAt: null,
        conversation: {
          participants: { some: { userId, status: 'ACCEPTED' } },
        },
      },
    });
    return count > 0;
  }
}

export const messageRepository = new MessageRepository();
