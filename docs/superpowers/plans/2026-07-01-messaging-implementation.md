# Internal Messaging System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an end-to-end internal messaging system — 1:1 and group conversations, message requests, game/list/review/activity share attachments, basic blocking, and real-time delivery via socket.io — covering schema, API, real-time layer, and web UI.

**Architecture:** Four new Prisma models (`Conversation`, `ConversationParticipant`, `Message`, `Block`) back a layered Express API (routes → controllers → services → repositories) matching the existing codebase. A socket.io server attached to the same HTTP process broadcasts events after REST writes succeed, so REST remains the source of truth and reconnecting clients can always resync via REST. The web app gets a dedicated `/messages` page, its own unread-badge nav icon, and a reusable "Share to..." dialog wired into existing game/list/review/activity surfaces.

**Tech Stack:** Prisma 7 + PostgreSQL (API), Express + TypeScript + socket.io (API), Next.js 16 + Tailwind + lucide-react + socket.io-client (Web), axios (Web API client), Jest (API tests)

**Spec:** `docs/superpowers/specs/2026-07-01-messaging-design.md`

---

## File Map

### API (game-gauge-api)

| Action | Path |
|--------|------|
| Modify | `prisma/schema.prisma` |
| Modify | `src/__tests__/setup.ts` |
| Create | `src/repositories/block.repository.ts` |
| Create | `src/services/block.service.ts` |
| Create | `src/__tests__/services/block.service.test.ts` |
| Create | `src/repositories/conversation.repository.ts` |
| Create | `src/services/conversation.service.ts` |
| Create | `src/__tests__/services/conversation.service.test.ts` |
| Create | `src/repositories/message.repository.ts` |
| Create | `src/services/message.service.ts` |
| Create | `src/__tests__/services/message.service.test.ts` |
| Modify | `src/services/list.service.ts` |
| Modify | `src/__tests__/services/list.service.test.ts` |
| Create | `src/validators/conversation.validator.ts` |
| Create | `src/controllers/conversation.controller.ts` |
| Create | `src/controllers/block.controller.ts` |
| Create | `src/routes/conversation.routes.ts` |
| Modify | `src/routes/user.routes.ts` |
| Modify | `src/routes/index.ts` |
| Create | `src/sockets/index.ts` |
| Modify | `src/server.ts` |
| Modify | `src/services/message.service.ts` (socket emits) |
| Modify | `src/services/conversation.service.ts` (socket emits) |
| Modify | `package.json` (add `socket.io`) |

### Web (game-gauge-web)

| Action | Path |
|--------|------|
| Modify | `package.json` (add `socket.io-client`) |
| Create | `src/lib/socket.ts` |
| Create | `src/lib/messages.ts` |
| Create | `src/lib/blocks.ts` |
| Create | `src/hooks/useSocket.ts` |
| Create | `src/hooks/useConversations.ts` |
| Create | `src/hooks/useMessages.ts` |
| Create | `src/hooks/useMessageRequests.ts` |
| Create | `src/components/messages/messages-nav-icon.tsx` |
| Modify | `src/components/layout/navbar.tsx` |
| Create | `src/components/messages/conversation-list-item.tsx` |
| Create | `src/components/messages/conversation-list.tsx` |
| Create | `src/components/messages/share-attachment-card.tsx` |
| Create | `src/components/messages/message-bubble.tsx` |
| Create | `src/components/messages/message-composer.tsx` |
| Create | `src/components/messages/new-conversation-dialog.tsx` |
| Create | `src/components/messages/requests-tab.tsx` |
| Create | `src/components/messages/message-thread.tsx` |
| Create | `src/components/messages/share-to-dialog.tsx` |
| Create | `src/app/(main)/messages/layout.tsx` |
| Create | `src/app/(main)/messages/page.tsx` |
| Create | `src/app/(main)/messages/[conversationId]/page.tsx` |
| Modify | `src/app/(main)/games/[slug]/page.tsx` |
| Modify | `src/components/reviews/review-card.tsx` |
| Modify | `src/app/(main)/lists/[id]/page.tsx` |
| Modify | `src/components/social/activity-event-card.tsx` |
| Create | `src/app/(main)/settings/privacy-tab.tsx` |
| Modify | `src/app/(main)/settings/page.tsx` |
| Modify | `src/components/profile/profile-header.tsx` |

---

## Task 1: Schema — Conversation, ConversationParticipant, Message, Block models

**Files:**
- Modify: `game-gauge-api/prisma/schema.prisma`

- [ ] **Step 1: Add the four new models**

Add to the end of `prisma/schema.prisma`, before the final closing brace of the file:

```prisma
// ──────────────────────────────────────────────────────
// Messaging
// ──────────────────────────────────────────────────────
model Conversation {
  id            String   @id @default(uuid())
  isGroup       Boolean  @default(false)
  name          String?
  creatorId     String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  lastMessageAt DateTime @default(now())

  participants ConversationParticipant[]
  messages     Message[]

  @@index([lastMessageAt])
}

model ConversationParticipant {
  id             String    @id @default(uuid())
  conversationId String
  userId         String
  status         String    @default("ACCEPTED") // ACCEPTED | PENDING | DECLINED
  hiddenAt       DateTime?
  leftAt         DateTime?
  lastReadAt     DateTime  @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([conversationId, userId])
  @@index([userId, status])
}

model Message {
  id              String    @id @default(uuid())
  conversationId  String
  senderId        String
  type            String    @default("TEXT") // TEXT | GAME_SHARE | LIST_SHARE | REVIEW_SHARE | ACTIVITY_SHARE
  content         String?   @db.Text
  gameId          String?
  listId          String?
  reviewId        String?
  activityEventId String?
  editedAt        DateTime?
  deletedAt       DateTime?
  createdAt       DateTime  @default(now())

  conversation  Conversation   @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender        User           @relation(fields: [senderId], references: [id], onDelete: Cascade)
  game          Game?          @relation(fields: [gameId], references: [id], onDelete: SetNull)
  list          GameList?      @relation(fields: [listId], references: [id], onDelete: SetNull)
  review        Review?        @relation(fields: [reviewId], references: [id], onDelete: SetNull)
  activityEvent ActivityEvent? @relation(fields: [activityEventId], references: [id], onDelete: SetNull)

  @@index([conversationId, createdAt])
}

model Block {
  id        String   @id @default(uuid())
  blockerId String
  blockedId String
  createdAt DateTime @default(now())

  blocker User @relation("Blocker", fields: [blockerId], references: [id], onDelete: Cascade)
  blocked User @relation("Blocked", fields: [blockedId], references: [id], onDelete: Cascade)

  @@unique([blockerId, blockedId])
  @@index([blockedId])
}
```

- [ ] **Step 2: Add relation fields to `User`, `Game`, `GameList`, `Review`, `ActivityEvent`**

In the `User` model, add after the `sentNotifications Notification[] @relation("NotificationActor")` line:

```prisma
  conversationParticipants ConversationParticipant[]
  messagesSent             Message[]
  blocksMade               Block[] @relation("Blocker")
  blocksReceived           Block[] @relation("Blocked")
```

In the `Game` model, add after `activityEvents ActivityEvent[]`:

```prisma
  messageShares Message[]
```

In the `GameList` model, add after `items GameListItem[]`:

```prisma
  messageShares Message[]
```

In the `Review` model, add after `helpfulVotes ReviewHelpful[]`:

```prisma
  messageShares Message[]
```

In the `ActivityEvent` model, add after `notifications Notification[]`:

```prisma
  messageShares Message[]
```

- [ ] **Step 3: Generate and run the migration**

```bash
cd game-gauge-api
npx prisma migrate dev --name add_messaging
npx prisma generate
```

Expected output: `✓ Generated Prisma Client` and a new migration file under `prisma/migrations/`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): add Conversation, Message, and Block models"
```

---

## Task 2: Test setup — mocks and fixtures for messaging models

**Files:**
- Modify: `game-gauge-api/src/__tests__/setup.ts`

- [ ] **Step 1: Add prisma mock delegates**

In `src/__tests__/setup.ts`, inside the `jest.mock('../config/database', ...)` mock object, add four new delegates after the existing `notification` block:

```ts
    conversation: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    conversationParticipant: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
    },
    message: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    block: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
```

- [ ] **Step 2: Add shared test fixtures**

At the bottom of `src/__tests__/setup.ts`, add:

```ts
// ── Messaging fixtures ─────────────────────────────────

/** A 1:1 conversation between testUser and testOtherUser */
export const testConversation = {
  id: 'test-conversation-id',
  isGroup: false,
  name: null,
  creatorId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastMessageAt: new Date(),
};

/** A group conversation created by testUser */
export const testGroupConversation = {
  id: 'test-group-conversation-id',
  isGroup: true,
  name: 'Test Group',
  creatorId: testUser.id,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastMessageAt: new Date(),
};

export const testConversationParticipant = {
  id: 'test-participant-id',
  conversationId: testConversation.id,
  userId: testUser.id,
  status: 'ACCEPTED',
  hiddenAt: null,
  leftAt: null,
  lastReadAt: new Date(),
};

export const testOtherConversationParticipant = {
  id: 'test-other-participant-id',
  conversationId: testConversation.id,
  userId: testOtherUser.id,
  status: 'ACCEPTED',
  hiddenAt: null,
  leftAt: null,
  lastReadAt: new Date(),
};

export const testMessage = {
  id: 'test-message-id',
  conversationId: testConversation.id,
  senderId: testUser.id,
  type: 'TEXT',
  content: 'Hello!',
  gameId: null,
  listId: null,
  reviewId: null,
  activityEventId: null,
  editedAt: null,
  deletedAt: null,
  createdAt: new Date(),
};

export const testBlock = {
  id: 'test-block-id',
  blockerId: testUser.id,
  blockedId: testOtherUser.id,
  createdAt: new Date(),
};
```

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/setup.ts
git commit -m "test: add messaging fixtures and prisma mocks"
```

---

## Task 3: API — block.repository.ts

**Files:**
- Create: `game-gauge-api/src/repositories/block.repository.ts`

- [ ] **Step 1: Create the repository**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add src/repositories/block.repository.ts
git commit -m "feat(messaging): add block repository"
```

---

## Task 4: API — block.service.ts (TDD)

**Files:**
- Create: `game-gauge-api/src/services/block.service.ts`
- Test: `game-gauge-api/src/__tests__/services/block.service.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd game-gauge-api
npx jest block.service.test.ts
```

Expected: FAIL — `Cannot find module '../../services/block.service'`.

- [ ] **Step 3: Implement `block.service.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest block.service.test.ts
```

Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/services/block.service.ts src/__tests__/services/block.service.test.ts
git commit -m "feat(messaging): add block service with TDD coverage"
```

