import { ConversationService } from '../../services/conversation.service';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  BadRequestError,
} from '../../utils/errors.util';
import {
  testUser,
  testOtherUser,
  testConversation,
  testGroupConversation,
  testConversationParticipant,
  testOtherConversationParticipant,
} from '../setup';

jest.mock('../../repositories/conversation.repository', () => ({
  conversationRepository: {
    findOneOnOneBetween: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    listInboxForUser: jest.fn(),
    listRequestsForUser: jest.fn(),
    updateParticipantStatus: jest.fn(),
    hideForUser: jest.fn(),
    setLeftAt: jest.fn(),
    rename: jest.fn(),
    upsertParticipant: jest.fn(),
    countUnreadForUser: jest.fn(),
  },
}));

jest.mock('../../repositories/user.repository', () => ({
  userRepository: {
    findByUsername: jest.fn(),
  },
}));

jest.mock('../../repositories/follow.repository', () => ({
  followRepository: {
    isFollowing: jest.fn(),
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

import { conversationRepository } from '../../repositories/conversation.repository';
import { userRepository } from '../../repositories/user.repository';
import { followRepository } from '../../repositories/follow.repository';
import { blockService } from '../../services/block.service';

const withParticipants = (conversation: typeof testConversation | typeof testGroupConversation) => ({
  ...conversation,
  participants: [testConversationParticipant, testOtherConversationParticipant],
});

describe('ConversationService', () => {
  let service: ConversationService;

  beforeEach(() => {
    service = new ConversationService();
    (blockService.isBlockedEitherDirection as jest.Mock).mockResolvedValue(false);
  });

  describe('createConversation — 1:1', () => {
    beforeEach(() => {
      (userRepository.findByUsername as jest.Mock).mockResolvedValue(testOtherUser);
      (conversationRepository.findOneOnOneBetween as jest.Mock).mockResolvedValue(null);
      (conversationRepository.create as jest.Mock).mockResolvedValue(
        withParticipants(testConversation)
      );
    });

    it('creates both participants as ACCEPTED when the users mutually follow', async () => {
      (followRepository.isFollowing as jest.Mock).mockResolvedValue(true);

      await service.createConversation(testUser.id, {
        participantUsernames: [testOtherUser.username],
        isGroup: false,
      });

      expect(conversationRepository.create).toHaveBeenCalledWith({
        isGroup: false,
        participants: [
          { userId: testUser.id, status: 'ACCEPTED' },
          { userId: testOtherUser.id, status: 'ACCEPTED' },
        ],
      });
    });

    it('creates the recipient as PENDING when there is no mutual follow', async () => {
      (followRepository.isFollowing as jest.Mock).mockResolvedValue(false);

      await service.createConversation(testUser.id, {
        participantUsernames: [testOtherUser.username],
        isGroup: false,
      });

      expect(conversationRepository.create).toHaveBeenCalledWith({
        isGroup: false,
        participants: [
          { userId: testUser.id, status: 'ACCEPTED' },
          { userId: testOtherUser.id, status: 'PENDING' },
        ],
      });
    });

    it('returns the existing 1:1 conversation instead of creating a duplicate', async () => {
      (conversationRepository.findOneOnOneBetween as jest.Mock).mockResolvedValue(testConversation);
      (conversationRepository.findById as jest.Mock).mockResolvedValue(
        withParticipants(testConversation)
      );

      await service.createConversation(testUser.id, {
        participantUsernames: [testOtherUser.username],
        isGroup: false,
      });

      expect(conversationRepository.create).not.toHaveBeenCalled();
      expect(conversationRepository.findById).toHaveBeenCalledWith(testConversation.id);
    });

    it('throws NotFoundError when the target user does not exist', async () => {
      (userRepository.findByUsername as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createConversation(testUser.id, {
          participantUsernames: ['ghost'],
          isGroup: false,
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ForbiddenError when either user has blocked the other', async () => {
      (blockService.isBlockedEitherDirection as jest.Mock).mockResolvedValue(true);

      await expect(
        service.createConversation(testUser.id, {
          participantUsernames: [testOtherUser.username],
          isGroup: false,
        })
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('createConversation — group', () => {
    it('computes each invitee status independently based on mutual follow', async () => {
      const thirdUser = { ...testOtherUser, id: 'third-user-id', username: 'thirduser' };
      (userRepository.findByUsername as jest.Mock).mockImplementation((username: string) =>
        Promise.resolve(username === testOtherUser.username ? testOtherUser : thirdUser)
      );
      // Simulate a true mutual follow between testUser and testOtherUser only;
      // thirdUser has no follow relationship with testUser in either direction.
      (followRepository.isFollowing as jest.Mock).mockImplementation((aId: string, bId: string) =>
        Promise.resolve(
          (aId === testUser.id && bId === testOtherUser.id) ||
            (aId === testOtherUser.id && bId === testUser.id)
        )
      );
      (conversationRepository.create as jest.Mock).mockResolvedValue(
        withParticipants(testGroupConversation)
      );

      await service.createConversation(testUser.id, {
        participantUsernames: [testOtherUser.username, thirdUser.username],
        isGroup: true,
        name: 'Squad',
      });

      expect(conversationRepository.create).toHaveBeenCalledWith({
        isGroup: true,
        name: 'Squad',
        creatorId: testUser.id,
        participants: [
          { userId: testUser.id, status: 'ACCEPTED' },
          { userId: testOtherUser.id, status: 'ACCEPTED' },
          { userId: thirdUser.id, status: 'PENDING' },
        ],
      });
    });

    it('throws ValidationError with fewer than two invitees', async () => {
      await expect(
        service.createConversation(testUser.id, {
          participantUsernames: [testOtherUser.username],
          isGroup: true,
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('accept / decline', () => {
    it('accepts a pending request', async () => {
      (conversationRepository.findById as jest.Mock).mockResolvedValue({
        ...testConversation,
        participants: [
          testConversationParticipant,
          { ...testOtherConversationParticipant, status: 'PENDING' },
        ],
      });
      (conversationRepository.updateParticipantStatus as jest.Mock).mockResolvedValue(undefined);

      const result = await service.accept(testConversation.id, testOtherUser.id);

      expect(conversationRepository.updateParticipantStatus).toHaveBeenCalledWith(
        testConversation.id,
        testOtherUser.id,
        'ACCEPTED'
      );
      expect(result).toEqual({ status: 'ACCEPTED' });
    });

    it('throws BadRequestError when the participant is not pending', async () => {
      (conversationRepository.findById as jest.Mock).mockResolvedValue({
        ...testConversation,
        participants: [
          testConversationParticipant,
          { ...testOtherConversationParticipant, status: 'ACCEPTED' },
        ],
      });

      await expect(service.accept(testConversation.id, testOtherUser.id)).rejects.toThrow(
        BadRequestError
      );
    });

    it('throws NotFoundError when the requester is not a participant', async () => {
      (conversationRepository.findById as jest.Mock).mockResolvedValue(
        withParticipants(testConversation)
      );

      await expect(service.accept(testConversation.id, 'stranger-id')).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('archiveOrLeave', () => {
    it('hides a 1:1 conversation for the requester', async () => {
      (conversationRepository.findById as jest.Mock).mockResolvedValue(
        withParticipants(testConversation)
      );

      await service.archiveOrLeave(testConversation.id, testUser.id);

      expect(conversationRepository.hideForUser).toHaveBeenCalledWith(
        testConversation.id,
        testUser.id
      );
      expect(conversationRepository.setLeftAt).not.toHaveBeenCalled();
    });

    it('sets leftAt for a group conversation', async () => {
      (conversationRepository.findById as jest.Mock).mockResolvedValue(
        withParticipants(testGroupConversation)
      );

      await service.archiveOrLeave(testGroupConversation.id, testUser.id);

      expect(conversationRepository.setLeftAt).toHaveBeenCalledWith(
        testGroupConversation.id,
        testUser.id
      );
      expect(conversationRepository.hideForUser).not.toHaveBeenCalled();
    });
  });

  describe('rename', () => {
    it('allows the creator to rename a group', async () => {
      (conversationRepository.findById as jest.Mock).mockResolvedValue(
        withParticipants(testGroupConversation)
      );

      await service.rename(testGroupConversation.id, testUser.id, 'New Name');

      expect(conversationRepository.rename).toHaveBeenCalledWith(
        testGroupConversation.id,
        'New Name'
      );
    });

    it('throws ForbiddenError when a non-creator tries to rename', async () => {
      (conversationRepository.findById as jest.Mock).mockResolvedValue(
        withParticipants(testGroupConversation)
      );

      await expect(
        service.rename(testGroupConversation.id, testOtherUser.id, 'New Name')
      ).rejects.toThrow(ForbiddenError);
    });

    it('throws BadRequestError for a 1:1 conversation', async () => {
      (conversationRepository.findById as jest.Mock).mockResolvedValue(
        withParticipants(testConversation)
      );

      await expect(service.rename(testConversation.id, testUser.id, 'x')).rejects.toThrow(
        BadRequestError
      );
    });
  });

  describe('addMember / removeMember', () => {
    it('allows the creator to add a member', async () => {
      (conversationRepository.findById as jest.Mock).mockResolvedValue(
        withParticipants(testGroupConversation)
      );
      (userRepository.findByUsername as jest.Mock).mockResolvedValue(testOtherUser);
      (followRepository.isFollowing as jest.Mock).mockResolvedValue(true);

      await service.addMember(testGroupConversation.id, testUser.id, testOtherUser.username);

      expect(conversationRepository.upsertParticipant).toHaveBeenCalledWith(
        testGroupConversation.id,
        testOtherUser.id,
        'ACCEPTED'
      );
    });

    it('throws ForbiddenError when a non-creator tries to add a member', async () => {
      (conversationRepository.findById as jest.Mock).mockResolvedValue(
        withParticipants(testGroupConversation)
      );

      await expect(
        service.addMember(testGroupConversation.id, testOtherUser.id, 'someone')
      ).rejects.toThrow(ForbiddenError);
    });

    it('allows any member to remove themselves', async () => {
      (conversationRepository.findById as jest.Mock).mockResolvedValue(
        withParticipants(testGroupConversation)
      );

      await service.removeMember(testGroupConversation.id, testOtherUser.id, testOtherUser.id);

      expect(conversationRepository.setLeftAt).toHaveBeenCalledWith(
        testGroupConversation.id,
        testOtherUser.id
      );
    });

    it('throws ForbiddenError when a non-creator tries to remove someone else', async () => {
      (conversationRepository.findById as jest.Mock).mockResolvedValue(
        withParticipants(testGroupConversation)
      );

      await expect(
        service.removeMember(testGroupConversation.id, testOtherUser.id, testUser.id)
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('getUnreadCount', () => {
    it('delegates to the repository', async () => {
      (conversationRepository.countUnreadForUser as jest.Mock).mockResolvedValue(3);

      const result = await service.getUnreadCount(testUser.id);

      expect(result).toBe(3);
      expect(conversationRepository.countUnreadForUser).toHaveBeenCalledWith(testUser.id);
    });
  });
});
