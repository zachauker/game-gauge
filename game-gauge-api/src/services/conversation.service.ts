import { conversationRepository } from '../repositories/conversation.repository';
import { userRepository } from '../repositories/user.repository';
import { followRepository } from '../repositories/follow.repository';
import { blockService } from './block.service';
import { emitToUser, emitToConversation } from '../sockets';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  BadRequestError,
} from '../utils/errors.util';
import { CreateConversationInput } from '../validators/conversation.validator';

export class ConversationService {
  /**
   * Mutual follow = both users follow each other. Checked as two independent
   * one-directional lookups so a follow in only one direction is not enough
   * to auto-accept a conversation request.
   */
  private async isMutualFollow(userAId: string, userBId: string): Promise<boolean> {
    const [aFollowsB, bFollowsA] = await Promise.all([
      followRepository.isFollowing(userAId, userBId),
      followRepository.isFollowing(userBId, userAId),
    ]);
    return aFollowsB && bFollowsA;
  }

  async createConversation(creatorId: string, input: CreateConversationInput) {
    const { participantUsernames, isGroup, name } = input;

    if (!isGroup && participantUsernames.length !== 1) {
      throw new ValidationError('A 1:1 conversation requires exactly one other participant');
    }
    if (isGroup && participantUsernames.length < 2) {
      throw new ValidationError('A group conversation requires at least two other participants');
    }

    const targets = await Promise.all(
      participantUsernames.map(async (username) => {
        const user = await userRepository.findByUsername(username);
        if (!user) throw new NotFoundError(`User "${username}" not found`);
        if (user.id === creatorId) {
          throw new ValidationError('You cannot add yourself as a participant');
        }
        return user;
      })
    );

    for (const target of targets) {
      const blocked = await blockService.isBlockedEitherDirection(creatorId, target.id);
      if (blocked) throw new ForbiddenError(`You cannot message ${target.username}`);
    }

    if (!isGroup) {
      const existing = await conversationRepository.findOneOnOneBetween(creatorId, targets[0].id);
      if (existing) return conversationRepository.findById(existing.id);

      const mutual = await this.isMutualFollow(creatorId, targets[0].id);
      const conversation = await conversationRepository.create({
        isGroup: false,
        participants: [
          { userId: creatorId, status: 'ACCEPTED' },
          { userId: targets[0].id, status: mutual ? 'ACCEPTED' : 'PENDING' },
        ],
      });
      emitToUser(targets[0].id, 'conversation:new', conversation);
      return conversation;
    }

    const memberStatuses = await Promise.all(
      targets.map(async (target) => ({
        userId: target.id,
        status: (await this.isMutualFollow(creatorId, target.id)) ? 'ACCEPTED' : 'PENDING',
      }))
    );

    const conversation = await conversationRepository.create({
      isGroup: true,
      name,
      creatorId,
      participants: [{ userId: creatorId, status: 'ACCEPTED' }, ...memberStatuses],
    });
    for (const target of targets) {
      emitToUser(target.id, 'conversation:new', conversation);
    }
    return conversation;
  }

  private async requireParticipant(conversationId: string, userId: string) {
    const conversation = await conversationRepository.findById(conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found');
    const participant = conversation.participants.find((p) => p.userId === userId);
    if (!participant) throw new NotFoundError('Conversation not found');
    return { conversation, participant };
  }

  async getInbox(userId: string, page: number, limit: number) {
    const { conversations, total } = await conversationRepository.listInboxForUser(
      userId,
      page,
      limit
    );
    return { conversations, pagination: { page, limit, total, hasMore: page * limit < total } };
  }

  async getRequests(userId: string) {
    return conversationRepository.listRequestsForUser(userId);
  }

  async getConversation(conversationId: string, userId: string) {
    const { conversation } = await this.requireParticipant(conversationId, userId);
    return conversation;
  }

  async accept(conversationId: string, userId: string) {
    const { participant } = await this.requireParticipant(conversationId, userId);
    if (participant.status !== 'PENDING') throw new BadRequestError('This request is not pending');
    await conversationRepository.updateParticipantStatus(conversationId, userId, 'ACCEPTED');
    return { status: 'ACCEPTED' };
  }

  async decline(conversationId: string, userId: string) {
    const { participant } = await this.requireParticipant(conversationId, userId);
    if (participant.status !== 'PENDING') throw new BadRequestError('This request is not pending');
    await conversationRepository.updateParticipantStatus(conversationId, userId, 'DECLINED');
    return { status: 'DECLINED' };
  }

  async archiveOrLeave(conversationId: string, userId: string) {
    const { conversation } = await this.requireParticipant(conversationId, userId);
    if (conversation.isGroup) {
      await conversationRepository.setLeftAt(conversationId, userId);
    } else {
      await conversationRepository.hideForUser(conversationId, userId);
    }
    return { message: conversation.isGroup ? 'Left conversation' : 'Conversation archived' };
  }

  async rename(conversationId: string, userId: string, name: string) {
    const { conversation } = await this.requireParticipant(conversationId, userId);
    if (!conversation.isGroup) {
      throw new BadRequestError('Only group conversations can be renamed');
    }
    if (conversation.creatorId !== userId) {
      throw new ForbiddenError('Only the group creator can rename this conversation');
    }
    await conversationRepository.rename(conversationId, name);
    emitToConversation(conversationId, 'conversation:updated', { id: conversationId, name });
    return { name };
  }

  async addMember(conversationId: string, userId: string, targetUsername: string) {
    const { conversation } = await this.requireParticipant(conversationId, userId);
    if (!conversation.isGroup) {
      throw new BadRequestError('Only group conversations support adding members');
    }
    if (conversation.creatorId !== userId) {
      throw new ForbiddenError('Only the group creator can add members');
    }

    const target = await userRepository.findByUsername(targetUsername);
    if (!target) throw new NotFoundError('User not found');

    const blocked = await blockService.isBlockedEitherDirection(userId, target.id);
    if (blocked) throw new ForbiddenError(`You cannot add ${target.username}`);

    const mutual = await this.isMutualFollow(userId, target.id);
    await conversationRepository.upsertParticipant(
      conversationId,
      target.id,
      mutual ? 'ACCEPTED' : 'PENDING'
    );
    emitToConversation(conversationId, 'conversation:updated', { id: conversationId });
    emitToUser(target.id, 'conversation:new', conversation);
    return { added: target.username };
  }

  async removeMember(conversationId: string, requesterId: string, targetUserId: string) {
    const { conversation } = await this.requireParticipant(conversationId, requesterId);
    if (!conversation.isGroup) {
      throw new BadRequestError('Only group conversations support removing members');
    }

    const isSelf = requesterId === targetUserId;
    if (!isSelf && conversation.creatorId !== requesterId) {
      throw new ForbiddenError('Only the group creator can remove other members');
    }

    await conversationRepository.setLeftAt(conversationId, targetUserId);
    emitToConversation(conversationId, 'conversation:updated', { id: conversationId });
    return { removed: targetUserId };
  }

  async getUnreadCount(userId: string) {
    return conversationRepository.countUnreadForUser(userId);
  }
}

export const conversationService = new ConversationService();