---

## Task 5: API — conversation.repository.ts

**Files:**
- Create: `game-gauge-api/src/repositories/conversation.repository.ts`

- [ ] **Step 1: Create the repository**

```ts
import { prisma } from '../config/database';

const PARTICIPANT_USER_SELECT = { id: true, username: true, avatar: true } as const;

const CONVERSATION_INCLUDE = {
  participants: {
    include: { user: { select: PARTICIPANT_USER_SELECT } },
  },
} as const;

class ConversationRepository {
  async findOneOnOneBetween(userAId: string, userBId: string) {
    return prisma.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [
          { participants: { some: { userId: userAId } } },
          { participants: { some: { userId: userBId } } },
        ],
      },
    });
  }

  async create(data: {
    isGroup: boolean;
    name?: string;
    creatorId?: string;
    participants: { userId: string; status: string }[];
  }) {
    return prisma.conversation.create({
      data: {
        isGroup: data.isGroup,
        name: data.name,
        creatorId: data.creatorId,
        participants: {
          create: data.participants.map((p) => ({ userId: p.userId, status: p.status })),
        },
      },
      include: CONVERSATION_INCLUDE,
    });
  }

  async findById(id: string) {
    return prisma.conversation.findUnique({
      where: { id },
      include: CONVERSATION_INCLUDE,
    });
  }

  async findActiveConversationIdsForUser(userId: string): Promise<string[]> {
    const rows = await prisma.conversationParticipant.findMany({
      where: { userId, status: 'ACCEPTED', leftAt: null },
      select: { conversationId: true },
    });
    return rows.map((r) => r.conversationId);
  }

  async listInboxForUser(userId: string, page: number, limit: number) {
    const participants = await prisma.conversationParticipant.findMany({
      where: { userId, status: 'ACCEPTED', leftAt: null },
      include: {
        conversation: {
          include: {
            participants: {
              where: { userId: { not: userId } },
              include: { user: { select: PARTICIPANT_USER_SELECT } },
            },
            messages: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    const visible = participants.filter(
      (p) => !p.hiddenAt || p.conversation.lastMessageAt > p.hiddenAt
    );
    visible.sort(
      (a, b) => b.conversation.lastMessageAt.getTime() - a.conversation.lastMessageAt.getTime()
    );

    const total = visible.length;
    const start = (page - 1) * limit;
    const pageItems = visible.slice(start, start + limit);

    return {
      conversations: pageItems.map((p) => ({
        id: p.conversation.id,
        isGroup: p.conversation.isGroup,
        name: p.conversation.name,
        lastMessageAt: p.conversation.lastMessageAt,
        otherParticipants: p.conversation.participants.map((op) => op.user),
        lastMessage: p.conversation.messages[0] ?? null,
        unread: p.lastReadAt < p.conversation.lastMessageAt,
      })),
      total,
    };
  }

  async listRequestsForUser(userId: string) {
    const participants = await prisma.conversationParticipant.findMany({
      where: { userId, status: 'PENDING' },
      include: {
        conversation: {
          include: {
            participants: {
              where: { userId: { not: userId } },
              include: { user: { select: PARTICIPANT_USER_SELECT } },
            },
            messages: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
      orderBy: { conversation: { lastMessageAt: 'desc' } },
    });

    return participants.map((p) => ({
      id: p.conversation.id,
      isGroup: p.conversation.isGroup,
      name: p.conversation.name,
      lastMessageAt: p.conversation.lastMessageAt,
      otherParticipants: p.conversation.participants.map((op) => op.user),
      lastMessage: p.conversation.messages[0] ?? null,
    }));
  }

  async updateParticipantStatus(conversationId: string, userId: string, status: string) {
    return prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { status },
    });
  }

  async hideForUser(conversationId: string, userId: string) {
    return prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { hiddenAt: new Date() },
    });
  }

  async setLeftAt(conversationId: string, userId: string) {
    return prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { leftAt: new Date() },
    });
  }

  async rename(conversationId: string, name: string) {
    return prisma.conversation.update({ where: { id: conversationId }, data: { name } });
  }

  /** Adds a participant, or re-activates one who previously left. */
  async upsertParticipant(conversationId: string, userId: string, status: string) {
    return prisma.conversationParticipant.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      create: { conversationId, userId, status },
      update: { status, leftAt: null, hiddenAt: null },
    });
  }

  async markRead(conversationId: string, userId: string) {
    return prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    });
  }

  async countUnreadForUser(userId: string): Promise<number> {
    const participants = await prisma.conversationParticipant.findMany({
      where: { userId, status: 'ACCEPTED', leftAt: null },
      include: { conversation: { select: { lastMessageAt: true } } },
    });
    return participants.filter(
      (p) =>
        (!p.hiddenAt || p.conversation.lastMessageAt > p.hiddenAt) &&
        p.lastReadAt < p.conversation.lastMessageAt
    ).length;
  }
}

export const conversationRepository = new ConversationRepository();
```

- [ ] **Step 2: Commit**

```bash
git add src/repositories/conversation.repository.ts
git commit -m "feat(messaging): add conversation repository"
```

---

## Task 6: API — conversation.validator.ts

**Files:**
- Create: `game-gauge-api/src/validators/conversation.validator.ts`

- [ ] **Step 1: Create the validators**

```ts
import { z } from 'zod';

export const createConversationSchema = z.object({
  participantUsernames: z.array(z.string().min(1)).min(1).max(20),
  isGroup: z.boolean().default(false),
  name: z.string().min(1).max(100).optional(),
});
export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const messageTypeSchema = z.enum([
  'TEXT',
  'GAME_SHARE',
  'LIST_SHARE',
  'REVIEW_SHARE',
  'ACTIVITY_SHARE',
]);

export const sendMessageSchema = z
  .object({
    type: messageTypeSchema.default('TEXT'),
    content: z.string().min(1).max(4000).optional(),
    entityId: z.string().uuid().optional(),
  })
  .refine((data) => (data.type === 'TEXT' ? !!data.content : !!data.entityId), {
    message: 'content is required for TEXT messages; entityId is required for share messages',
  });
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const editMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});
export type EditMessageInput = z.infer<typeof editMessageSchema>;

export const renameConversationSchema = z.object({
  name: z.string().min(1).max(100),
});
export type RenameConversationInput = z.infer<typeof renameConversationSchema>;

export const messagesCursorSchema = z.object({
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type MessagesCursorQuery = z.infer<typeof messagesCursorSchema>;
```

- [ ] **Step 2: Commit**

```bash
git add src/validators/conversation.validator.ts
git commit -m "feat(messaging): add conversation and message validators"
```

---

## Task 7: API — conversation.service.ts (TDD)

**Files:**
- Create: `game-gauge-api/src/services/conversation.service.ts`
- Test: `game-gauge-api/src/__tests__/services/conversation.service.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
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

const withParticipants = (conversation: typeof testConversation) => ({
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
      (followRepository.isFollowing as jest.Mock).mockImplementation(
        (aId: string, bId: string) => Promise.resolve(bId === testOtherUser.id)
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
      (conversationRepository.findById as jest.Mock).mockResolvedValue(
        withParticipants(testConversation)
      );
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd game-gauge-api
npx jest conversation.service.test.ts
```

Expected: FAIL — `Cannot find module '../../services/conversation.service'`.

- [ ] **Step 3: Implement `conversation.service.ts`**

```ts
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
  /** Mutual follow = both users follow each other. */
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest conversation.service.test.ts
```

Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/services/conversation.service.ts src/__tests__/services/conversation.service.test.ts
git commit -m "feat(messaging): add conversation service with TDD coverage"
```

---

## Task 8: API — message.repository.ts

**Files:**
- Create: `game-gauge-api/src/repositories/message.repository.ts`

- [ ] **Step 1: Create the repository**

```ts
import { prisma } from '../config/database';

export type MessageType = 'TEXT' | 'GAME_SHARE' | 'LIST_SHARE' | 'REVIEW_SHARE' | 'ACTIVITY_SHARE';

const MESSAGE_INCLUDE = {
  sender: { select: { id: true, username: true, avatar: true } },
  game: { select: { id: true, title: true, slug: true, coverImage: true } },
  list: { select: { id: true, name: true, isPublic: true, _count: { select: { items: true } } } },
  review: {
    select: {
      id: true,
      content: true,
      game: { select: { title: true, slug: true } },
      rating: { select: { score: true } },
    },
  },
  activityEvent: {
    select: {
      id: true,
      type: true,
      meta: true,
      user: { select: { username: true } },
      game: { select: { title: true, slug: true } },
    },
  },
} as const;

class MessageRepository {
  async create(data: {
    conversationId: string;
    senderId: string;
    type: MessageType;
    content?: string;
    gameId?: string;
    listId?: string;
    reviewId?: string;
    activityEventId?: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const message = await tx.message.create({ data, include: MESSAGE_INCLUDE });
      await tx.conversation.update({
        where: { id: data.conversationId },
        data: { lastMessageAt: new Date() },
      });
      return message;
    });
  }

  async findForConversation(conversationId: string, before?: string, limit = 30) {
    return prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
      include: MESSAGE_INCLUDE,
    });
  }

  async findById(messageId: string) {
    return prisma.message.findUnique({ where: { id: messageId }, include: MESSAGE_INCLUDE });
  }

  async update(messageId: string, content: string) {
    return prisma.message.update({
      where: { id: messageId },
      data: { content, editedAt: new Date() },
      include: MESSAGE_INCLUDE,
    });
  }

  async softDelete(messageId: string) {
    return prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), content: null },
    });
  }

  async hasSharedListAccess(listId: string, userId: string): Promise<boolean> {
    const count = await prisma.message.count({
      where: {
        type: 'LIST_SHARE',
        listId,
        deletedAt: null,
        conversation: {
          participants: { some: { userId, status: 'ACCEPTED' } },
        },
      },
    });
    return count > 0;
  }
}

