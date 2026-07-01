import { prisma } from '../config/database';
import { Block } from '@prisma/client';

class BlockRepository {
  async create(blockerId: string, blockedId: string): Promise<Block> {
    return prisma.block.create({ data: { blockerId, blockedId } });
  }

  async remove(blockerId: string, blockedId: string): Promise<void> {
    await prisma.block.deleteMany({ where: { blockerId, blockedId } });
  }

  async exists(blockerId: string, blockedId: string): Promise<boolean> {
    const count = await prisma.block.count({ where: { blockerId, blockedId } });
    return count > 0;
  }

  async existsEitherDirection(userAId: string, userBId: string): Promise<boolean> {
    const count = await prisma.block.count({
      where: {
        OR: [
          { blockerId: userAId, blockedId: userBId },
          { blockerId: userBId, blockedId: userAId },
        ],
      },
    });
    return count > 0;
  }

  async listBlockedUsers(blockerId: string) {
    return prisma.block.findMany({
      where: { blockerId },
      orderBy: { createdAt: 'desc' },
      include: {
        blocked: { select: { id: true, username: true, avatar: true } },
      },
    });
  }
}

export const blockRepository = new BlockRepository();
