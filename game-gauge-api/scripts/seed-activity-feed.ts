/**
 * scripts/seed-activity-feed.ts
 *
 * Populates realistic QA data for testing the social activity feed locally.
 *
 * Creates:
 *   - 8 users (including 1 "you" account you can log in as)
 *   - 12 games
 *   - Ratings, reviews, and list activity spread across users
 *   - Follow relationships forming a realistic social graph
 *   - ActivityEvent rows for every action
 *
 * Run from game-gauge-api/:
 *   npx tsx scripts/seed-activity-feed.ts
 *
 * Re-runnable: skips anything that already exists by username/slug/email.
 * Pass --clean to wipe seed data first:
 *   npx tsx scripts/seed-activity-feed.ts --clean
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;
const SEED_PASSWORD = 'Seed1234!';
const CLEAN = process.argv.includes('--clean');

// ─── Colour helpers ───────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
};

const log = {
  section: (msg: string) => console.log(`\n${c.bold}${c.cyan}▸ ${msg}${c.reset}`),
  ok: (msg: string) => console.log(`  ${c.green}✓${c.reset} ${msg}`),
  skip: (msg: string) => console.log(`  ${c.dim}– ${msg} (already exists)${c.reset}`),
  warn: (msg: string) => console.log(`  ${c.yellow}⚠ ${msg}${c.reset}`),
  info: (msg: string) => console.log(`  ${c.dim}  ${msg}${c.reset}`),
};

// ─── Seed data definitions ────────────────────────────────────────────────────

const USERS = [
  // Index 0 — the "you" account
  {
    email: 'you@gamegauge.dev',
    username: 'qatester',
    firstName: 'QA',
    lastName: 'Tester',
    bio: 'Testing the activity feed. Follow me!',
    avatar: null,
  },
  {
    email: 'alex@gamegauge.dev',
    username: 'alexplay',
    firstName: 'Alex',
    lastName: 'Player',
    bio: 'RPG enthusiast and speedrunner.',
    avatar: null,
  },
  {
    email: 'morgan@gamegauge.dev',
    username: 'morgan_gc',
    firstName: 'Morgan',
    lastName: 'Chen',
    bio: 'I rate everything a 7/10.',
    avatar: null,
  },
  {
    email: 'priya@gamegauge.dev',
    username: 'priya_plays',
    firstName: 'Priya',
    lastName: 'Sharma',
    bio: 'Horror games and cosy sims.',
    avatar: null,
  },
  {
    email: 'sam@gamegauge.dev',
    username: 'samurai_sam',
    firstName: 'Sam',
    lastName: 'Rivera',
    bio: 'Action-adventure or nothing.',
    avatar: null,
  },
  {
    email: 'jade@gamegauge.dev',
    username: 'jade_reviews',
    firstName: 'Jade',
    lastName: 'Kim',
    bio: 'I write long reviews that nobody reads.',
    avatar: null,
  },
  {
    email: 'rio@gamegauge.dev',
    username: 'rio_gamer',
    firstName: 'Rio',
    lastName: 'Santos',
    bio: 'Multiplayer only.',
    avatar: null,
  },
  {
    email: 'frankie@gamegauge.dev',
    username: 'frankiepop',
    firstName: 'Frankie',
    lastName: 'Park',
    bio: 'Backlog conquerer (slowly).',
    avatar: null,
  },
];

const GAMES = [
  {
    title: 'Hollow Knight',
    slug: 'hollow-knight',
    description: 'A challenging metroidvania set in a vast underground insect kingdom.',
    developer: 'Team Cherry',
    publisher: 'Team Cherry',
    genres: ['Metroidvania', 'Platformer', 'Action'],
    platforms: ['PC', 'Switch', 'PS4', 'Xbox One'],
    coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co4b0b.jpg',
    igdbId: 14593,
    metacritic: 87,
  },
  {
    title: 'Hades',
    slug: 'hades',
    description: 'A rogue-like dungeon crawler where you defy the god of the dead.',
    developer: 'Supergiant Games',
    publisher: 'Supergiant Games',
    genres: ['Roguelike', 'Action', 'RPG'],
    platforms: ['PC', 'Switch', 'PS4', 'PS5', 'Xbox One'],
    coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1tmu.jpg',
    igdbId: 91262,
    metacritic: 93,
  },
  {
    title: 'Elden Ring',
    slug: 'elden-ring',
    description: 'An action RPG set in the Lands Between, developed with George R. R. Martin.',
    developer: 'FromSoftware',
    publisher: 'Bandai Namco',
    genres: ['Action RPG', 'Open World', 'Souls-like'],
    platforms: ['PC', 'PS4', 'PS5', 'Xbox One', 'Xbox Series'],
    coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co4jni.jpg',
    igdbId: 119133,
    metacritic: 96,
  },
  {
    title: 'Celeste',
    slug: 'celeste',
    description:
      'Help Madeline survive her inner demons on her journey to the top of Celeste Mountain.',
    developer: 'Maddy Makes Games',
    publisher: 'Matt Makes Games',
    genres: ['Platformer', 'Indie', 'Difficult'],
    platforms: ['PC', 'Switch', 'PS4', 'Xbox One'],
    coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1tgy.jpg',
    igdbId: 65786,
    metacritic: 92,
  },
  {
    title: "Baldur's Gate 3",
    slug: 'baldurs-gate-3',
    description: 'An RPG set in the Forgotten Realms, developed by Larian Studios.',
    developer: 'Larian Studios',
    publisher: 'Larian Studios',
    genres: ['RPG', 'Turn-based', 'Fantasy'],
    platforms: ['PC', 'PS5'],
    coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co6ly2.jpg',
    igdbId: 119171,
    metacritic: 96,
  },
  {
    title: 'Stardew Valley',
    slug: 'stardew-valley',
    description: "You've inherited your grandfather's old farm plot in Stardew Valley.",
    developer: 'ConcernedApe',
    publisher: 'ConcernedApe',
    genres: ['Simulation', 'RPG', 'Farming'],
    platforms: ['PC', 'Switch', 'PS4', 'Xbox One', 'Mobile'],
    coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/xrpmydnu9rpxvxfjkiu7.jpg',
    igdbId: 17000,
    metacritic: 89,
  },
  {
    title: 'Disco Elysium',
    slug: 'disco-elysium',
    description: 'A groundbreaking role playing game where you are a detective with unique skills.',
    developer: 'ZA/UM',
    publisher: 'ZA/UM',
    genres: ['RPG', 'Detective', 'Narrative'],
    platforms: ['PC', 'PS4', 'PS5'],
    coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1sfj.jpg',
    igdbId: 103298,
    metacritic: 91,
  },
  {
    title: 'Return of the Obra Dinn',
    slug: 'return-of-the-obra-dinn',
    description: 'In 1807, the merchant vessel Obra Dinn returns to port with no crew aboard.',
    developer: 'Lucas Pope',
    publisher: 'Lucas Pope',
    genres: ['Puzzle', 'Mystery', 'Indie'],
    platforms: ['PC', 'Switch', 'PS4', 'Xbox One'],
    coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1op9.jpg',
    igdbId: 84997,
    metacritic: 89,
  },
  {
    title: 'Dave the Diver',
    slug: 'dave-the-diver',
    description:
      'Dive the Blue Hole during the day to catch fish, manage a sushi restaurant at night.',
    developer: 'MINTROCKET',
    publisher: 'MINTROCKET',
    genres: ['Adventure', 'Simulation', 'RPG'],
    platforms: ['PC', 'Switch'],
    coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co6qbp.jpg',
    igdbId: 198073,
    metacritic: 89,
  },
  {
    title: 'Sekiro: Shadows Die Twice',
    slug: 'sekiro-shadows-die-twice',
    description: 'Shinobi action in Sengoku-era Japan. Posture, deathblow, resurrection.',
    developer: 'FromSoftware',
    publisher: 'Activision',
    genres: ['Action', 'Adventure', 'Souls-like'],
    platforms: ['PC', 'PS4', 'Xbox One'],
    coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co4bx5.jpg',
    igdbId: 101204,
    metacritic: 90,
  },
  {
    title: 'Outer Wilds',
    slug: 'outer-wilds',
    description: 'An open-world mystery about a solar system trapped in an endless time loop.',
    developer: 'Mobius Digital',
    publisher: 'Annapurna Interactive',
    genres: ['Adventure', 'Exploration', 'Mystery'],
    platforms: ['PC', 'PS4', 'PS5', 'Xbox One'],
    coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co26mf.jpg',
    igdbId: 103292,
    metacritic: 85,
  },
  {
    title: 'Tunic',
    slug: 'tunic',
    description:
      'A tiny fox on a big adventure. Explore a land filled with lost legends and secret treasures.',
    developer: 'Andrew Shouldice',
    publisher: 'Finji',
    genres: ['Action', 'Adventure', 'Puzzle'],
    platforms: ['PC', 'Switch', 'PS4', 'PS5', 'Xbox One', 'Xbox Series'],
    coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co4q3t.jpg',
    igdbId: 111282,
    metacritic: 86,
  },
];

// ─── Deterministic helpers ────────────────────────────────────────────────────

/** Pick a pseudo-random element from an array given a seed offset */
function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