export const messageRepository = new MessageRepository();
```

- [ ] **Step 2: Commit**

```bash
git add src/repositories/message.repository.ts
git commit -m "feat(messaging): add message repository"
```

---

## Task 9: API — message.service.ts (TDD)

**Files:**
- Create: `game-gauge-api/src/services/message.service.ts`
- Test: `game-gauge-api/src/__tests__/services/message.service.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { MessageService } from '../../services/message.service';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../utils/errors.util';
import {
  testUser,
  testOtherUser,
  testConversation,
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
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd game-gauge-api
npx jest message.service.test.ts
```

Expected: FAIL — `Cannot find module '../../services/message.service'`.

- [ ] **Step 3: Implement `message.service.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest message.service.test.ts
```

Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/services/message.service.ts src/__tests__/services/message.service.test.ts
git commit -m "feat(messaging): add message service with TDD coverage"
```

---

## Task 10: API — private list access via shared message (TDD)

**Files:**
- Modify: `game-gauge-api/src/services/list.service.ts`
- Modify: `game-gauge-api/src/__tests__/services/list.service.test.ts`

- [ ] **Step 1: Write the failing test**

`list.service.test.ts` does not mock `listRepository` — it exercises the real repository against the raw `prisma` mock from `setup.ts` (see the existing `(prisma.gameList.findUnique as jest.Mock).mockResolvedValue(...)` calls in the `describe('findById', ...)` block). Follow that same convention: mock `prisma.message.count` directly (already added to the global mock in Task 2) rather than mocking `messageRepository` as a module.

Add these two tests inside the existing `describe('findById', ...)` block, reusing `testList` and `testLinkedUser` as the list owner (both already imported at the top of this file) with `testUser` as the requesting viewer:

```ts
    it('grants access to a private list when it was shared with the viewer in a message', async () => {
      const privateList = { ...testList, isPublic: false, userId: testLinkedUser.id };
      (prisma.gameList.findUnique as jest.Mock).mockResolvedValue(privateList);
      (prisma.message.count as jest.Mock).mockResolvedValue(1);

      const result = await listService.findById(privateList.id, testUser.id);

      expect(prisma.message.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'LIST_SHARE', listId: privateList.id }),
        })
      );
      expect(result).toEqual(privateList);
    });

    it('denies access to a private list with no share and no ownership', async () => {
      const privateList = { ...testList, isPublic: false, userId: testLinkedUser.id };
      (prisma.gameList.findUnique as jest.Mock).mockResolvedValue(privateList);
      (prisma.message.count as jest.Mock).mockResolvedValue(0);

      await expect(listService.findById(privateList.id, testUser.id)).rejects.toThrow(
        ForbiddenError
      );
    });
```

(`ForbiddenError`, `prisma`, `testUser`, `testLinkedUser`, and `testList` are already imported at the top of this test file — reuse those imports rather than duplicating them.)

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
cd game-gauge-api
npx jest list.service.test.ts -t "findById"
```

Expected: FAIL — the "grants access" test fails because `findById` currently throws `ForbiddenError` unconditionally for private, non-owned lists.

- [ ] **Step 3: Update `list.service.ts`**

In `src/services/list.service.ts`, add the import near the other repository imports at the top:

```ts
import { messageRepository } from '../repositories/message.repository';
```

Replace the existing `findById` method:

```ts
  /**
   * Get a single list by ID
   */
  async findById(listId: string, requestingUserId?: string) {
    const list = await listRepository.findById(listId, requestingUserId);
    if (!list) throw new NotFoundError('List not found');

    if (!list.isPublic && list.userId !== requestingUserId) {
      throw new ForbiddenError('This list is private');
    }

    return list;
  }
```

with:

```ts
  /**
   * Get a single list by ID. A private list is also viewable if it was
   * shared with the requesting user via a message (see message.repository's
   * hasSharedListAccess) — sharing acts as an explicit access grant.
   */
  async findById(listId: string, requestingUserId?: string) {
    const list = await listRepository.findById(listId, requestingUserId);
    if (!list) throw new NotFoundError('List not found');

    if (!list.isPublic && list.userId !== requestingUserId) {
      const hasShareAccess = requestingUserId
        ? await messageRepository.hasSharedListAccess(listId, requestingUserId)
        : false;
      if (!hasShareAccess) throw new ForbiddenError('This list is private');
    }

    return list;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest list.service.test.ts
```

Expected: PASS — all `list.service.test.ts` tests green, including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add src/services/list.service.ts src/__tests__/services/list.service.test.ts
git commit -m "feat(messaging): grant private list access via message shares"
```

---

## Task 11: API — controllers for conversations, messages, and blocking

**Files:**
- Create: `game-gauge-api/src/controllers/conversation.controller.ts`
- Create: `game-gauge-api/src/controllers/block.controller.ts`

- [ ] **Step 1: Create `conversation.controller.ts`**

```ts
import { Request, Response, NextFunction } from 'express';
import { conversationService } from '../services/conversation.service';
import { messageService } from '../services/message.service';
import { paginationSchema } from '../validators/social.validator';
import {
  createConversationSchema,
  renameConversationSchema,
  sendMessageSchema,
  editMessageSchema,
  messagesCursorSchema,
} from '../validators/conversation.validator';

export class ConversationController {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const input = createConversationSchema.parse(req.body);
      const conversation = await conversationService.createConversation(req.user.userId, input);
      res.status(201).json({ success: true, data: conversation });
    } catch (error) {
      next(error);
    }
  }

  async getInbox(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const { page, limit } = paginationSchema.parse(req.query);
      const result = await conversationService.getInbox(req.user.userId, page, limit);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getRequests(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const requests = await conversationService.getRequests(req.user.userId);
      res.status(200).json({ success: true, data: requests });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const conversation = await conversationService.getConversation(
        req.params.id,
        req.user.userId
      );
      res.status(200).json({ success: true, data: conversation });
    } catch (error) {
      next(error);
    }
  }

  async accept(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const result = await conversationService.accept(req.params.id, req.user.userId);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async decline(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const result = await conversationService.decline(req.params.id, req.user.userId);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async archiveOrLeave(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const result = await conversationService.archiveOrLeave(req.params.id, req.user.userId);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async rename(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const { name } = renameConversationSchema.parse(req.body);
      const result = await conversationService.rename(req.params.id, req.user.userId, name);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async addMember(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const result = await conversationService.addMember(
        req.params.id,
        req.user.userId,
        req.params.username
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async removeMember(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const result = await conversationService.removeMember(
        req.params.id,
        req.user.userId,
        req.params.userId
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getUnreadCount(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const count = await conversationService.getUnreadCount(req.user.userId);
      res.status(200).json({ success: true, data: { count } });
    } catch (error) {
      next(error);
    }
  }

  async getMessages(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const { before, limit } = messagesCursorSchema.parse(req.query);
      const messages = await messageService.listMessages(
        req.params.id,
        req.user.userId,
        before,
        limit
      );
      res.status(200).json({ success: true, data: messages });
    } catch (error) {
      next(error);
    }
  }

  async sendMessage(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const input = sendMessageSchema.parse(req.body);
      const message = await messageService.send(req.params.id, req.user.userId, input);
      res.status(201).json({ success: true, data: message });
    } catch (error) {
      next(error);
    }
  }

  async editMessage(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const { content } = editMessageSchema.parse(req.body);
      const message = await messageService.edit(
        req.params.id,
        req.params.messageId,
        req.user.userId,
        content
      );
      res.status(200).json({ success: true, data: message });
    } catch (error) {
      next(error);
    }
  }

  async deleteMessage(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const result = await messageService.delete(
        req.params.id,
        req.params.messageId,
        req.user.userId
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const conversationController = new ConversationController();
```

- [ ] **Step 2: Create `block.controller.ts`**

```ts
import { Request, Response, NextFunction } from 'express';
import { blockService } from '../services/block.service';

export class BlockController {
  async block(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const result = await blockService.blockUser(req.user.userId, req.params.username);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async unblock(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const result = await blockService.unblockUser(req.user.userId, req.params.username);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async listBlocked(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const blocked = await blockService.getBlockedUsers(req.user.userId);
      res.status(200).json({ success: true, data: blocked });
    } catch (error) {
      next(error);
    }
  }
}

export const blockController = new BlockController();
```

- [ ] **Step 3: Commit**

```bash
git add src/controllers/conversation.controller.ts src/controllers/block.controller.ts
git commit -m "feat(messaging): add conversation and block controllers"
```

---

## Task 12: API — routes

**Files:**
- Create: `game-gauge-api/src/routes/conversation.routes.ts`
- Modify: `game-gauge-api/src/routes/user.routes.ts`
- Modify: `game-gauge-api/src/routes/index.ts`

- [ ] **Step 1: Create `conversation.routes.ts`**

```ts
import { Router } from 'express';
import { conversationController } from '../controllers/conversation.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', conversationController.getInbox.bind(conversationController));
router.get('/requests', conversationController.getRequests.bind(conversationController));
router.get('/unread-count', conversationController.getUnreadCount.bind(conversationController));
router.post('/', conversationController.create.bind(conversationController));
router.get('/:id', conversationController.getById.bind(conversationController));
router.patch('/:id', conversationController.rename.bind(conversationController));
router.delete('/:id', conversationController.archiveOrLeave.bind(conversationController));
router.post('/:id/accept', conversationController.accept.bind(conversationController));
router.post('/:id/decline', conversationController.decline.bind(conversationController));
router.post(
  '/:id/members/:username',
  conversationController.addMember.bind(conversationController)
);
router.delete(
  '/:id/members/:userId',
  conversationController.removeMember.bind(conversationController)
);
router.get('/:id/messages', conversationController.getMessages.bind(conversationController));
router.post('/:id/messages', conversationController.sendMessage.bind(conversationController));
router.patch(
  '/:id/messages/:messageId',
  conversationController.editMessage.bind(conversationController)
);
router.delete(
  '/:id/messages/:messageId',
  conversationController.deleteMessage.bind(conversationController)
);

export default router;
```

- [ ] **Step 2: Add block routes to `user.routes.ts`**

In `src/routes/user.routes.ts`, add the import at the top:

```ts
import { blockController } from '../controllers/block.controller';
```

In the "Protected /me routes" section, add after the `router.patch('/me/username', ...)` line:

```ts
/**
 * @route   GET /api/users/me/blocks
 * @desc    List users the current user has blocked
 * @access  Private
 */
router.get('/me/blocks', authenticate, blockController.listBlocked.bind(blockController));
```

In the public routes section, add after the `router.get('/:username/reviews', ...)` line:

```ts
/**
 * @route   POST /api/users/:username/block
 * @desc    Block a user
 * @access  Private
 */
router.post('/:username/block', authenticate, blockController.block.bind(blockController));

/**
 * @route   DELETE /api/users/:username/block
 * @desc    Unblock a user
 * @access  Private
 */
router.delete('/:username/block', authenticate, blockController.unblock.bind(blockController));
```

- [ ] **Step 3: Mount conversation routes in `routes/index.ts`**

Add the import:

```ts
import conversationRoutes from './conversation.routes';
```

Add the mount, after `router.use('/notifications', notificationRoutes);`:

```ts
router.use('/conversations', conversationRoutes);
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/conversation.routes.ts src/routes/user.routes.ts src/routes/index.ts
git commit -m "feat(messaging): wire up conversation and block routes"
```

---

## Task 13: API — socket.io real-time layer

**Files:**
- Modify: `game-gauge-api/package.json` (add `socket.io`)
- Modify: `game-gauge-api/src/repositories/conversation.repository.ts` (already has `findActiveConversationIdsForUser` from Task 5)
- Create: `game-gauge-api/src/sockets/index.ts`

- [ ] **Step 1: Install socket.io**

```bash
cd game-gauge-api
npm install socket.io
```

- [ ] **Step 2: Create the socket server module**

```ts
import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { verifyToken } from '../utils/jwt.util';
import { conversationRepository } from '../repositories/conversation.repository';
import { logger } from '../utils/logger.util';

let io: SocketIOServer | null = null;

function getAllowedOrigins(): string[] {
  const fromEnv = process.env.FRONTEND_URL?.split(',').map((url) => url.trim());
  return fromEnv && fromEnv.length > 0 ? fromEnv : ['http://localhost:3001'];
}

export function initSocketServer(httpServer: HTTPServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: getAllowedOrigins(),
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) throw new Error('No token provided');
      const payload = verifyToken(token);
      socket.data.userId = payload.userId;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);

    try {
      const conversationIds = await conversationRepository.findActiveConversationIdsForUser(
        userId
      );
      conversationIds.forEach((id) => socket.join(`conversation:${id}`));
    } catch (error) {
      logger.error('Failed to join conversation rooms', error);
    }
  });

  return io;
}

export function emitToConversation(conversationId: string, event: string, payload: unknown): void {
  io?.to(`conversation:${conversationId}`).emit(event, payload);
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(`user:${userId}`).emit(event, payload);
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json src/sockets/index.ts
git commit -m "feat(messaging): add socket.io real-time layer"
```

---

## Task 14: API — wire the HTTP server to socket.io

**Files:**
- Modify: `game-gauge-api/src/server.ts`

- [ ] **Step 1: Update `server.ts`**

Replace the full contents of `src/server.ts` with:

```ts
import dotenv from 'dotenv';
import http from 'http';
import { app } from './app';
import { logger } from './utils/logger.util';
import { env } from './config/env';
import { initSocketServer } from './sockets';

// Load environment variables
dotenv.config();

const PORT = env.PORT || 3000;

const httpServer = http.createServer(app);
initSocketServer(httpServer);

const server = httpServer.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT} in ${env.NODE_ENV} mode`);
  logger.info(`📊 Database connected`);
  logger.info(`🔌 Socket.io real-time layer initialized`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  logger.error('Unhandled Rejection:', err);
  server.close(() => {
    process.exit(1);
  });
});
```

- [ ] **Step 2: Verify the server boots**

```bash
cd game-gauge-api
npm run dev
```

Expected console output includes `🚀 Server running on port 3000` and `🔌 Socket.io real-time layer initialized`. Stop with `Ctrl+C`.

- [ ] **Step 3: Commit**

```bash
git add src/server.ts
git commit -m "feat(messaging): attach socket.io to the HTTP server"
```

---

## Task 15: API — run full test suite

**Files:** none (verification only)

- [ ] **Step 1: Run the full API test suite**

```bash
cd game-gauge-api
npm test
```

Expected: all suites pass, including `block.service.test.ts`, `conversation.service.test.ts`, `message.service.test.ts`, and the updated `list.service.test.ts`.

- [ ] **Step 2: Fix any failures before proceeding**

If anything fails, re-read the relevant service/test pair from Tasks 4, 7, 9, or 10 and correct the mismatch before moving to the web tasks.

---

## Task 16: Web — install socket.io-client and create the socket hook foundation

**Files:**
- Modify: `game-gauge-web/package.json` (add `socket.io-client`)
- Create: `game-gauge-web/src/lib/socket.ts`

- [ ] **Step 1: Install socket.io-client**

```bash
cd game-gauge-web
npm install socket.io-client
```

- [ ] **Step 2: Create `src/lib/socket.ts`**

```ts
import { io, Socket } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

