import { BlockService } from '../../services/block.service';
import { NotFoundError, ValidationError, ConflictError } from '../../utils/errors.util';
import { testUser, testOtherUser, testBlock } from '../setup';

jest.mock('../../repositories/block.repository', () => ({
  blockRepository: {
    create: jest.fn(),
    remove: jest.fn(),
    exists: jest.fn(),
    existsEitherDirection: jest.fn(),
    listBlockedUsers: jest.fn(),
  },
}));

jest.mock('../../repositories/user.repository', () => ({
  userRepository: {
    findByUsername: jest.fn(),
  },
}));

import { blockRepository } from '../../repositories/block.repository';
import { userRepository } from '../../repositories/user.repository';

describe('BlockService', () => {
  let service: BlockService;

  beforeEach(() => {
    service = new BlockService();
  });

  describe('blockUser', () => {
    it('creates a block when the target exists and is not already blocked', async () => {
      (userRepository.findByUsername as jest.Mock).mockResolvedValue(testOtherUser);
      (blockRepository.exists as jest.Mock).mockResolvedValue(false);
      (blockRepository.create as jest.Mock).mockResolvedValue(testBlock);

      const result = await service.blockUser(testUser.id, testOtherUser.username);

      expect(blockRepository.create).toHaveBeenCalledWith(testUser.id, testOtherUser.id);
      expect(result).toEqual({ blocked: true });
    });

    it('throws NotFoundError when the target user does not exist', async () => {
      (userRepository.findByUsername as jest.Mock).mockResolvedValue(null);

      await expect(service.blockUser(testUser.id, 'ghost')).rejects.toThrow(NotFoundError);
    });

    it('throws ValidationError when blocking yourself', async () => {
      (userRepository.findByUsername as jest.Mock).mockResolvedValue(testUser);

      await expect(service.blockUser(testUser.id, testUser.username)).rejects.toThrow(
        ValidationError
      );
    });

    it('throws ConflictError when already blocked', async () => {
      (userRepository.findByUsername as jest.Mock).mockResolvedValue(testOtherUser);
      (blockRepository.exists as jest.Mock).mockResolvedValue(true);

      await expect(
        service.blockUser(testUser.id, testOtherUser.username)
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('unblockUser', () => {
    it('removes the block', async () => {
      (userRepository.findByUsername as jest.Mock).mockResolvedValue(testOtherUser);
      (blockRepository.remove as jest.Mock).mockResolvedValue(undefined);

      const result = await service.unblockUser(testUser.id, testOtherUser.username);

      expect(blockRepository.remove).toHaveBeenCalledWith(testUser.id, testOtherUser.id);
      expect(result).toEqual({ blocked: false });
    });
  });

  describe('isBlockedEitherDirection', () => {
    it('delegates to the repository', async () => {
      (blockRepository.existsEitherDirection as jest.Mock).mockResolvedValue(true);

      const result = await service.isBlockedEitherDirection(testUser.id, testOtherUser.id);

      expect(result).toBe(true);
      expect(blockRepository.existsEitherDirection).toHaveBeenCalledWith(
        testUser.id,
        testOtherUser.id
      );
    });
  });

  describe('getBlockedUsers', () => {
    it('maps rows to their blocked user', async () => {
      (blockRepository.listBlockedUsers as jest.Mock).mockResolvedValue([
        { ...testBlock, blocked: { id: testOtherUser.id, username: testOtherUser.username, avatar: null } },
      ]);

      const result = await service.getBlockedUsers(testUser.id);

      expect(result).toEqual([{ id: testOtherUser.id, username: testOtherUser.username, avatar: null }]);
    });
  });
});
