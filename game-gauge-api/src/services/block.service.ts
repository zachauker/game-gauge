import { blockRepository } from '../repositories/block.repository';
import { userRepository } from '../repositories/user.repository';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors.util';

export class BlockService {
  async blockUser(blockerId: string, blockedUsername: string) {
    const target = await userRepository.findByUsername(blockedUsername);
    if (!target) throw new NotFoundError('User not found');
    if (target.id === blockerId) throw new ValidationError('You cannot block yourself');

    const already = await blockRepository.exists(blockerId, target.id);
    if (already) throw new ConflictError('User is already blocked');

    await blockRepository.create(blockerId, target.id);
    return { blocked: true };
  }

  async unblockUser(blockerId: string, blockedUsername: string) {
    const target = await userRepository.findByUsername(blockedUsername);
    if (!target) throw new NotFoundError('User not found');

    await blockRepository.remove(blockerId, target.id);
    return { blocked: false };
  }

  async isBlockedEitherDirection(userAId: string, userBId: string): Promise<boolean> {
    return blockRepository.existsEitherDirection(userAId, userBId);
  }

  async getBlockedUsers(blockerId: string) {
    const rows = await blockRepository.listBlockedUsers(blockerId);
    return rows.map((r) => r.blocked);
  }
}

export const blockService = new BlockService();