let sharedSocket: Socket | null = null;

/**
 * Returns a shared socket.io client for the given auth token, creating a
 * fresh connection if none exists or the previous one disconnected.
 */
export function getSocket(token: string): Socket {
  if (sharedSocket && sharedSocket.connected) return sharedSocket;
  if (sharedSocket) sharedSocket.disconnect();

  sharedSocket = io(SOCKET_URL, {
    auth: { token },
    reconnection: true,
  });
  return sharedSocket;
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json src/lib/socket.ts
git commit -m "feat(messaging): add socket.io-client singleton"
```

---

## Task 17: Web — src/lib/messages.ts

**Files:**
- Create: `game-gauge-web/src/lib/messages.ts`

- [ ] **Step 1: Create the file**

```ts
import { api } from "@/lib/api";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type MessageType = "TEXT" | "GAME_SHARE" | "LIST_SHARE" | "REVIEW_SHARE" | "ACTIVITY_SHARE";

export interface ConversationParticipantUser {
  id: string;
  username: string;
  avatar: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  content: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  sender: ConversationParticipantUser;
  game: { id: string; title: string; slug: string; coverImage: string | null } | null;
  list: { id: string; name: string; isPublic: boolean; _count: { items: number } } | null;
  review: {
    id: string;
    content: string;
    game: { title: string; slug: string };
    rating: { score: number } | null;
  } | null;
  activityEvent: {
    id: string;
    type: string;
    meta: Record<string, unknown> | null;
    user: { username: string };
    game: { title: string; slug: string } | null;
  } | null;
}

export interface ConversationSummary {
  id: string;
  isGroup: boolean;
  name: string | null;
  lastMessageAt: string;
  otherParticipants: ConversationParticipantUser[];
  lastMessage: Message | null;
  unread: boolean;
}

export interface ConversationDetail {
  id: string;
  isGroup: boolean;
  name: string | null;
  creatorId: string | null;
  participants: Array<{
    userId: string;
    status: "ACCEPTED" | "PENDING" | "DECLINED";
    user: ConversationParticipantUser;
  }>;
}

export interface UserSearchResult {
  id: string;
  username: string;
  avatar: string | null;
}

// ─── Conversations ─────────────────────────────────────────────────────────────

export async function fetchConversations(
  page = 1,
  limit = 20
): Promise<{ conversations: ConversationSummary[]; pagination: { page: number; limit: number; total: number; hasMore: boolean } }> {
  const { data } = await api.get("/conversations", { params: { page, limit } });
  return data.data;
}

export async function fetchRequests(): Promise<ConversationSummary[]> {
  const { data } = await api.get("/conversations/requests");
  return data.data;
}

export async function fetchUnreadCount(): Promise<number> {
  const { data } = await api.get("/conversations/unread-count");
  return data.data.count;
}

export async function createConversation(
  participantUsernames: string[],
  isGroup = false,
  name?: string
): Promise<ConversationDetail> {
  const { data } = await api.post("/conversations", { participantUsernames, isGroup, name });
  return data.data;
}

export async function fetchConversation(id: string): Promise<ConversationDetail> {
  const { data } = await api.get(`/conversations/${id}`);
  return data.data;
}

export async function acceptConversation(id: string): Promise<void> {
  await api.post(`/conversations/${id}/accept`);
}

export async function declineConversation(id: string): Promise<void> {
  await api.post(`/conversations/${id}/decline`);
}

export async function archiveOrLeaveConversation(id: string): Promise<void> {
  await api.delete(`/conversations/${id}`);
}

export async function renameConversation(id: string, name: string): Promise<void> {
  await api.patch(`/conversations/${id}`, { name });
}

export async function addConversationMember(id: string, username: string): Promise<void> {
  await api.post(`/conversations/${id}/members/${username}`);
}

export async function removeConversationMember(id: string, userId: string): Promise<void> {
  await api.delete(`/conversations/${id}/members/${userId}`);
}

// ─── Messages ──────────────────────────────────────────────────────────────────

export async function fetchMessages(conversationId: string, before?: string): Promise<Message[]> {
  const { data } = await api.get(`/conversations/${conversationId}/messages`, {
    params: before ? { before } : {},
  });
  return data.data;
}

export async function sendMessage(
  conversationId: string,
  input: { type: MessageType; content?: string; entityId?: string }
): Promise<Message> {
  const { data } = await api.post(`/conversations/${conversationId}/messages`, input);
  return data.data;
}

export async function editMessage(
  conversationId: string,
  messageId: string,
  content: string
): Promise<Message> {
  const { data } = await api.patch(
    `/conversations/${conversationId}/messages/${messageId}`,
    { content }
  );
  return data.data;
}

export async function deleteMessage(conversationId: string, messageId: string): Promise<void> {
  await api.delete(`/conversations/${conversationId}/messages/${messageId}`);
}

// ─── User search (for picking message recipients) ──────────────────────────────

export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  if (!query.trim()) return [];
  const { data } = await api.get("/users/search", { params: { q: query } });
  return data.data;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/messages.ts
git commit -m "feat(messaging): add messages API client and types"
```

---

## Task 18: Web — src/lib/blocks.ts

**Files:**
- Create: `game-gauge-web/src/lib/blocks.ts`

- [ ] **Step 1: Create the file**

```ts
import { api } from "@/lib/api";

export interface BlockedUser {
  id: string;
  username: string;
  avatar: string | null;
}

export async function blockUser(username: string): Promise<void> {
  await api.post(`/users/${username}/block`);
}

export async function unblockUser(username: string): Promise<void> {
  await api.delete(`/users/${username}/block`);
}

export async function fetchBlockedUsers(): Promise<BlockedUser[]> {
  const { data } = await api.get("/users/me/blocks");
  return data.data;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/blocks.ts
git commit -m "feat(messaging): add blocks API client"
```

---

## Task 19: Web — useSocket hook

**Files:**
- Create: `game-gauge-web/src/hooks/useSocket.ts`

- [ ] **Step 1: Create the hook**

```ts
"use client";

import { useEffect, useRef, useState } from "react";
import { Socket } from "socket.io-client";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/store/auth";

export function useSocket(): { socket: Socket | null; connected: boolean } {
  const token = useAuthStore((s) => s.token);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token) return;

    const socket = getSocket(token);
    socketRef.current = socket;
    setConnected(socket.connected);

    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
    };
  }, [token]);

  return { socket: socketRef.current, connected };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useSocket.ts
git commit -m "feat(messaging): add useSocket hook"
```

---

## Task 20: Web — useConversations and useMessageRequests hooks

**Files:**
- Create: `game-gauge-web/src/hooks/useConversations.ts`
- Create: `game-gauge-web/src/hooks/useMessageRequests.ts`

- [ ] **Step 1: Create `useConversations.ts`**

```ts
"use client";