/** Spread a date backwards by up to `maxDaysAgo` days with a seed */
function daysAgo(seed: number, maxDaysAgo = 90): Date {
  const ms = (seed % maxDaysAgo) * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - ms - seed * 60_000);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${c.bold}🎮 Game Gauge — Activity Feed Seed Script${c.reset}`);
  console.log(`${c.dim}   Password for all seed accounts: ${SEED_PASSWORD}${c.reset}\n`);

  // ── Optional clean ──────────────────────────────────────────────────────────
  if (CLEAN) {
    log.section('Cleaning existing seed data');
    const usernames = USERS.map((u) => u.username);
    const slugs = GAMES.map((g) => g.slug);

    const users = await prisma.user.findMany({
      where: { username: { in: usernames } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);

    if (userIds.length > 0) {
      await prisma.activityEvent.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.userFollow.deleteMany({
        where: { OR: [{ followerId: { in: userIds } }, { followingId: { in: userIds } }] },
      });
      await prisma.reviewHelpful.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.review.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.rating.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.gameListItem.deleteMany({ where: { list: { userId: { in: userIds } } } });
      await prisma.gameList.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      log.ok(`Removed ${userIds.length} seed users and all their data`);
    }

    await prisma.game.deleteMany({ where: { slug: { in: slugs } } });
    log.ok(`Removed ${slugs.length} seed games`);
  }

  // ── 1. Users ────────────────────────────────────────────────────────────────
  log.section('Creating users');
  const hashedPassword = await bcrypt.hash(SEED_PASSWORD, SALT_ROUNDS);
  const createdUsers: Array<{ id: string; username: string }> = [];

  for (const u of USERS) {
    const existing = await prisma.user.findUnique({ where: { username: u.username } });
    if (existing) {
      log.skip(u.username);
      createdUsers.push({ id: existing.id, username: existing.username });
      continue;
    }

    const user = await prisma.user.create({
      data: { ...u, password: hashedPassword },
    });

    // Provision the three default lists for each user
    await prisma.gameList.createMany({
      data: [
        {
          userId: user.id,
          name: 'Wishlist',
          listType: 'wishlist',
          isDefault: true,
          isPublic: false,
        },
        {
          userId: user.id,
          name: 'Currently Playing',
          listType: 'playing',
          isDefault: true,
          isPublic: true,
        },
        {
          userId: user.id,
          name: 'Completed',
          listType: 'completed',
          isDefault: true,
          isPublic: true,
        },
      ],
    });

    createdUsers.push({ id: user.id, username: user.username });
    log.ok(`${u.username} — ${u.email}`);
  }

  const youUser = createdUsers[0];

  // ── 2. Games ────────────────────────────────────────────────────────────────
  log.section('Creating games');
  const createdGames: Array<{ id: string; title: string; slug: string }> = [];

  for (const g of GAMES) {
    // Check both slug and igdbId — either may already exist from IGDB imports
    const existing = await prisma.game.findFirst({
      where: { OR: [{ slug: g.slug }, { igdbId: g.igdbId }] },
    });
    if (existing) {
      log.skip(g.title);
      createdGames.push({ id: existing.id, title: existing.title, slug: existing.slug });
      continue;
    }

    const game = await prisma.game.create({ data: g });
    createdGames.push({ id: game.id, title: game.title, slug: game.slug });
    log.ok(g.title);
  }

  // ── 3. Follow graph ──────────────────────────────────────────────────────────
  log.section('Building follow graph');

  /**
   * Follow matrix (followerIdx → [followingIdxs])
   * You (0) follow: alex(1), morgan(2), priya(3), sam(4)
   * alex(1) follows you(0), morgan(2), jade(5)
   * morgan(2) follows you(0), priya(3), rio(6)
   * priya(3) follows sam(4), jade(5)
   * sam(4) follows you(0), rio(6)
   * jade(5) follows morgan(2), frankie(7)
   * rio(6) follows alex(1), jade(5)
   * frankie(7) follows you(0), sam(4)
   */
  const followMatrix: Array<[number, number]> = [
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [1, 0],
    [1, 2],
    [1, 5],
    [2, 0],
    [2, 3],
    [2, 6],
    [3, 4],
    [3, 5],
    [4, 0],
    [4, 6],
    [5, 2],
    [5, 7],
    [6, 1],
    [6, 5],
    [7, 0],
    [7, 4],
  ];

  let followCount = 0;
  for (const [fi, ti] of followMatrix) {
    const followerId = createdUsers[fi].id;
    const followingId = createdUsers[ti].id;

    const existing = await prisma.userFollow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });
    if (existing) continue;

    await prisma.userFollow.create({ data: { followerId, followingId } });

    // Activity event for the follow
    await prisma.activityEvent.create({
      data: {
        userId: followerId,
        type: 'FOLLOWED_USER',
        targetId: followingId,
        meta: { username: createdUsers[ti].username, avatar: null },
        createdAt: daysAgo(followCount + 1, 60),
      },
    });
    followCount++;
  }
  log.ok(`${followCount} follow relationships created`);

  // ── 4. Ratings ───────────────────────────────────────────────────────────────
  log.section('Creating ratings');

  const ratingMatrix: Array<{ userIdx: number; gameIdx: number; score: number }> = [
    // qatester rates several games
    { userIdx: 0, gameIdx: 0, score: 9 }, // Hollow Knight
    { userIdx: 0, gameIdx: 1, score: 10 }, // Hades
    { userIdx: 0, gameIdx: 3, score: 8 }, // Celeste
    { userIdx: 0, gameIdx: 5, score: 7 }, // Stardew Valley
    // alexplay
    { userIdx: 1, gameIdx: 1, score: 10 }, // Hades
    { userIdx: 1, gameIdx: 2, score: 9 }, // Elden Ring
    { userIdx: 1, gameIdx: 9, score: 8 }, // Sekiro
    { userIdx: 1, gameIdx: 4, score: 10 }, // BG3
    // morgan
    { userIdx: 2, gameIdx: 0, score: 7 },
    { userIdx: 2, gameIdx: 3, score: 7 },
    { userIdx: 2, gameIdx: 5, score: 7 },
    { userIdx: 2, gameIdx: 6, score: 8 }, // Disco Elysium
    // priya
    { userIdx: 3, gameIdx: 5, score: 10 }, // Stardew
    { userIdx: 3, gameIdx: 8, score: 9 }, // Dave the Diver
    { userIdx: 3, gameIdx: 10, score: 9 }, // Outer Wilds
    // sam
    { userIdx: 4, gameIdx: 2, score: 10 }, // Elden Ring
    { userIdx: 4, gameIdx: 9, score: 9 }, // Sekiro
    { userIdx: 4, gameIdx: 11, score: 8 }, // Tunic
    // jade
    { userIdx: 5, gameIdx: 6, score: 10 }, // Disco Elysium
    { userIdx: 5, gameIdx: 7, score: 9 }, // Obra Dinn
    { userIdx: 5, gameIdx: 4, score: 9 }, // BG3
    // rio
    { userIdx: 6, gameIdx: 1, score: 8 },
    { userIdx: 6, gameIdx: 2, score: 9 },
    // frankie
    { userIdx: 7, gameIdx: 5, score: 8 },
    { userIdx: 7, gameIdx: 0, score: 8 },
    { userIdx: 7, gameIdx: 3, score: 9 },
  ];

  let ratingCount = 0;
  for (const { userIdx, gameIdx, score } of ratingMatrix) {
    const userId = createdUsers[userIdx].id;
    const gameId = createdGames[gameIdx].id;

    const existing = await prisma.rating.findUnique({
      where: { userId_gameId: { userId, gameId } },
    });
    if (existing) continue;

    const rating = await prisma.rating.create({
      data: { userId, gameId, score, createdAt: daysAgo(ratingCount + 2, 80) },
    });

    await prisma.activityEvent.create({
      data: {
        userId,
        type: 'RATED_GAME',
        gameId,
        targetId: rating.id,
        meta: { score, gameTitle: createdGames[gameIdx].title },
        createdAt: rating.createdAt,
      },
    });
    ratingCount++;
  }
  log.ok(`${ratingCount} ratings created`);

  // ── 5. Reviews ───────────────────────────────────────────────────────────────
  log.section('Creating reviews');

  const reviewDefs: Array<{
    userIdx: number;
    gameIdx: number;
    content: string;
    spoilers: boolean;
  }> = [
    {
      userIdx: 0,
      gameIdx: 1,
      spoilers: false,
      content:
        'Hades is probably the most refined roguelike ever made. Every run feels different and the narrative integration is genius. The writing kept pulling me back long after I thought I was done. A genuine 10/10.',
    },
    {
      userIdx: 0,
      gameIdx: 0,
      spoilers: false,
      content:
        'Hollow Knight is brutally hard but always fair. The world design is incredible — every area feels distinct yet cohesive. I put 40 hours in without noticing. If you love exploration and tight controls, this is unmissable.',
    },
    {
      userIdx: 1,
      gameIdx: 2,
      spoilers: false,
      content:
        "Elden Ring is the open world game I've been waiting for. FromSoftware perfected their formula by removing the linearity. The sense of discovery exploring the Lands Between is unmatched. Ranni's questline alone is worth the price of admission.",
    },
    {
      userIdx: 1,
      gameIdx: 4,
      spoilers: false,
      content:
        "BG3 is the RPG of the decade. I've never felt this level of reactivity in a game — choices made in Act 1 echo in Act 3 in ways I didn't expect. Larian Studios deserve every award they received.",
    },
    {
      userIdx: 2,
      gameIdx: 6,
      spoilers: false,
      content:
        "Disco Elysium is a 7/10 game dressed up as a 10/10. The writing is absolutely exceptional but it is extremely slow. If you have patience for dense political philosophy in your murder mystery, it's unlike anything else.",
    },
    {
      userIdx: 3,
      gameIdx: 5,
      spoilers: false,
      content:
        "Stardew Valley saved me during a rough patch in my life. The farming loop is simple but deeply satisfying. It's the only game I've genuinely recommended to non-gamers. A perfect cosy experience.",
    },
    {
      userIdx: 3,
      gameIdx: 8,
      spoilers: false,
      content:
        "Dave the Diver is a delightful surprise. The first few hours you wonder if it's too simple, then suddenly you're 15 hours deep managing a sushi restaurant and obsessing over tuna. Totally charming.",
    },
    {
      userIdx: 4,
      gameIdx: 9,
      spoilers: false,
      content:
        "Sekiro is FromSoftware's best game mechanically. The parry system is initially punishing but once it clicks it's the most satisfying combat I've ever played. Genichiro fight is the best tutorial in gaming.",
    },
    {
      userIdx: 5,
      gameIdx: 7,
      spoilers: false,
      content:
        'Obra Dinn is a masterpiece of deductive reasoning. Nothing else asks you to piece together a tragedy from frozen moments in time. The monochrome art style is polarising but it suits the period perfectly. A must-play if you like puzzles.',
    },
    {
      userIdx: 5,
      gameIdx: 6,
      spoilers: false,
      content:
        "This game changed how I think about what games can be. The skill system as character building is one of the most creative mechanical metaphors I've encountered. Harry Du Bois is one of gaming's best protagonists.",
    },
    {
      userIdx: 7,
      gameIdx: 3,
      spoilers: false,
      content:
        'Celeste nails the difficult platformer genre by making death feel like progress rather than failure. The Assist Mode shows how accessibility can be implemented without compromising the experience.',
    },
  ];

  let reviewCount = 0;
  for (const { userIdx, gameIdx, content, spoilers } of reviewDefs) {
    const userId = createdUsers[userIdx].id;
    const gameId = createdGames[gameIdx].id;

    const existing = await prisma.review.findUnique({
      where: { userId_gameId: { userId, gameId } },
    });
    if (existing) continue;

    const review = await prisma.review.create({
      data: { userId, gameId, content, spoilers, createdAt: daysAgo(reviewCount + 3, 70) },
    });

    await prisma.activityEvent.create({
      data: {
        userId,
        type: 'REVIEWED_GAME',
        gameId,
        targetId: review.id,
        meta: {
          excerpt: content.slice(0, 150),
          gameTitle: createdGames[gameIdx].title,
          spoilers,
        },
        createdAt: review.createdAt,
      },
    });
    reviewCount++;
  }
  log.ok(`${reviewCount} reviews created`);

  // ── 6. List activity (add to list / complete / start) ────────────────────────
  log.section('Creating list activity');

  // Fetch each user's default lists
  async function getDefaultLists(userId: string) {
    const lists = await prisma.gameList.findMany({
      where: { userId, isDefault: true },
      select: { id: true, listType: true },
    });
    return Object.fromEntries(lists.map((l) => [l.listType, l.id])) as Record<string, string>;
  }

  const listActivityDefs: Array<{
    userIdx: number;
    gameIdx: number;
    listType: 'wishlist' | 'playing' | 'completed';
    completionType?: 'beaten' | '100pct' | 'abandoned';
    progressPct?: number;
  }> = [
    // qatester
    { userIdx: 0, gameIdx: 2, listType: 'playing', progressPct: 45 },
    { userIdx: 0, gameIdx: 4, listType: 'wishlist' },
    { userIdx: 0, gameIdx: 6, listType: 'wishlist' },
    { userIdx: 0, gameIdx: 1, listType: 'completed', completionType: 'beaten' },
    // alex
    { userIdx: 1, gameIdx: 4, listType: 'playing', progressPct: 70 },
    { userIdx: 1, gameIdx: 10, listType: 'wishlist' },
    { userIdx: 1, gameIdx: 2, listType: 'completed', completionType: '100pct' },
    // morgan
    { userIdx: 2, gameIdx: 5, listType: 'completed', completionType: 'beaten' },
    { userIdx: 2, gameIdx: 8, listType: 'playing', progressPct: 30 },
    { userIdx: 2, gameIdx: 11, listType: 'wishlist' },
    // priya
    { userIdx: 3, gameIdx: 10, listType: 'completed', completionType: 'beaten' },
    { userIdx: 3, gameIdx: 0, listType: 'wishlist' },
    { userIdx: 3, gameIdx: 8, listType: 'completed', completionType: 'beaten' },
    // sam
    { userIdx: 4, gameIdx: 2, listType: 'completed', completionType: 'beaten' },
    { userIdx: 4, gameIdx: 9, listType: 'completed', completionType: '100pct' },
    { userIdx: 4, gameIdx: 11, listType: 'playing', progressPct: 55 },
    // jade
    { userIdx: 5, gameIdx: 4, listType: 'playing', progressPct: 85 },
    { userIdx: 5, gameIdx: 6, listType: 'completed', completionType: 'beaten' },
    // frankie
    { userIdx: 7, gameIdx: 3, listType: 'completed', completionType: 'beaten' },
    { userIdx: 7, gameIdx: 0, listType: 'playing', progressPct: 20 },
    { userIdx: 7, gameIdx: 5, listType: 'completed', completionType: 'beaten' },
  ];

  let listItemCount = 0;
  for (const { userIdx, gameIdx, listType, completionType, progressPct } of listActivityDefs) {
    const userId = createdUsers[userIdx].id;
    const gameId = createdGames[gameIdx].id;
    const userLists = await getDefaultLists(userId);
    const listId = userLists[listType];
    if (!listId) {
      log.warn(`No ${listType} list found for ${createdUsers[userIdx].username}`);
      continue;
    }

    const existing = await prisma.gameListItem.findUnique({
      where: { listId_gameId: { listId, gameId } },
    });
    if (existing) continue;

    const completedAt = completionType ? daysAgo(listItemCount + 5, 60) : null;

    await prisma.gameListItem.create({
      data: {
        listId,
        gameId,
        order: listItemCount,
        progressPct: progressPct ?? null,
        completedAt,
        completionType: completionType ?? null,
      },
    });

    const eventType =
      listType === 'completed'
        ? 'COMPLETED_GAME'
        : listType === 'playing'
          ? 'STARTED_GAME'
          : 'ADDED_TO_LIST';

    await prisma.activityEvent.create({
      data: {
        userId,
        type: eventType,
        gameId,
        meta: {
          listType,
          gameTitle: createdGames[gameIdx].title,
          completionType: completionType ?? null,
          progressPct: progressPct ?? null,
        },
        createdAt: daysAgo(listItemCount + 4, 75),
      },
    });
    listItemCount++;
  }
  log.ok(`${listItemCount} list items created`);

  // ── 7. Custom lists ──────────────────────────────────────────────────────────
  log.section('Creating custom lists');

  const customListDefs: Array<{
    userIdx: number;
    name: string;
    description: string;
    isPublic: boolean;
    gameIdxs: number[];
  }> = [
    {
      userIdx: 1,
      name: 'FromSoftware Ranking',
      isPublic: true,
      description: "Every FS game I've played, ranked best to worst.",
      gameIdxs: [2, 9],
    },
    {
      userIdx: 5,
      name: 'Essential Indie Games',
      isPublic: true,
      description: 'The indie games everyone should play at least once.',
      gameIdxs: [0, 3, 7, 11],
    },
    {
      userIdx: 3,
      name: 'Cosy Game Night Picks',
      isPublic: true,
      description: 'Perfect for a relaxing evening.',
      gameIdxs: [5, 8],
    },
    {
      userIdx: 0,
      name: 'My GOTY Contenders',
      isPublic: true,
      description: 'Games I think deserve game of the year consideration.',
      gameIdxs: [1, 2, 4],
    },
  ];

  let customListCount = 0;
  for (const { userIdx, name, description, isPublic, gameIdxs } of customListDefs) {
    const userId = createdUsers[userIdx].id;

    const existing = await prisma.gameList.findFirst({ where: { userId, name } });
    if (existing) {
      log.skip(`${name} (${createdUsers[userIdx].username})`);
      continue;
    }

    const list = await prisma.gameList.create({
      data: { userId, name, description, isPublic, listType: 'custom', isDefault: false },
    });

    await prisma.gameListItem.createMany({
      data: gameIdxs.map((gi, order) => ({
        listId: list.id,
        gameId: createdGames[gi].id,
        order,
      })),
      skipDuplicates: true,
    });

    await prisma.activityEvent.create({
      data: {
        userId,
        type: 'CREATED_LIST',
        targetId: list.id,
        meta: { listName: name, isPublic, gameCount: gameIdxs.length },
        createdAt: daysAgo(customListCount + 10, 30),
      },
    });
    customListCount++;
    log.ok(`"${name}" by ${createdUsers[userIdx].username}`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  const totalEvents = await prisma.activityEvent.count();

  console.log(`
