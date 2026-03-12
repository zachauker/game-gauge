import { prisma } from '../config/database';
import { logger } from '../utils/logger.util';

const DEFAULT_LISTS = [
  { name: 'Wishlist',          listType: 'wishlist',  isPublic: false },
  { name: 'Currently Playing', listType: 'playing',   isPublic: true  },
  { name: 'Completed',         listType: 'completed', isPublic: true  },
] as const;

/**
 * Provisions the three default lists for a newly created user.
 * All three are created atomically in a single transaction.
 *
 * Safe to call from both email/password and Steam registration paths.
 */
export async function provisionDefaultLists(userId: string): Promise<void> {
  await prisma.$transaction(
    DEFAULT_LISTS.map((list) =>
      prisma.gameList.create({
        data: {
          userId,
          name:      list.name,
          listType:  list.listType,
          isDefault: true,
          isPublic:  list.isPublic,
        },
      })
    )
  );

  logger.info(`Default lists provisioned for user ${userId}`);
}