import { useState, useEffect, useCallback } from "react";
import { useSocket } from "./useSocket";
import { ConversationSummary, fetchConversations, fetchUnreadCount } from "@/lib/messages";

export function useConversations() {
  const { socket } = useSocket();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const page = await fetchConversations();
      setConversations(page.conversations);
    } catch (err) {
      console.error("Failed to load conversations:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadUnread = useCallback(async () => {
    try {
      setUnreadCount(await fetchUnreadCount());
    } catch {
      // Silently ignore polling errors
    }
  }, []);

  useEffect(() => {
    void reload();
    void reloadUnread();
  }, [reload, reloadUnread]);

  // REST fallback: poll unread count every 60s in case the socket is down
  useEffect(() => {
    const intervalId = setInterval(() => void reloadUnread(), 60_000);
    return () => clearInterval(intervalId);
  }, [reloadUnread]);

  useEffect(() => {
    if (!socket) return;

    const handleUpdate = () => {
      void reload();
      void reloadUnread();
    };

    socket.on("message:new", handleUpdate);
    socket.on("conversation:new", handleUpdate);
    socket.on("conversation:updated", handleUpdate);
    socket.on("unread:update", reloadUnread);

    return () => {
      socket.off("message:new", handleUpdate);
      socket.off("conversation:new", handleUpdate);
      socket.off("conversation:updated", handleUpdate);
      socket.off("unread:update", reloadUnread);
    };
  }, [socket, reload, reloadUnread]);

  return { conversations, unreadCount, loading, reload };
}
```

- [ ] **Step 2: Create `useMessageRequests.ts`**

```ts
"use client";

import { useState, useEffect, useCallback } from "react";
import { useSocket } from "./useSocket";
import {
  ConversationSummary,
  fetchRequests,
  acceptConversation,
  declineConversation,
} from "@/lib/messages";

