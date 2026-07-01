import { prisma } from '../config/database';

const PARTICIPANT_USER_SELECT = { id: true, username: true, avatar: true } as const;

const CONVERSATION_INCLUDE = {
  participants: {
    include: { user: { select: PARTICIPANT_USER_SELECT } },
  },
} as const;

class ConversationRepository {
  async findOneOnOneBetween(userAId: string, userBId: string) {
    return prisma.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [
          { participants: { some: { userId: userAId } } },
          { participants: { some: { userId: userBId } } },
        ],
      },
    });
  }

  async create(data: {
    isGroup: boolean;
    name?: string;
    creatorId?: string;
    participants: { userId: string; status: string }[];
  }) {
    return prisma.conversation.create({
      data: {
        isGroup: data.isGroup,
        name: data.name,
        creatorId: data.creatorId,
        participants: {
          create: data.participants.map((p) => ({ userId: p.userId, status: p.status })),
        },
      },
      include: CONVERSATION_INCLUDE,
    });
  }

  async findById(id: string) {
    return prisma.conversation.findUnique({
      where: { id },
      include: CONVERSATION_INCLUDE,
    });
  }

  async findActiveConversationIdsForUser(userId: string): Promise<string[]> {
    const rows = await prisma.conversationParticipant.findMany({
      where: { userId, status: 'ACCEPTED', leftAt: null },
      select: { conversationId: true },
    });
    return rows.map((r) => r.conversationId);
  }

  async listInboxForUser(userId: string, page: number, limit: number) {
    const participants = await prisma.conversationParticipant.findMany({
      where: { userId, status: 'ACCEPTED', leftAt: null },
      include: {
        conversation: {
          include: {
            participants: {
              where: { userId: { not: userId } },
              include: { user: { select: PARTICIPANT_USER_SELECT } },
            },
            messages: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    const visible = participants.filter(
      (p) => !p.hiddenAt || p.conversation.lastMessageAt > p.hiddenAt
    );
    visible.sort(
      (a, b) => b.conversation.lastMessageAt.getTime() - a.conversation.lastMessageAt.getTime()
    );

    const total = visible.length;
    const start = (page - 1) * limit;
    const pageItems = visible.slice(start, start + limit);

    return {
      conversations: pageItems.map((p) => ({
        id: p.conversation.id,
        isGroup: p.conversation.isGroup,
        name: p.conversation.name,
        lastMessageAt: p.conversation.lastMessageAt,
        otherParticipants: p.conversation.participants.map((op) => op.user),
        lastMessage: p.conversation.messages[0] ?? null,
        unread: p.lastReadAt < p.conversation.lastMessageAt,
      })),
      total,
    };
  }

  async listRequestsForUser(userId: string) {
    const participants = await prisma.conversationParticipant.findMany({
      where: { userId, status: 'PENDING' },
      include: {
        conversation: {
          include: {
            participants: {
              where: { userId: { not: userId } },
              include: { user: { select: PARTICIPANT_USER_SELECT } },
            },
            messages: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
      orderBy: { conversation: { lastMessageAt: 'desc' } },
    });

    return participants.map((p) => ({
      id: p.conversation.id,
      isGroup: p.conversation.isGroup,
      name: p.conversation.name,
      lastMessageAt: p.conversation.lastMessageAt,
      otherParticipants: p.conversation.participants.map((op) => op.user),
      lastMessage: p.conversation.messages[0] ?? null,
    }));
  }

  async updateParticipantStatus(conversationId: string, userId: string, status: string) {
    return prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { status },
    });
  }

  async hideForUser(conversationId: string, userId: string) {
    return prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { hiddenAt: new Date() },
    });
  }

  async setLeftAt(conversationId: string, userId: string) {
    return prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { leftAt: new Date() },
    });
  }

  async rename(conversationId: string, name: string) {
    return prisma.conversation.update({ where: { id: conversationId }, data: { name } });
  }

  /** Adds a participant, or re-activates one who previously left. */
  async upsertParticipant(conversationId: string, userId: string, status: string) {
    return prisma.conversationParticipant.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      create: { conversationId, userId, status },
      update: { status, leftAt: null, hiddenAt: null },
    });
  }

  async markRead(conversationId: string, userId: string) {
    return prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    });
  }

  async countUnreadForUser(userId: string): Promise<number> {
    const participants = await prisma.conversationParticipant.findMany({
      where: { userId, status: 'ACCEPTED', leftAt: null },
      include: { conversation: { select: { lastMessageAt: true } } },
    });
    return participants.filter(
      (p) =>
        (!p.hiddenAt || p.conversation.lastMessageAt > p.hiddenAt) &&
        p.lastReadAt < p.conversation.lastMessageAt
    ).length;
  }
}

export const conversationRepository = new ConversationRepository();
