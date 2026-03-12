/**
 * scripts/backfill-default-lists.ts
 *
 * One-time script to provision the three default lists (Wishlist, Currently
 * Playing, Completed) for any existing users who don't already have them.
 *
 * Run AFTER the migration:
 *   npx ts-node scripts/backfill-default-lists.ts
 *
 * Safe to re-run — checks before creating, won't duplicate.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_LISTS = [
  { name: 'Wishlist', listType: 'wishlist', isPublic: false },
  { name: 'Currently Playing', listType: 'playing', isPublic: true },
  { name: 'Completed', listType: 'completed', isPublic: true },
] as const;

async function main() {
  console.log('🔍 Fetching all users...');

  const users = await prisma.user.findMany({ select: { id: true, username: true } });
  console.log(`Found ${users.length} users.\n`);

  let usersPatched = 0;
  let listsCreated = 0;

  for (const user of users) {
    // Find which default listTypes this user already has
    const existing = await prisma.gameList.findMany({
      where: { userId: user.id, isDefault: true },
      select: { listType: true },
    });
    const existingTypes = new Set(existing.map((l) => l.listType));

    const missing = DEFAULT_LISTS.filter((l) => !existingTypes.has(l.listType));

    if (missing.length === 0) continue;

    await prisma.$transaction(
      missing.map((l) =>
        prisma.gameList.create({
          data: {
            userId: user.id,
            name: l.name,
            listType: l.listType,
            isDefault: true,
            isPublic: l.isPublic,
          },
        })
      )
    );

    usersPatched++;
    listsCreated += missing.length;
    console.log(`  ✅ ${user.username} — created: ${missing.map((l) => l.name).join(', ')}`);
  }

  console.log(`\n✨ Done. ${usersPatched} users patched, ${listsCreated} lists created.`);
}

main()
  .catch((err) => {
    console.error('❌ Backfill failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