export function useMessageRequests() {
  const { socket } = useSocket();
  const [requests, setRequests] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRequests(await fetchRequests());
    } catch (err) {
      console.error("Failed to load message requests:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!socket) return;
    socket.on("conversation:new", reload);
    return () => void socket.off("conversation:new", reload);
  }, [socket, reload]);

  const accept = useCallback(async (id: string) => {
    await acceptConversation(id);
    setRequests((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const decline = useCallback(async (id: string) => {
    await declineConversation(id);
    setRequests((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return { requests, loading, accept, decline, reload };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useConversations.ts src/hooks/useMessageRequests.ts
git commit -m "feat(messaging): add useConversations and useMessageRequests hooks"
```

---

## Task 21: Web — useMessages hook

**Files:**
- Create: `game-gauge-web/src/hooks/useMessages.ts`

- [ ] **Step 1: Create the hook**

```ts
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSocket } from "./useSocket";
import { Message, fetchMessages } from "@/lib/messages";

export function useMessages(conversationId: string | null) {
  const { socket } = useSocket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const lastMessageIdRef = useRef<string | null>(null);

  const loadInitial = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    try {
      const page = await fetchMessages(conversationId);
      const ordered = [...page].reverse(); // API returns newest-first
      setMessages(ordered);
      lastMessageIdRef.current = ordered[ordered.length - 1]?.id ?? null;
    } catch (err) {
      console.error("Failed to load messages:", err);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  const loadOlder = useCallback(async () => {
    if (!conversationId || messages.length === 0) return;
    const older = await fetchMessages(conversationId, messages[0].id);
    setMessages((prev) => [...[...older].reverse(), ...prev]);
  }, [conversationId, messages]);

  const resync = useCallback(async () => {
    if (!conversationId || !lastMessageIdRef.current) return;
    const page = await fetchMessages(conversationId);
    setMessages((prev) => {
      const known = new Set(prev.map((m) => m.id));
      const fresh = [...page].reverse().filter((m) => !known.has(m.id));
      if (fresh.length === 0) return prev;
      lastMessageIdRef.current = fresh[fresh.length - 1].id;
      return [...prev, ...fresh];
    });
  }, [conversationId]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    if (!socket || !conversationId) return;

    const handleNew = (message: Message) => {
      if (message.conversationId !== conversationId) return;
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      lastMessageIdRef.current = message.id;
    };
    const handleEdited = (message: Message) => {
      if (message.conversationId !== conversationId) return;
      setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
    };
    const handleDeleted = ({ id }: { id: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, deletedAt: new Date().toISOString(), content: null } : m
        )
      );
    };
    const handleReconnect = () => void resync();

    socket.on("message:new", handleNew);
    socket.on("message:edited", handleEdited);
    socket.on("message:deleted", handleDeleted);
    socket.on("connect", handleReconnect);

    return () => {
      socket.off("message:new", handleNew);
      socket.off("message:edited", handleEdited);
      socket.off("message:deleted", handleDeleted);
      socket.off("connect", handleReconnect);
    };
  }, [socket, conversationId, resync]);

  return { messages, loading, loadOlder };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useMessages.ts
git commit -m "feat(messaging): add useMessages hook with reconnect resync"
```

---

## Task 22: Web — MessagesNavIcon and navbar wiring

**Files:**
- Create: `game-gauge-web/src/components/messages/messages-nav-icon.tsx`
- Modify: `game-gauge-web/src/components/layout/navbar.tsx`

- [ ] **Step 1: Create the nav icon**

```tsx
"use client";

import Link from "next/link";
import { Send } from "lucide-react";
import { useConversations } from "@/hooks/useConversations";

export function MessagesNavIcon() {
  const { unreadCount } = useConversations();
  const badgeLabel = unreadCount > 9 ? "9+" : unreadCount.toString();

  return (
    <Link
      href="/messages"
      aria-label={`Messages${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      className="relative p-2 rounded-md text-foreground/70 hover:text-foreground hover:bg-foreground/5 transition-colors"
    >
      <Send className="h-5 w-5" />
      {unreadCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none pointer-events-none"
        >
          {badgeLabel}
        </span>
      )}
    </Link>
  );
}
```

- [ ] **Step 2: Wire it into the navbar**

In `src/components/layout/navbar.tsx`, add the import after the `NotificationBell` import:

```tsx
import { MessagesNavIcon } from "@/components/messages/messages-nav-icon";
```

Find this line:

```tsx
{/* Notification bell — authenticated only */}
{isAuthenticated && user && <NotificationBell />}
```

Replace it with:

```tsx
{/* Notification bell + messages — authenticated only */}
{isAuthenticated && user && (
  <>
    <NotificationBell />
    <MessagesNavIcon />
  </>
)}
```

- [ ] **Step 3: Start dev server and verify visually**

```bash
cd game-gauge-web
npm run dev
```

- Open the app in a browser while authenticated
- Confirm the paper-plane icon appears in the navbar next to the notification bell
- Confirm clicking it navigates to `/messages` (the page won't exist until Task 31 — a 404 here is expected for now)

- [ ] **Step 4: Commit**

```bash
git add src/components/messages/messages-nav-icon.tsx src/components/layout/navbar.tsx
git commit -m "feat(messaging): add MessagesNavIcon to navbar"
```

---

## Task 23: Web — ConversationList and ConversationListItem

**Files:**
- Create: `game-gauge-web/src/components/messages/conversation-list-item.tsx`
- Create: `game-gauge-web/src/components/messages/conversation-list.tsx`
- Create: `game-gauge-web/src/components/messages/requests-tab.tsx`
- Create: `game-gauge-web/src/components/messages/new-conversation-dialog.tsx`

- [ ] **Step 1: Create `conversation-list-item.tsx`**

```tsx
"use client";

import { ConversationSummary } from "@/lib/messages";

function conversationTitle(conversation: ConversationSummary): string {
  if (conversation.isGroup) return conversation.name || "Unnamed group";
  return conversation.otherParticipants[0]?.username ?? "Unknown user";
}

function messagePreview(conversation: ConversationSummary): string {
  const message = conversation.lastMessage;
  if (!message) return "No messages yet";
  if (message.deletedAt) return "Message deleted";
  switch (message.type) {
    case "TEXT":
      return message.content ?? "";
    case "GAME_SHARE":
      return `Shared a game${message.game ? `: ${message.game.title}` : ""}`;
    case "LIST_SHARE":
      return `Shared a list${message.list ? `: ${message.list.name}` : ""}`;
    case "REVIEW_SHARE":
      return "Shared a review";
    case "ACTIVITY_SHARE":
      return "Shared an activity";
    default:
      return "";
  }
}

interface ConversationListItemProps {
  conversation: ConversationSummary;
  active: boolean;
  onClick: () => void;
}

export function ConversationListItem({ conversation, active, onClick }: ConversationListItemProps) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left px-4 py-3 border-b border-border transition-colors
        ${active ? "bg-brand-purple/10" : "hover:bg-foreground/5"}
      `}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-sm truncate ${conversation.unread ? "font-semibold text-foreground" : "text-foreground/80"}`}
        >
          {conversationTitle(conversation)}
        </span>
        {conversation.unread && (
          <span className="h-2 w-2 rounded-full bg-brand-amber shrink-0" aria-hidden="true" />
        )}
      </div>
      <p className="text-xs text-foreground/50 truncate mt-0.5">{messagePreview(conversation)}</p>
    </button>
  );
}
```

- [ ] **Step 2: Create `requests-tab.tsx`**

```tsx
"use client";

import { useMessageRequests } from "@/hooks/useMessageRequests";

interface RequestsTabProps {
  onAccepted: (conversationId: string) => void;
}

export function RequestsTab({ onAccepted }: RequestsTabProps) {
  const { requests, loading, accept, decline } = useMessageRequests();

  if (loading && requests.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 rounded-full border-2 border-brand-purple/20 border-t-brand-purple animate-spin" />
      </div>
    );
  }

  if (requests.length === 0) {
    return <p className="text-sm text-foreground/40 text-center py-12 px-4">No pending requests</p>;
  }

  return (
    <div>
      {requests.map((request) => (
        <div key={request.id} className="px-4 py-3 border-b border-border">
          <p className="text-sm text-foreground mb-2">
            {request.isGroup
              ? `Group invite: ${request.name || "Unnamed group"}`
              : (request.otherParticipants[0]?.username ?? "Unknown user")}
          </p>
          <div className="flex gap-2 text-xs">
            <button
              onClick={() => void accept(request.id).then(() => onAccepted(request.id))}
              className="px-3 py-1 rounded-md bg-brand-purple text-foreground font-medium"
            >
              Accept
            </button>
            <button
              onClick={() => void decline(request.id)}
              className="px-3 py-1 rounded-md text-foreground/50 hover:text-foreground/80"
            >
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create `new-conversation-dialog.tsx`**

```tsx
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, X } from "lucide-react";
import { searchUsers, createConversation, UserSearchResult } from "@/lib/messages";
import { toast } from "sonner";

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (conversationId: string) => void;
}

export function NewConversationDialog({ open, onOpenChange, onCreated }: NewConversationDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [selected, setSelected] = useState<UserSearchResult[]>([]);
  const [groupName, setGroupName] = useState("");
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleSearch = async (value: string) => {
    setQuery(value);
    if (!value.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const users = await searchUsers(value);
      setResults(users.filter((u) => !selected.some((s) => s.id === u.id)));
    } finally {
      setSearching(false);
    }
  };

  const addUser = (user: UserSearchResult) => {
    setSelected((prev) => [...prev, user]);
    setResults((prev) => prev.filter((u) => u.id !== user.id));
    setQuery("");
  };

  const removeUser = (userId: string) => {
    setSelected((prev) => prev.filter((u) => u.id !== userId));
  };

  const handleCreate = async () => {
    if (selected.length === 0) return;
    setCreating(true);
    try {
      const isGroup = selected.length > 1;
      const conversation = await createConversation(
        selected.map((u) => u.username),
        isGroup,
        isGroup ? groupName.trim() || undefined : undefined
      );
      onOpenChange(false);
      setSelected([]);
      setGroupName("");
      onCreated(conversation.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start conversation");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((user) => (
                <span
                  key={user.id}
                  className="flex items-center gap-1 bg-brand-purple/15 text-xs rounded-full px-2.5 py-1"
                >
                  {user.username}
                  <button onClick={() => removeUser(user.id)} aria-label={`Remove ${user.username}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {selected.length > 1 && (
            <Input
              placeholder="Group name (optional)"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          )}

          <Input
            placeholder="Search by username..."
            value={query}
            onChange={(e) => void handleSearch(e.target.value)}
          />

          <div className="max-h-48 overflow-y-auto space-y-1">
            {searching && <p className="text-xs text-foreground/40 px-1">Searching...</p>}
            {results.map((user) => (
              <button
                key={user.id}
                onClick={() => addUser(user)}
                className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md text-sm hover:bg-foreground/5"
              >
                {user.username}
              </button>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => void handleCreate()} disabled={selected.length === 0 || creating}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Create `conversation-list.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useConversations } from "@/hooks/useConversations";
import { ConversationListItem } from "./conversation-list-item";
import { RequestsTab } from "./requests-tab";
import { NewConversationDialog } from "./new-conversation-dialog";

interface ConversationListProps {
  activeConversationId: string | null;
  onSelect: (conversationId: string) => void;
}

export function ConversationList({ activeConversationId, onSelect }: ConversationListProps) {
  const { conversations, loading, reload } = useConversations();
  const [tab, setTab] = useState<"inbox" | "requests">("inbox");
  const [newConversationOpen, setNewConversationOpen] = useState(false);

  return (
    <div className="flex flex-col h-full border-r border-border">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex gap-1">
          <button
            onClick={() => setTab("inbox")}
            className={`px-2.5 py-1 rounded-md text-sm transition-colors ${tab === "inbox" ? "bg-brand-purple/15 text-foreground" : "text-foreground/50 hover:text-foreground/80"}`}
          >
            Inbox
          </button>
          <button
            onClick={() => setTab("requests")}
            className={`px-2.5 py-1 rounded-md text-sm transition-colors ${tab === "requests" ? "bg-brand-purple/15 text-foreground" : "text-foreground/50 hover:text-foreground/80"}`}
          >
            Requests
          </button>
        </div>
        <button
          onClick={() => setNewConversationOpen(true)}
          aria-label="New conversation"
          className="p-1.5 rounded-md text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "inbox" ? (
          loading && conversations.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 rounded-full border-2 border-brand-purple/20 border-t-brand-purple animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-sm text-foreground/40 text-center py-12 px-4">
              No conversations yet — start one with the + button above.
            </p>
          ) : (
            conversations.map((conversation) => (
              <ConversationListItem
                key={conversation.id}
                conversation={conversation}
                active={conversation.id === activeConversationId}
                onClick={() => onSelect(conversation.id)}
              />
            ))
          )
        ) : (
          <RequestsTab
            onAccepted={(id) => {
              void reload();
              onSelect(id);
            }}
          />
        )}
      </div>

      <NewConversationDialog
        open={newConversationOpen}
        onOpenChange={setNewConversationOpen}
        onCreated={(id) => {
          void reload();
          onSelect(id);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/messages/conversation-list-item.tsx src/components/messages/requests-tab.tsx src/components/messages/new-conversation-dialog.tsx src/components/messages/conversation-list.tsx
git commit -m "feat(messaging): add conversation list, requests tab, and new-conversation dialog"
```

---

## Task 24: Web — ShareAttachmentCard, MessageBubble, MessageComposer

**Files:**
- Create: `game-gauge-web/src/components/messages/share-attachment-card.tsx`
- Create: `game-gauge-web/src/components/messages/message-bubble.tsx`
- Create: `game-gauge-web/src/components/messages/message-composer.tsx`

- [ ] **Step 1: Create `share-attachment-card.tsx`**

```tsx
"use client";

import Link from "next/link";
import { Gamepad2, ListIcon, Star, Activity } from "lucide-react";
import { Message } from "@/lib/messages";

const CARD_CLASS =
  "flex items-center gap-3 rounded-lg border border-border bg-foreground/[0.03] px-3 py-2.5 max-w-xs hover:bg-foreground/[0.06] transition-colors";

export function ShareAttachmentCard({ message }: { message: Message }) {
  if (message.type === "GAME_SHARE" && message.game) {
    return (
      <Link href={`/games/${message.game.slug}`} className={CARD_CLASS}>
        <Gamepad2 className="h-5 w-5 text-brand-purple shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{message.game.title}</p>
          <p className="text-xs text-foreground/50">Game</p>
        </div>
      </Link>
    );
  }

  if (message.type === "LIST_SHARE" && message.list) {
    return (
      <Link href={`/lists/${message.list.id}`} className={CARD_CLASS}>
        <ListIcon className="h-5 w-5 text-brand-amber shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{message.list.name}</p>
          <p className="text-xs text-foreground/50">{message.list._count.items} games</p>
        </div>
      </Link>
    );
  }

  if (message.type === "REVIEW_SHARE" && message.review) {
    return (
      <Link href={`/games/${message.review.game.slug}?tab=reviews`} className={CARD_CLASS}>
        <Star className="h-5 w-5 text-brand-pink shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{message.review.game.title}</p>
          <p className="text-xs text-foreground/50 truncate">{message.review.content}</p>
        </div>
      </Link>
    );
  }

  if (message.type === "ACTIVITY_SHARE" && message.activityEvent) {
    return (
      <Link
        href={message.activityEvent.game ? `/games/${message.activityEvent.game.slug}` : "/feed"}
        className={CARD_CLASS}
      >
        <Activity className="h-5 w-5 text-brand-purple shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {message.activityEvent.user.username}&apos;s activity
          </p>
          <p className="text-xs text-foreground/50 truncate">{message.activityEvent.game?.title ?? ""}</p>
        </div>
      </Link>
    );
  }

  return <p className="text-sm text-foreground/40 italic">Shared content unavailable</p>;
}
```

- [ ] **Step 2: Create `message-bubble.tsx`**

```tsx
"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Message } from "@/lib/messages";
import { ShareAttachmentCard } from "./share-attachment-card";
import { useAuthStore } from "@/store/auth";

interface MessageBubbleProps {
  message: Message;
  onEdit: (messageId: string, content: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
}

export function MessageBubble({ message, onEdit, onDelete }: MessageBubbleProps) {
  const { user } = useAuthStore();
  const isOwn = user?.id === message.senderId;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content ?? "");
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSaveEdit = async () => {
    if (!draft.trim()) return;
    await onEdit(message.id, draft.trim());
    setEditing(false);
  };

  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"} group`}>
      <div className={`flex items-end gap-1.5 max-w-[75%] ${isOwn ? "flex-row-reverse" : ""}`}>
        <div>
          {message.type !== "TEXT" ? (
            <ShareAttachmentCard message={message} />
          ) : editing ? (
            <div className="flex flex-col gap-1.5">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="text-sm rounded-lg border border-brand-purple/40 bg-background px-3 py-2 outline-none resize-none"
                rows={2}
              />
              <div className="flex gap-2 text-xs">
                <button onClick={() => void handleSaveEdit()} className="text-brand-purple font-medium">
                  Save
                </button>
                <button onClick={() => setEditing(false)} className="text-foreground/40">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`
                rounded-lg px-3 py-2 text-sm
                ${
                  message.deletedAt
                    ? "italic text-foreground/40 bg-foreground/[0.03]"
                    : isOwn
                      ? "bg-brand-purple text-foreground"
                      : "bg-foreground/[0.06] text-foreground"
                }
              `}
            >
              {message.deletedAt ? "Message deleted" : message.content}
              {message.editedAt && !message.deletedAt && (
                <span className="text-[10px] opacity-60 ml-1.5">(edited)</span>
              )}
            </div>
          )}
        </div>

        {isOwn && !message.deletedAt && message.type === "TEXT" && !editing && (
          <div className="relative opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="Message options"
              className="p-1 rounded text-foreground/40 hover:text-foreground/70"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
            {menuOpen && (
              <div className="absolute bottom-full mb-1 right-0 bg-background border border-border rounded-md shadow-lg py-1 text-xs whitespace-nowrap z-10">
                <button
                  onClick={() => {
                    setEditing(true);
                    setMenuOpen(false);
                  }}
                  className="block w-full text-left px-3 py-1.5 hover:bg-foreground/5"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    void onDelete(message.id);
                    setMenuOpen(false);
                  }}
                  className="block w-full text-left px-3 py-1.5 text-brand-red hover:bg-brand-red/5"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `message-composer.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Send } from "lucide-react";

interface MessageComposerProps {
  onSend: (content: string) => Promise<void>;
}

export function MessageComposer({ onSend }: MessageComposerProps) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || sending) return;

    setSending(true);
    try {
      await onSend(trimmed);
      setContent("");
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-border px-4 py-3 shrink-0">
      <input
        type="text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Message..."
        maxLength={4000}
        className="flex-1 bg-foreground/[0.04] border border-border rounded-full px-4 py-2 text-sm outline-none focus:border-brand-purple/50 transition-colors"
      />
      <button
        type="submit"
        disabled={!content.trim() || sending}
        aria-label="Send message"
        className="p-2 rounded-full bg-brand-purple text-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-brand-purple/80 transition-colors"
      >
        <Send className="h-4 w-4" />
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/messages/share-attachment-card.tsx src/components/messages/message-bubble.tsx src/components/messages/message-composer.tsx
git commit -m "feat(messaging): add share cards, message bubble, and composer"
```

---

## Task 25: Web — MessageThread

**Files:**
- Create: `game-gauge-web/src/components/messages/message-thread.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useMessages } from "@/hooks/useMessages";
import { MessageBubble } from "./message-bubble";
import { MessageComposer } from "./message-composer";
import { sendMessage, editMessage, deleteMessage } from "@/lib/messages";
import { toast } from "sonner";

interface MessageThreadProps {
  conversationId: string;
  title: string;
}

export function MessageThread({ conversationId, title }: MessageThreadProps) {
  const { messages, loading } = useMessages(conversationId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = async (content: string) => {
    try {
      await sendMessage(conversationId, { type: "TEXT", content });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send message");
    }
  };

  const handleEdit = async (messageId: string, content: string) => {
    try {
      await editMessage(conversationId, messageId, content);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to edit message");
    }
  };

  const handleDelete = async (messageId: string) => {
    try {
      await deleteMessage(conversationId, messageId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete message");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading && messages.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 rounded-full border-2 border-brand-purple/20 border-t-brand-purple animate-spin" />
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} onEdit={handleEdit} onDelete={handleDelete} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <MessageComposer onSend={handleSend} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/messages/message-thread.tsx
git commit -m "feat(messaging): add MessageThread component"
```

---

## Task 26: Web — /messages pages

**Files:**
- Create: `game-gauge-web/src/app/(main)/messages/layout.tsx`
- Create: `game-gauge-web/src/app/(main)/messages/page.tsx`
- Create: `game-gauge-web/src/app/(main)/messages/[conversationId]/page.tsx`

- [ ] **Step 1: Create the layout**

```tsx
"use client";

import { useRouter, useParams } from "next/navigation";
import { MainLayout } from "@/components/layout/main-layout";
import { ConversationList } from "@/components/messages/conversation-list";

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams<{ conversationId?: string }>();
  const activeConversationId = params?.conversationId ?? null;

  return (
    <MainLayout>
      <div className="flex h-[calc(100vh-3.5rem)]">
        <div className="w-full max-w-xs shrink-0 hidden sm:block">
          <ConversationList
            activeConversationId={activeConversationId}
            onSelect={(id) => router.push(`/messages/${id}`)}
          />
        </div>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </MainLayout>
  );
}
```

- [ ] **Step 2: Create the empty-state index page**

```tsx
export default function MessagesIndexPage() {
  return (
    <div className="flex items-center justify-center h-full text-sm text-foreground/40">
      Select a conversation to start chatting
    </div>
  );
}
```

- [ ] **Step 3: Create the conversation page**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fetchConversation, ConversationDetail } from "@/lib/messages";
import { MessageThread } from "@/components/messages/message-thread";
import { useAuthStore } from "@/store/auth";

export default function ConversationPage() {
  const params = useParams<{ conversationId: string }>();
  const { user } = useAuthStore();
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);

  useEffect(() => {
    void fetchConversation(params.conversationId).then(setConversation);
  }, [params.conversationId]);

  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-6 w-6 rounded-full border-2 border-brand-purple/20 border-t-brand-purple animate-spin" />
      </div>
    );
  }

  const title = conversation.isGroup
    ? conversation.name || "Unnamed group"
    : (conversation.participants.find((p) => p.userId !== user?.id)?.user.username ?? "Conversation");

  return <MessageThread conversationId={conversation.id} title={title} />;
}
```

- [ ] **Step 4: Verify in browser with two accounts**

```bash
cd game-gauge-web
npm run dev
```

- Log in as one user in a normal browser window and a second user in an incognito window
- From the first user, click the messages icon, click "+", search for the second user's username, and start a conversation
- If the two accounts don't mutually follow each other, confirm the conversation appears under "Requests" for the second user, and under the main inbox for the first
- Accept the request as the second user and confirm it moves into their inbox
- Send a text message from each side and confirm it appears in near-real-time in the other browser window without a manual refresh
- Confirm the unread badge on the messages nav icon updates

- [ ] **Step 5: Commit**

```bash
git add "src/app/(main)/messages"
git commit -m "feat(messaging): add /messages pages"
```

---

## Task 27: Web — ShareToDialog

**Files:**
- Create: `game-gauge-web/src/components/messages/share-to-dialog.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { searchUsers, createConversation, sendMessage, MessageType, UserSearchResult } from "@/lib/messages";
import { toast } from "sonner";

interface ShareToDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: MessageType;
  entityId: string;
}

export function ShareToDialog({ open, onOpenChange, type, entityId }: ShareToDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  const handleSearch = async (value: string) => {
    setQuery(value);
    setResults(value.trim() ? await searchUsers(value) : []);
  };

  const handleSend = async (user: UserSearchResult) => {
    setSendingTo(user.id);
    try {
      const conversation = await createConversation([user.username], false);
      await sendMessage(conversation.id, { type, entityId });
      toast.success(`Shared with ${user.username}`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to share");
    } finally {
      setSendingTo(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send to...</DialogTitle>
        </DialogHeader>

        <Input
          placeholder="Search by username..."
          value={query}
          onChange={(e) => void handleSearch(e.target.value)}
        />

        <div className="max-h-56 overflow-y-auto space-y-1 py-2">
          {results.map((user) => (
            <button
              key={user.id}
              onClick={() => void handleSend(user)}
              disabled={sendingTo !== null}
              className="flex items-center justify-between w-full text-left px-2 py-2 rounded-md text-sm hover:bg-foreground/5 disabled:opacity-50"
            >
              {user.username}
              {sendingTo === user.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/messages/share-to-dialog.tsx
git commit -m "feat(messaging): add ShareToDialog component"
```

---

## Task 28: Web — wire Share into the game detail page

**Files:**
- Modify: `game-gauge-web/src/app/(main)/games/[slug]/page.tsx`

- [ ] **Step 1: Add imports**

Add `Share2` to the existing `lucide-react` import used for icons like `ListPlus`/`Pencil` (find that import line and add `Share2` to it). Add a new import below the other component imports (near `import { AddToListDialog } from "@/components/lists/add-to-list-dialog";`):

```tsx
import { ShareToDialog } from "@/components/messages/share-to-dialog";
```

- [ ] **Step 2: Add dialog state**

Find this line (around line 365):

```tsx
const [showWriteReviewDialog, setShowWriteReviewDialog] = useState(false);
```

Add immediately after it:

```tsx
const [showShareDialog, setShowShareDialog] = useState(false);
```

- [ ] **Step 3: Add the Share action button**

Find this block (around line 776):

```tsx
{isAuthenticated && (
  <ActionButton onClick={() => setShowWriteReviewDialog(true)} icon={<Pencil className="h-4 w-4" />} label="Write a review" />
)}
```

Add immediately after it:

```tsx
{isAuthenticated && (
  <ActionButton onClick={() => setShowShareDialog(true)} icon={<Share2 className="h-4 w-4" />} label="Share" />
)}
```

- [ ] **Step 4: Render the dialog**

Find the `<WriteReviewDialog ... />` block inside the `{/* ── Dialogs ── */}` section (around line 850) and add the `ShareToDialog` immediately after its closing tag, before `</MainLayout>`:

```tsx
<ShareToDialog
  type="GAME_SHARE"
  entityId={game.id}
  open={showShareDialog}
  onOpenChange={setShowShareDialog}
/>
```

- [ ] **Step 5: Verify in browser**

```bash
cd game-gauge-web
npm run dev
```

- Open a game detail page while authenticated
- Confirm a "Share" button appears in the sidebar action list
- Click it, search for a user, click their name, and confirm a toast confirms the share and the recipient receives a `GAME_SHARE` message

- [ ] **Step 6: Commit**

```bash
git add "src/app/(main)/games/[slug]/page.tsx"
git commit -m "feat(messaging): wire Share into game detail page"
```

---

## Task 29: Web — wire Share into review cards

**Files:**
- Modify: `game-gauge-web/src/components/reviews/review-card.tsx`

- [ ] **Step 1: Add imports**

In `src/components/reviews/review-card.tsx`, add `Share2` to the existing lucide-react import:

```tsx
import { Star, ThumbsUp, Edit, Trash2, EyeOff, Eye, MoreHorizontal, Share2 } from "lucide-react";
```

Add a new import below it:

```tsx
import { ShareToDialog } from "@/components/messages/share-to-dialog";
```

- [ ] **Step 2: Add dialog state**

Find this line near the top of the component body:

```tsx
const [showSpoilers, setShowSpoilers] = useState(false);
```

Add immediately after it:

```tsx
const [showShareDialog, setShowShareDialog] = useState(false);
```

- [ ] **Step 3: Add a Share button visible to any viewer**

Find the header's right-side action area:

```tsx
        <div className="flex items-center gap-2 shrink-0">
          {/* Score badge */}
          {score && (
```

Insert a Share button just before the `{/* Owner menu */}` comment (which sits after the score badge block), so it's visible regardless of ownership:

```tsx
          {/* Share */}
          <button
            onClick={() => setShowShareDialog(true)}
            aria-label="Share this review"
            className="text-foreground/25 hover:text-foreground/60 transition-colors p-0.5"
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>
```

- [ ] **Step 4: Render the dialog**

At the very end of the component, immediately before the final closing `</div>` of the returned JSX (right after the helpful-votes footer block), add:

```tsx
      <ShareToDialog
        type="REVIEW_SHARE"
        entityId={review.id}
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
      />
```

- [ ] **Step 5: Verify in browser**

- Open a game's reviews tab
- Confirm a small share icon appears on every review card (not just your own)
- Click it, share with a user, and confirm the recipient gets a `REVIEW_SHARE` message rendering the review excerpt

- [ ] **Step 6: Commit**

```bash
git add src/components/reviews/review-card.tsx
git commit -m "feat(messaging): wire Share into review cards"
```

---

## Task 30: Web — wire Share into list detail page

**Files:**
- Modify: `game-gauge-web/src/app/(main)/lists/[id]/page.tsx`

- [ ] **Step 1: Add imports**

Add `Share2` to the existing lucide-react icon import used near `Edit`/`Trash2`/`Plus`. Add a new import below `import { ListToolbar } from "@/components/lists/list-toolbar";`:

```tsx
import { ShareToDialog } from "@/components/messages/share-to-dialog";
```

- [ ] **Step 2: Add dialog state**

Find:

```tsx
const [showSteamImport, setShowSteamImport] = useState(false);
```

Add immediately after it:

```tsx
const [showShareDialog, setShowShareDialog] = useState(false);
```

- [ ] **Step 3: Add a Share button visible to any viewer**

Find the header actions container:

```tsx
          <div className="flex items-center gap-2 shrink-0">
            {showSteamImportButton && (
```

Insert a Share button right after the opening `<div className="flex items-center gap-2 shrink-0">` line, before the `showSteamImportButton` block, so it's visible to owners and viewers of public lists alike:

```tsx
            <button
              onClick={() => setShowShareDialog(true)}
              className="p-2 rounded-lg border border-brand-purple/20 hover:border-brand-purple/40 text-foreground/40 hover:text-foreground transition-colors"
              aria-label="Share this list"
            >
              <Share2 className="h-4 w-4" />
            </button>
```

- [ ] **Step 4: Render the dialog**

Find the `{/* ── Dialogs ── */}` section and add after the last dialog (`<SteamWishlistImportDialog ... />`):

```tsx
        <ShareToDialog
          type="LIST_SHARE"
          entityId={list.id}
          open={showShareDialog}
          onOpenChange={setShowShareDialog}
        />
```

- [ ] **Step 5: Verify in browser**

- Open one of your own private lists
- Click Share, send it to a user
- Log in as that user and confirm they can open the shared private list (previously would have been forbidden) by clicking the `LIST_SHARE` card in their inbox

- [ ] **Step 6: Commit**

```bash
git add "src/app/(main)/lists/[id]/page.tsx"
git commit -m "feat(messaging): wire Share into list detail page"
```

---

## Task 31: Web — wire Share into activity feed items

**Files:**
- Modify: `game-gauge-web/src/components/social/activity-event-card.tsx`

- [ ] **Step 1: Add imports**

Add `useState` from React at the top of the file (it currently has no React hook imports):

```tsx
import { useState } from "react";
```

Add `Share2` to the existing lucide-react icon import list. Add a new import below `import { EventInteractions } from "@/components/social/event-interactions";`:

```tsx
import { ShareToDialog } from "@/components/messages/share-to-dialog";
```

- [ ] **Step 2: Add dialog state**

Inside the `ActivityEventCard` function body, add before the `return (` statement:

```tsx
  const [showShareDialog, setShowShareDialog] = useState(false);
```

- [ ] **Step 3: Add a Share button next to EventInteractions**

Find:

```tsx
          {/* Likes + comments */}
          <EventInteractions
            eventId={event.id}
            initialLikeCount={event.likeCount ?? 0}
            initialCommentCount={event.commentCount ?? 0}
            initialHasLiked={event.hasLiked ?? false}
          />
        </div>
```

Replace with:

```tsx
          {/* Likes + comments + share */}
          <div className="flex items-center gap-3">
            <EventInteractions
              eventId={event.id}
              initialLikeCount={event.likeCount ?? 0}
              initialCommentCount={event.commentCount ?? 0}
              initialHasLiked={event.hasLiked ?? false}
            />
            <button
              onClick={() => setShowShareDialog(true)}
              aria-label="Share this activity"
              className="text-foreground/30 hover:text-foreground/60 transition-colors"
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
```

- [ ] **Step 4: Render the dialog**

Find the closing `</article>` tag at the end of the component and add immediately before it:

```tsx
      <ShareToDialog
        type="ACTIVITY_SHARE"
        entityId={event.id}
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
      />
```

- [ ] **Step 5: Verify in browser**

- Open the activity feed
- Confirm a share icon appears next to the like/comment controls on each event
- Share an event with a user and confirm the recipient sees an `ACTIVITY_SHARE` card

- [ ] **Step 6: Commit**

```bash
git add src/components/social/activity-event-card.tsx
git commit -m "feat(messaging): wire Share into activity feed items"
```

---

## Task 32: Web — Blocking UI (Privacy settings tab)

**Files:**
- Create: `game-gauge-web/src/app/(main)/settings/privacy-tab.tsx`
- Modify: `game-gauge-web/src/app/(main)/settings/page.tsx`

- [ ] **Step 1: Create the Privacy settings tab**

```tsx
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, UserX } from "lucide-react";
import { fetchBlockedUsers, unblockUser, BlockedUser } from "@/lib/blocks";
import { toast } from "sonner";

export default function PrivacySettingsTab() {
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  useEffect(() => {
    fetchBlockedUsers()
      .then(setBlockedUsers)
      .catch(() => toast.error("Failed to load blocked users"))
      .finally(() => setLoading(false));
  }, []);

  const handleUnblock = async (user: BlockedUser) => {
    setUnblockingId(user.id);
    try {
      await unblockUser(user.username);
      setBlockedUsers((prev) => prev.filter((u) => u.id !== user.id));
      toast.success(`Unblocked ${user.username}`);
    } catch {
      toast.error("Failed to unblock user");
    } finally {
      setUnblockingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Blocked Users</CardTitle>
        <CardDescription>
          Blocked users cannot message you, and any existing conversation with them is hidden.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : blockedUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground">You haven&apos;t blocked anyone.</p>
        ) : (
          <div className="space-y-2">
            {blockedUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <span className="text-sm font-medium">{user.username}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleUnblock(user)}
                  disabled={unblockingId === user.id}
                >
                  {unblockingId === user.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <UserX className="mr-1.5 h-3.5 w-3.5" />
                      Unblock
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire the tab into the settings page**

In `src/app/(main)/settings/page.tsx`, add the import after `import SecuritySettingsTab from "@/app/(main)/settings/security-tab"`:

```tsx
import PrivacySettingsTab from "@/app/(main)/settings/privacy-tab";
```

Change the `TabsList` from two columns to three and add the new trigger. Replace:

```tsx
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              <span className="hidden sm:inline">Security</span>
            </TabsTrigger>
          </TabsList>
```

with:

```tsx
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              <span className="hidden sm:inline">Security</span>
            </TabsTrigger>
            <TabsTrigger value="privacy" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Privacy</span>
            </TabsTrigger>
          </TabsList>
```

(`Shield` is already imported from `lucide-react` at the top of this file but currently unused — this makes use of it.)

Add the new `TabsContent` after the Security tab's:

```tsx
          {/* Privacy Tab */}
          <TabsContent value="privacy" className="mt-6">
            <PrivacySettingsTab />
          </TabsContent>
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/(main)/settings/page.tsx" "src/app/(main)/settings/privacy-tab.tsx"
git commit -m "feat(messaging): add Privacy settings tab for managing blocked users"
```

---

## Task 33: Web — wire the Block trigger into the user profile page

**Files:**
- Modify: `game-gauge-web/src/components/profile/profile-header.tsx`

Task 32 lets a user unblock someone, but nothing yet lets them block someone in the first place. This task adds a "Block user" action next to the `FollowButton` on another user's profile.

- [ ] **Step 1: Add imports**

In `src/components/profile/profile-header.tsx`, replace:

```tsx
import { Settings, Calendar } from "lucide-react";
import { FollowButton } from "@/components/social/follow-button";
```

with:

```tsx
"use client";

import { useState } from "react";
import { Settings, Calendar, MoreHorizontal, Ban } from "lucide-react";
import { FollowButton } from "@/components/social/follow-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { blockUser } from "@/lib/blocks";
import { toast } from "sonner";
```

(Note: this file did not previously need `"use client"` — verify it isn't already a client component from an ancestor; if `"use client"` is already present at the top of the file, don't duplicate it, just add the rest of the imports below it.)

- [ ] **Step 2: Add block-handling state**

Inside the `ProfileHeader` function, add before the `return (` statement:

```tsx
  const [isBlocking, setIsBlocking] = useState(false);

  const handleBlock = async () => {
    setIsBlocking(true);
    try {
      await blockUser(profile.username);
      toast.success(`Blocked ${profile.username}`);
    } catch {
      toast.error("Failed to block user");
    } finally {
      setIsBlocking(false);
    }
  };
```

- [ ] **Step 3: Add the kebab menu next to FollowButton**

Replace:

```tsx
          ) : (
            <FollowButton
              username={profile.username}
              initialIsFollowing={isFollowing}
              initialFollowerCount={followerCount}
              size="sm"
            />
          )}
```

with:

```tsx
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <FollowButton
                username={profile.username}
                initialIsFollowing={isFollowing}
                initialFollowerCount={followerCount}
                size="sm"
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="More options"
                    disabled={isBlocking}
                    className="p-2 rounded-lg border border-brand-purple/20 hover:border-brand-purple/40 text-foreground/40 hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-background border-brand-purple/20">
                  <DropdownMenuItem
                    onClick={() => void handleBlock()}
                    className="cursor-pointer gap-2 text-brand-red focus:text-brand-red focus:bg-brand-red/5"
                  >
                    <Ban className="h-3.5 w-3.5" />
                    Block user
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
```

- [ ] **Step 4: Verify in browser**

- Open another user's profile
- Confirm a kebab menu appears next to the Follow button
- Click it, click "Block user", confirm a success toast
- Confirm that user now appears in Settings → Privacy → Blocked Users
- Confirm that user can no longer start a new conversation with you, and any existing 1:1 conversation with them disappears from your inbox

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/profile-header.tsx
git commit -m "feat(messaging): add Block user action to profile page"
```

---

## Final verification

- [ ] Run the full API test suite: `cd game-gauge-api && npm test` — confirm all suites pass
- [ ] Run the web build to catch type errors: `cd game-gauge-web && npm run build`
- [ ] Two-browser manual walkthrough:
  - [ ] Non-mutual-follow user A messages user B — lands in B's Requests tab
  - [ ] B accepts — conversation appears in both inboxes, further messages deliver in real time
  - [ ] Mutual-follow users message each other — lands directly in both inboxes, no request step
  - [ ] A shares a game, a public list, a private list, a review, and an activity event — each renders as the correct preview card for B
  - [ ] B opens the shared private list and can view it despite not owning it
  - [ ] A edits a sent text message — B sees the update live, with an "(edited)" marker
  - [ ] A deletes a sent message — B sees "Message deleted" live
  - [ ] A archives the 1:1 conversation — it disappears from A's inbox; B messages again — it reappears for A
  - [ ] A creates a group with B and a third user who doesn't follow A — the third user sees it as a request while B (mutual follow) sees it directly
  - [ ] Group creator renames the group and removes a member — both changes reflect live for remaining members
  - [ ] A blocks B — the 1:1 conversation disappears from both inboxes and B's send attempts fail
  - [ ] A unblocks B — the conversation and its history reappear
  - [ ] Disconnect network briefly on B's tab mid-conversation, reconnect, and confirm any messages sent during the gap appear via resync
  - [ ] Messages nav icon badge updates live and via the 60s REST fallback when the socket is manually disconnected (e.g. via devtools)