${c.bold}${c.green}✅ Seed complete!${c.reset}

${c.bold}Login credentials (all accounts)${c.reset}
  Password: ${c.cyan}${SEED_PASSWORD}${c.reset}

${c.bold}Your test account${c.reset}
  Email:    ${c.cyan}you@gamegauge.dev${c.reset}
  Username: ${c.cyan}qatester${c.reset}

${c.bold}What to test${c.reset}
  • Log in as ${c.cyan}qatester${c.reset} — you follow alex, morgan, priya, sam
  • Visit ${c.cyan}/feed${c.reset} — Following tab shows their ratings, reviews, and game activity
  • Visit ${c.cyan}/feed${c.reset} — All Activity tab shows everyone
  • Visit any user profile to see their Activity tab populated
  • Follow/unfollow users and watch the feed update
  • Log in as ${c.cyan}alexplay@gamegauge.dev${c.reset} for a different social graph perspective

${c.bold}Stats${c.reset}
  Users:          ${createdUsers.length}
  Games:          ${createdGames.length}
  Follows:        ${followCount}
  Ratings:        ${ratingCount}
  Reviews:        ${reviewCount}
  List items:     ${listItemCount}
  Custom lists:   ${customListCount}
  Activity events: ${totalEvents}
`);
}

main()
  .catch((err) => {
    console.error(`\n${c.red}❌ Seed failed:${c.reset}`, err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
