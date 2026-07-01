import { messageRepository } from '../repositories/message.repository';
import { conversationRepository } from '../repositories/conversation.repository';
import { blockService } from './block.service';
import { emitToConversation, emitToUser } from '../sockets';
import { NotFoundError, ForbiddenError, BadRequestError } from '../utils/errors.util';
import { SendMessageInput } from '../validators/conversation.validator';

export class MessageService {
  private async requireAcceptedParticipant(conversationId: string, userId: string) {
    const conversation = await conversationRepository.findById(conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found');
    const participant = conversation.participants.find((p) => p.userId === userId);
    if (!participant) throw new NotFoundError('Conversation not found');
    if (participant.status !== 'ACCEPTED' || participant.leftAt) {
      throw new ForbiddenError('You are not an active participant in this conversation');
    }
    return conversation;
  }

  async send(conversationId: string, senderId: string, input: SendMessageInput) {
    const conversation = await this.requireAcceptedParticipant(conversationId, senderId);

    if (!conversation.isGroup) {
      const other = conversation.participants.find((p) => p.userId !== senderId);
      if (other) {
        const blocked = await blockService.isBlockedEitherDirection(senderId, other.userId);
        if (blocked) throw new ForbiddenError('You cannot message this user');
      }
    }

    if (input.type === 'TEXT' && !input.content?.trim()) {
      throw new BadRequestError('Message content cannot be empty');
    }

    const message = await messageRepository.create({
      conversationId,
      senderId,
      type: input.type,
      content: input.type === 'TEXT' ? input.content : undefined,
      gameId: input.type === 'GAME_SHARE' ? input.entityId : undefined,
      listId: input.type === 'LIST_SHARE' ? input.entityId : undefined,
      reviewId: input.type === 'REVIEW_SHARE' ? input.entityId : undefined,
      activityEventId: input.type === 'ACTIVITY_SHARE' ? input.entityId : undefined,
    });

    emitToConversation(conversationId, 'message:new', message);
    for (const participant of conversation.participants) {
      if (participant.userId !== senderId && participant.status === 'ACCEPTED') {
        emitToUser(participant.userId, 'unread:update', {});
      }
    }

    return message;
  }

  async listMessages(conversationId: string, userId: string, before?: string, limit?: number) {
    await this.requireAcceptedParticipant(conversationId, userId);
    const messages = await messageRepository.findForConversation(conversationId, before, limit);
    await conversationRepository.markRead(conversationId, userId);
    return messages;
  }

  async edit(conversationId: string, messageId: string, userId: string, content: string) {
    await this.requireAcceptedParticipant(conversationId, userId);
    const message = await messageRepository.findById(messageId);
    if (!message || message.conversationId !== conversationId) {
      throw new NotFoundError('Message not found');
    }
    if (message.senderId !== userId) throw new ForbiddenError('You can only edit your own messages');
    if (message.type !== 'TEXT') throw new BadRequestError('Only text messages can be edited');
    if (!content.trim()) throw new BadRequestError('Message content cannot be empty');

    const updated = await messageRepository.update(messageId, content);
    emitToConversation(conversationId, 'message:edited', updated);
    return updated;
  }

  async delete(conversationId: string, messageId: string, userId: string) {
    await this.requireAcceptedParticipant(conversationId, userId);
    const message = await messageRepository.findById(messageId);
    if (!message || message.conversationId !== conversationId) {
      throw new NotFoundError('Message not found');
    }
    if (message.senderId !== userId) {
      throw new ForbiddenError('You can only delete your own messages');
    }

    await messageRepository.softDelete(messageId);
    emitToConversation(conversationId, 'message:deleted', { id: messageId });
    return { message: 'Message deleted' };
  }
}

export const messageService = new MessageService();
