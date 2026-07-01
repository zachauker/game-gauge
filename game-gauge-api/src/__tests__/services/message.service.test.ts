import { MessageService } from '../../services/message.service';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../utils/errors.util';
import {
  testUser,
  testOtherUser,
  testConversation,
  testGroupConversation,
  testConversationParticipant,
  testOtherConversationParticipant,
  testMessage,
} from '../setup';

jest.mock('../../repositories/message.repository', () => ({
  messageRepository: {
    create: jest.fn(),
    findForConversation: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  },
}));

jest.mock('../../repositories/conversation.repository', () => ({
  conversationRepository: {
    findById: jest.fn(),
    markRead: jest.fn(),
  },
}));

jest.mock('../../services/block.service', () => ({
  blockService: {
    isBlockedEitherDirection: jest.fn(),
  },
}));

jest.mock('../../sockets', () => ({
  emitToConversation: jest.fn(),
  emitToUser: jest.fn(),
}));

import { messageRepository } from '../../repositories/message.repository';
import { conversationRepository } from '../../repositories/conversation.repository';
import { blockService } from '../../services/block.service';

const acceptedConversation = {
  ...testConversation,
  participants: [testConversationParticipant, testOtherConversationParticipant],
};

describe('MessageService', () => {
  let service: MessageService;

  beforeEach(() => {
    service = new MessageService();
    (blockService.isBlockedEitherDirection as jest.Mock).mockResolvedValue(false);
  });

  describe('send', () => {
    beforeEach(() => {
      (conversationRepository.findById as jest.Mock).mockResolvedValue(acceptedConversation);
      (messageRepository.create as jest.Mock).mockResolvedValue(testMessage);
    });

    it('creates a TEXT message for an accepted participant', async () => {
      const result = await service.send(testConversation.id, testUser.id, {
        type: 'TEXT',
        content: 'Hello!',
      });

      expect(messageRepository.create).toHaveBeenCalledWith({
        conversationId: testConversation.id,
        senderId: testUser.id,
        type: 'TEXT',
        content: 'Hello!',
        gameId: undefined,
        listId: undefined,
        reviewId: undefined,
        activityEventId: undefined,
      });
      expect(result).toEqual(testMessage);
    });

    it('marks the conversation read for the sender so their own message is not unread', async () => {
      await service.send(testConversation.id, testUser.id, {
        type: 'TEXT',
        content: 'Hello!',
      });

      expect(conversationRepository.markRead).toHaveBeenCalledWith(
        testConversation.id,
        testUser.id
      );
    });

    it('creates a GAME_SHARE message using entityId as gameId', async () => {
      await service.send(testConversation.id, testUser.id, {
        type: 'GAME_SHARE',
        entityId: 'some-game-id',
      });

      expect(messageRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'GAME_SHARE', gameId: 'some-game-id' })
      );
    });

    it('throws NotFoundError when the sender is not a participant', async () => {
      await expect(
        service.send(testConversation.id, 'stranger-id', { type: 'TEXT', content: 'hi' })
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ForbiddenError when the sender is only PENDING', async () => {
      (conversationRepository.findById as jest.Mock).mockResolvedValue({
        ...testConversation,
        participants: [
          testConversationParticipant,
          { ...testOtherConversationParticipant, status: 'PENDING' },
        ],
      });

      await expect(
        service.send(testConversation.id, testOtherUser.id, { type: 'TEXT', content: 'hi' })
      ).rejects.toThrow(ForbiddenError);
    });

    it('throws ForbiddenError when either party has blocked the other', async () => {
      (blockService.isBlockedEitherDirection as jest.Mock).mockResolvedValue(true);

      await expect(
        service.send(testConversation.id, testUser.id, { type: 'TEXT', content: 'hi' })
      ).rejects.toThrow(ForbiddenError);
    });

    it('throws ForbiddenError when the sender has left the conversation', async () => {
      (conversationRepository.findById as jest.Mock).mockResolvedValue({
        ...testConversation,
        participants: [
          testConversationParticipant,
          { ...testOtherConversationParticipant, status: 'ACCEPTED', leftAt: new Date() },
        ],
      });

      await expect(
        service.send(testConversation.id, testOtherUser.id, { type: 'TEXT', content: 'hi' })
      ).rejects.toThrow(ForbiddenError);
    });

    it('does not check for blocks in a group conversation', async () => {
      (conversationRepository.findById as jest.Mock).mockResolvedValue({
        ...testGroupConversation,
        participants: [testConversationParticipant, testOtherConversationParticipant],
      });
      (blockService.isBlockedEitherDirection as jest.Mock).mockResolvedValue(true);

      await expect(
        service.send(testGroupConversation.id, testUser.id, { type: 'TEXT', content: 'hi' })
      ).resolves.toEqual(testMessage);
      expect(blockService.isBlockedEitherDirection).not.toHaveBeenCalled();
    });

    it('throws BadRequestError for empty TEXT content', async () => {
      await expect(
        service.send(testConversation.id, testUser.id, { type: 'TEXT', content: '   ' })
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('listMessages', () => {
    it('returns messages and marks the conversation read', async () => {
      (conversationRepository.findById as jest.Mock).mockResolvedValue(acceptedConversation);
      (messageRepository.findForConversation as jest.Mock).mockResolvedValue([testMessage]);

      const result = await service.listMessages(testConversation.id, testUser.id);

      expect(result).toEqual([testMessage]);
      expect(conversationRepository.markRead).toHaveBeenCalledWith(
        testConversation.id,
        testUser.id
      );
    });

    it('throws NotFoundError for a non-participant', async () => {
      (conversationRepository.findById as jest.Mock).mockResolvedValue(acceptedConversation);

      await expect(service.listMessages(testConversation.id, 'stranger-id')).rejects.toThrow(
        NotFoundError
      );
    });

    it('passes explicit before/limit through to the repository', async () => {
      (conversationRepository.findById as jest.Mock).mockResolvedValue(acceptedConversation);
      (messageRepository.findForConversation as jest.Mock).mockResolvedValue([testMessage]);

      const before = 'some-message-id';
      const limit = 25;

      await service.listMessages(testConversation.id, testUser.id, before, limit);

      expect(messageRepository.findForConversation).toHaveBeenCalledWith(
        testConversation.id,
        before,
        limit
      );
    });
  });

  describe('edit', () => {
    beforeEach(() => {
      (conversationRepository.findById as jest.Mock).mockResolvedValue(acceptedConversation);
    });

    it('edits the sender own TEXT message', async () => {
      (messageRepository.findById as jest.Mock).mockResolvedValue(testMessage);
      (messageRepository.update as jest.Mock).mockResolvedValue({
        ...testMessage,
        content: 'Updated',
      });

      const result = await service.edit(
        testConversation.id,
        testMessage.id,
        testUser.id,
        'Updated'
      );

      expect(messageRepository.update).toHaveBeenCalledWith(testMessage.id, 'Updated');
      expect(result.content).toBe('Updated');
    });

    it('throws ForbiddenError when editing someone else message', async () => {
      (messageRepository.findById as jest.Mock).mockResolvedValue(testMessage);

      await expect(
        service.edit(testConversation.id, testMessage.id, testOtherUser.id, 'Updated')
      ).rejects.toThrow(ForbiddenError);
    });

    it('throws BadRequestError when editing a non-TEXT message', async () => {
      (messageRepository.findById as jest.Mock).mockResolvedValue({
        ...testMessage,
        type: 'GAME_SHARE',
      });

      await expect(
        service.edit(testConversation.id, testMessage.id, testUser.id, 'Updated')
      ).rejects.toThrow(BadRequestError);
    });

    it('throws NotFoundError when the message does not exist', async () => {
      (messageRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.edit(testConversation.id, testMessage.id, testUser.id, 'Updated')
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when the message belongs to a different conversation', async () => {
      (messageRepository.findById as jest.Mock).mockResolvedValue({
        ...testMessage,
        conversationId: 'some-other-conversation-id',
      });

      await expect(
        service.edit(testConversation.id, testMessage.id, testUser.id, 'Updated')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('delete', () => {
    beforeEach(() => {
      (conversationRepository.findById as jest.Mock).mockResolvedValue(acceptedConversation);
    });

    it('soft-deletes the sender own message', async () => {
      (messageRepository.findById as jest.Mock).mockResolvedValue(testMessage);
      (messageRepository.softDelete as jest.Mock).mockResolvedValue(undefined);

      await service.delete(testConversation.id, testMessage.id, testUser.id);

      expect(messageRepository.softDelete).toHaveBeenCalledWith(testMessage.id);
    });

    it('throws ForbiddenError when deleting someone else message', async () => {
      (messageRepository.findById as jest.Mock).mockResolvedValue(testMessage);

      await expect(
        service.delete(testConversation.id, testMessage.id, testOtherUser.id)
      ).rejects.toThrow(ForbiddenError);
    });

    it('throws NotFoundError when the message does not exist', async () => {
      (messageRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.delete(testConversation.id, testMessage.id, testUser.id)
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when the message belongs to a different conversation', async () => {
      (messageRepository.findById as jest.Mock).mockResolvedValue({
        ...testMessage,
        conversationId: 'some-other-conversation-id',
      });

      await expect(
        service.delete(testConversation.id, testMessage.id, testUser.id)
      ).rejects.toThrow(NotFoundError);
    });
  });
});
