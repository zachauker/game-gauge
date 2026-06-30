# Notifications System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an end-to-end in-app notification system covering schema, API, service integrations, and web UI so users are alerted when someone follows them, likes their activity, or comments on it.

**Architecture:** A `Notification` model in Postgres stores typed notification records with actor and optional event references. A lightweight service layer handles creation (fire-and-forget from follow/interaction services) and querying. The web UI polls for unread count every 60 seconds and renders a drawer on demand.

**Tech Stack:** Prisma 7 + PostgreSQL (API), Express + TypeScript (API), Next.js 14 + Tailwind + lucide-react (Web), axios (Web API client), Jest (API tests)

---

## File Map

### API (game-gauge-api)
| Action | Path |
|--------|------|
| Modify | `prisma/schema.prisma` |
| Create | `src/repositories/notification.repository.ts` |
| Create | `src/services/notification.service.ts` |
| Create | `src/controllers/notification.controller.ts` |
| Create | `src/routes/notification.routes.ts` |
| Modify | `src/routes/index.ts` |
| Modify | `src/services/follow.service.ts` |
| Modify | `src/services/interaction.service.ts` |
| Modify | `src/__tests__/setup.ts` |
| Create | `src/__tests__/services/notification.service.test.ts` |
| Modify | `src/__tests__/services/interaction.service.test.ts` |

### Web (game-gauge-web)
| Action | Path |
|--------|------|
| Create | `src/lib/notifications.ts` |
| Create | `src/hooks/useNotifications.ts` |
| Create | `src/components/layout/notification-row.tsx` |
| Create | `src/components/layout/notification-drawer.tsx` |
| Create | `src/components/layout/notification-bell.tsx` |
| Modify | `src/components/layout/navbar.tsx` |

---

## Task 1: Schema — Add Notification model

**Files:**
- Modify: `game-gauge-api/prisma/schema.prisma`

- [ ] **Step 1: Add the Notification model and relation fields**

Add to the end of `prisma/schema.prisma`, before the final closing brace:

```prisma
// ──────────────────────────────────────────────────────
// Notifications
// ──────────────────────────────────────────────────────
model Notification {
  id        String   @id @default(uuid())
  userId    String
  actorId   String
  type      String   // FOLLOWED_YOU | LIKED_EVENT | COMMENTED_EVENT
  eventId   String?
  read      Boolean  @default(false)
  createdAt DateTime @default(now())

  user  User           @relation("NotificationRecipient", fields: [userId], references: [id], onDelete: Cascade)
  actor User           @relation("NotificationActor", fields: [actorId], references: [id], onDelete: Cascade)
  event ActivityEvent? @relation(fields: [eventId], references: [id], onDelete: SetNull)

  @@index([userId, read, createdAt])
  @@index([actorId])
  @@index([eventId])
}
```

In the `User` model, add after the `activities ActivityEvent[]` line:

```prisma
  notifications      Notification[] @relation("NotificationRecipient")
  sentNotifications  Notification[] @relation("NotificationActor")
```

In the `ActivityEvent` model, add after `eventComments EventComment[]`:

```prisma
  notifications Notification[]
```

- [ ] **Step 2: Generate and run the migration**

```bash
cd game-gauge-api
npx prisma migrate dev --name add_notifications
npx prisma generate
```

Expected output: `✓ Generated Prisma Client` and a new migration file in `prisma/migrations/`.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): add Notification model with actor/event relations"
```

---

## Task 2: Update test setup for new mocks

**Files:**
- Modify: `game-gauge-api/src/__tests__/setup.ts`

The existing prisma mock is missing `notification` and `activityEvent.findUnique`. Both are needed for upcoming tests.

- [ ] **Step 1: Add `notification` and `activityEvent.findUnique` to the prisma mock**

In `src/__tests__/setup.ts`, find the mock object inside `jest.mock('../config/database', ...)` and make these two additions:

Add `findUnique` to the existing `activityEvent` mock block:

```ts
activityEvent: {
  create: jest.fn(),
  findMany: jest.fn(),
  findUnique: jest.fn(),   // ← add this line
  count: jest.fn(),
  deleteMany: jest.fn(),
},
```

Add a new `notification` entry after the `activityEvent` block:

```ts
notification: {
  create: jest.fn(),
  findMany: jest.fn(),
  count: jest.fn(),
  updateMany: jest.fn(),
},
```

Also add a shared test fixture at the bottom of `setup.ts`:

```ts
export const testNotification = {
  id: 'test-notification-id',
  userId: testOtherUser.id,
  actorId: testUser.id,
  type: 'LIKED_EVENT',
  eventId: testActivityEvent.id,
  read: false,
  createdAt: new Date(),
};
```

- [ ] **Step 2: Verify existing tests still pass**

```bash
cd game-gauge-api
npm test
```

Expected: all tests pass (the new mock entries are additive and don't break existing mocks).

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/setup.ts
git commit -m "test(setup): add notification mock and activityEvent.findUnique mock"
```

---

## Task 3: Notification repository

**Files:**
- Create: `game-gauge-api/src/repositories/notification.repository.ts`

- [ ] **Step 1: Create the repository**

```ts
import { prisma } from '../config/database';

export interface NotificationWithRelations {
  id: string;
  type: string;
  read: boolean;
  createdAt: Date;
  actor: { id: string; username: string; avatar: string | null };
  event: {
    id: string;
    type: string;
    meta: Record<string, unknown> | null;
    game: { title: string; slug: string } | null;
  } | null;
}

const NOTIFICATION_INCLUDE = {
  actor: { select: { id: true, username: true, avatar: true } },
  event: {
    select: {
      id: true,
      type: true,
      meta: true,
      game: { select: { title: true, slug: true } },
    },
  },
} as const;

class NotificationRepository {
  async create(data: {
    userId: string;
    actorId: string;
    type: string;
    eventId?: string;
  }): Promise<void> {
    await prisma.notification.create({ data });
  }

  async findForUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ notifications: NotificationWithRelations[]; total: number }> {
    const skip = (page - 1) * limit;
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: NOTIFICATION_INCLUDE,
      }),
      prisma.notification.count({ where: { userId } }),
    ]);
    return { notifications: notifications as NotificationWithRelations[], total };
  }

  async countUnread(userId: string): Promise<number> {
    return prisma.notification.count({ where: { userId, read: false } });
  }

  async markRead(notificationId: string, userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }
}

export const notificationRepository = new NotificationRepository();
```

- [ ] **Step 2: Commit**

```bash
git add src/repositories/notification.repository.ts
git commit -m "feat(repo): add NotificationRepository"
```

---

## Task 4: Notification service — tests first, then implementation

**Files:**
- Create: `game-gauge-api/src/__tests__/services/notification.service.test.ts`
- Create: `game-gauge-api/src/services/notification.service.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/services/notification.service.test.ts`:

```ts
import { NotificationService } from '../../services/notification.service';
import { testUser, testOtherUser, testNotification } from '../setup';

jest.mock('../../repositories/notification.repository', () => ({
  notificationRepository: {
    create: jest.fn(),
    findForUser: jest.fn(),
    countUnread: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
  },
}));

import { notificationRepository } from '../../repositories/notification.repository';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    service = new NotificationService();
  });

  describe('create', () => {
    it('creates a notification when actor and recipient differ', async () => {
      (notificationRepository.create as jest.Mock).mockResolvedValue(undefined);

      await service.create({
        userId: testOtherUser.id,
        actorId: testUser.id,
        type: 'LIKED_EVENT',
        eventId: 'some-event-id',
      });

      expect(notificationRepository.create).toHaveBeenCalledWith({
        userId: testOtherUser.id,
        actorId: testUser.id,
        type: 'LIKED_EVENT',
        eventId: 'some-event-id',
      });
    });

    it('does NOT create a notification when actor equals recipient', async () => {
      await service.create({
        userId: testUser.id,
        actorId: testUser.id,
        type: 'LIKED_EVENT',
        eventId: 'some-event-id',
      });

      expect(notificationRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('getForUser', () => {
    it('returns paginated notifications with pagination metadata', async () => {
      const mockData = {
        notifications: [testNotification],
        total: 1,
      };
      (notificationRepository.findForUser as jest.Mock).mockResolvedValue(mockData);

      const result = await service.getForUser(testUser.id, 1, 20);

      expect(notificationRepository.findForUser).toHaveBeenCalledWith(testUser.id, 1, 20);
      expect(result.notifications).toHaveLength(1);
      expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1 });
    });
  });

  describe('countUnread', () => {
    it('returns the unread notification count', async () => {
      (notificationRepository.countUnread as jest.Mock).mockResolvedValue(5);

      const result = await service.countUnread(testUser.id);

      expect(notificationRepository.countUnread).toHaveBeenCalledWith(testUser.id);
      expect(result).toBe(5);
    });
  });

  describe('markRead', () => {
    it('delegates to the repository', async () => {
      (notificationRepository.markRead as jest.Mock).mockResolvedValue(undefined);

      await service.markRead(testNotification.id, testUser.id);

      expect(notificationRepository.markRead).toHaveBeenCalledWith(
        testNotification.id,
        testUser.id
      );
    });
  });

  describe('markAllRead', () => {
    it('delegates to the repository', async () => {
      (notificationRepository.markAllRead as jest.Mock).mockResolvedValue(undefined);

      await service.markAllRead(testUser.id);

      expect(notificationRepository.markAllRead).toHaveBeenCalledWith(testUser.id);
    });
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd game-gauge-api
npm test -- --testPathPattern="notification.service" --no-coverage
```

Expected: FAIL with `Cannot find module '../../services/notification.service'`

- [ ] **Step 3: Implement the service**

Create `src/services/notification.service.ts`:

```ts
import { notificationRepository } from '../repositories/notification.repository';

interface CreateNotificationInput {
  userId: string;
  actorId: string;
  type: string;
  eventId?: string;
}

export class NotificationService {
  async create(data: CreateNotificationInput): Promise<void> {
    if (data.userId === data.actorId) return;
    await notificationRepository.create(data);
  }

  async getForUser(userId: string, page: number, limit: number) {
    const { notifications, total } = await notificationRepository.findForUser(userId, page, limit);
    return {
      notifications,
      pagination: { page, limit, total },
    };
  }

  async countUnread(userId: string): Promise<number> {
    return notificationRepository.countUnread(userId);
  }

  async markRead(notificationId: string, userId: string): Promise<void> {
    await notificationRepository.markRead(notificationId, userId);
  }

  async markAllRead(userId: string): Promise<void> {
    await notificationRepository.markAllRead(userId);
  }
}

export const notificationService = new NotificationService();
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- --testPathPattern="notification.service" --no-coverage
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/services/notification.service.test.ts src/services/notification.service.ts
git commit -m "feat(notifications): notification service with self-notification guard"
```

---

## Task 5: Notification controller and routes

**Files:**
- Create: `game-gauge-api/src/controllers/notification.controller.ts`
- Create: `game-gauge-api/src/routes/notification.routes.ts`
- Modify: `game-gauge-api/src/routes/index.ts`

- [ ] **Step 1: Create the controller**

Create `src/controllers/notification.controller.ts`:

```ts
import { Request, Response, NextFunction } from 'express';
import { notificationService } from '../services/notification.service';
import { paginationSchema } from '../validators/social.validator';

export class NotificationController {
  async getNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const { page, limit } = paginationSchema.parse(req.query);
      const result = await notificationService.getForUser(req.user.userId, page, limit);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getUnreadCount(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const count = await notificationService.countUnread(req.user.userId);
      res.status(200).json({ success: true, data: { count } });
    } catch (error) {
      next(error);
    }
  }

  async markRead(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      await notificationService.markRead(req.params.id, req.user.userId);
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  async markAllRead(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      await notificationService.markAllRead(req.user.userId);
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  }
}

export const notificationController = new NotificationController();
```

- [ ] **Step 2: Create the routes file**

Create `src/routes/notification.routes.ts`:

```ts
import { Router } from 'express';
import { notificationController } from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticate, notificationController.getNotifications.bind(notificationController));
router.get('/unread-count', authenticate, notificationController.getUnreadCount.bind(notificationController));
router.patch('/read-all', authenticate, notificationController.markAllRead.bind(notificationController));
router.patch('/:id/read', authenticate, notificationController.markRead.bind(notificationController));

export default router;
```

- [ ] **Step 3: Register the routes in index.ts**

In `src/routes/index.ts`, add the import after the existing feed import:

```ts
import notificationRoutes from './notification.routes';
```

Add the mount after the feed mount:

```ts
router.use('/notifications', notificationRoutes);
```

- [ ] **Step 4: Run all tests**

```bash
npm test --no-coverage
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/controllers/notification.controller.ts src/routes/notification.routes.ts src/routes/index.ts
git commit -m "feat(notifications): controller and routes for notifications API"
```

---

## Task 6: Fix interaction service to return event from requireEvent

The `requireEvent` private method currently uses `prisma.activityEvent.count` and returns `void`. We need it to return the event object so we can read `userId` for notifications. This task updates the method and fixes the existing tests.

**Files:**
- Modify: `game-gauge-api/src/services/interaction.service.ts`
- Modify: `game-gauge-api/src/__tests__/services/interaction.service.test.ts`

- [ ] **Step 1: Update `requireEvent` in interaction.service.ts**

Find this private method:

```ts
private async requireEvent(eventId: string) {
  const count = await prisma.activityEvent.count({ where: { id: eventId } });
  if (!count) throw new NotFoundError('Activity event not found');
}
```

Replace it with:

```ts
private async requireEvent(eventId: string) {
  const event = await prisma.activityEvent.findUnique({ where: { id: eventId } });
  if (!event) throw new NotFoundError('Activity event not found');
  return event;
}
```

- [ ] **Step 2: Update interaction service tests to use findUnique**

In `src/__tests__/services/interaction.service.test.ts`, find every occurrence of:

```ts
(prisma.activityEvent.count as jest.Mock).mockResolvedValue(1);
```

Replace each with:

```ts
(prisma.activityEvent.findUnique as jest.Mock).mockResolvedValue(testActivityEvent);
```

Find every occurrence of:

```ts
(prisma.activityEvent.count as jest.Mock).mockResolvedValue(0);
```

Replace each with:

```ts
(prisma.activityEvent.findUnique as jest.Mock).mockResolvedValue(null);
```

- [ ] **Step 3: Run interaction service tests**

```bash
npm test -- --testPathPattern="interaction.service" --no-coverage
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/services/interaction.service.ts src/__tests__/services/interaction.service.test.ts
git commit -m "refactor(interaction): requireEvent returns full event object"
```

---

## Task 7: Wire notifications into interaction.service.ts

**Files:**
- Modify: `game-gauge-api/src/services/interaction.service.ts`

- [ ] **Step 1: Add notificationService import**

At the top of `src/services/interaction.service.ts`, add after the existing imports:

```ts
import { notificationService } from './notification.service';
```

- [ ] **Step 2: Fire LIKED_EVENT notification in toggleReaction**

In `toggleReaction`, the method currently reads:

```ts
async toggleReaction(userId: string, eventId: string) {
  await this.requireEvent(eventId);

  const already = await interactionRepository.hasReacted(userId, eventId);

  if (already) {
    await interactionRepository.removeReaction(userId, eventId);
  } else {
    await interactionRepository.addReaction(userId, eventId);
  }

  const count = await interactionRepository.getReactionCount(eventId);
  return { liked: !already, likeCount: count };
}
```

Replace with:

```ts
async toggleReaction(userId: string, eventId: string) {
  const event = await this.requireEvent(eventId);

  const already = await interactionRepository.hasReacted(userId, eventId);

  if (already) {
    await interactionRepository.removeReaction(userId, eventId);
  } else {
    await interactionRepository.addReaction(userId, eventId);
    notificationService.create({
      userId: event.userId,
      actorId: userId,
      type: 'LIKED_EVENT',
      eventId,
    }).catch(() => {});
  }

  const count = await interactionRepository.getReactionCount(eventId);
  return { liked: !already, likeCount: count };
}
```

- [ ] **Step 3: Fire COMMENTED_EVENT notification in addComment**

The `addComment` method currently reads:

```ts
async addComment(userId: string, eventId: string, content: string) {
  const trimmed = content.trim();
  if (!trimmed) throw new ValidationError('Comment cannot be empty');
  if (trimmed.length > 500) throw new ValidationError('Comment must be 500 characters or fewer');

  await this.requireEvent(eventId);

  const comment = await interactionRepository.addComment(userId, eventId, trimmed);
  const count = await interactionRepository.getCommentCount(eventId);
  return { comment, commentCount: count };
}
```

Replace with:

```ts
async addComment(userId: string, eventId: string, content: string) {
  const trimmed = content.trim();
  if (!trimmed) throw new ValidationError('Comment cannot be empty');
  if (trimmed.length > 500) throw new ValidationError('Comment must be 500 characters or fewer');

  const event = await this.requireEvent(eventId);

  const comment = await interactionRepository.addComment(userId, eventId, trimmed);
  const count = await interactionRepository.getCommentCount(eventId);

  notificationService.create({
    userId: event.userId,
    actorId: userId,
    type: 'COMMENTED_EVENT',
    eventId,
  }).catch(() => {});

  return { comment, commentCount: count };
}
```

- [ ] **Step 4: Run all tests**

```bash
npm test --no-coverage
```

Expected: all tests pass. The notification calls are fire-and-forget so they don't require new mocks in existing tests (the mock returns `undefined` by default for `notificationService.create`).

**Note:** If Jest complains about the `notificationService` import not being mocked, add to the top of `interaction.service.test.ts`:

```ts
jest.mock('../../services/notification.service', () => ({
  notificationService: { create: jest.fn().mockResolvedValue(undefined) },
}));
```

- [ ] **Step 5: Commit**

```bash
git add src/services/interaction.service.ts
git commit -m "feat(notifications): fire LIKED_EVENT and COMMENTED_EVENT notifications"
```

---

## Task 8: Wire FOLLOWED_YOU notification into follow.service.ts

**Files:**
- Modify: `game-gauge-api/src/services/follow.service.ts`

- [ ] **Step 1: Add notificationService import**

At the top of `src/services/follow.service.ts`, add after the existing imports:

```ts
import { notificationService } from './notification.service';
```

- [ ] **Step 2: Fire notification after follow**

In `followUser`, find the block after `await followRepository.follow(followerId, target.id)`:

```ts
await followRepository.follow(followerId, target.id);

// Record activity event (fire-and-forget)
await activityService.recordEvent(followerId, ActivityType.FOLLOWED_USER, {
  targetId: target.id,
  meta: { username: target.username, avatar: target.avatar },
});
```

Replace with:

```ts
await followRepository.follow(followerId, target.id);

// Record activity event (fire-and-forget)
activityService.recordEvent(followerId, ActivityType.FOLLOWED_USER, {
  targetId: target.id,
  meta: { username: target.username, avatar: target.avatar },
}).catch(() => {});

// Notify the followed user (fire-and-forget)
notificationService.create({
  userId: target.id,
  actorId: followerId,
  type: 'FOLLOWED_YOU',
}).catch(() => {});
```

- [ ] **Step 3: Run all tests**

```bash
npm test --no-coverage
```

Expected: all tests pass. If the follow service test complains about `notificationService`, add this mock at the top of `src/__tests__/services/follow.service.test.ts`:

```ts
jest.mock('../../services/notification.service', () => ({
  notificationService: { create: jest.fn().mockResolvedValue(undefined) },
}));
```

- [ ] **Step 4: Commit**

```bash
git add src/services/follow.service.ts
git commit -m "feat(notifications): fire FOLLOWED_YOU notification on follow"
```

---

## Task 9: Web — notification types and API helpers

**Files:**
- Create: `game-gauge-web/src/lib/notifications.ts`

- [ ] **Step 1: Create the lib file**

```ts
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationType = 'FOLLOWED_YOU' | 'LIKED_EVENT' | 'COMMENTED_EVENT';

export interface NotificationActor {
  id: string;
  username: string;
  avatar: string | null;
}

export interface NotificationEvent {
  id: string;
  type: string;
  meta: Record<string, unknown> | null;
  game: { title: string; slug: string } | null;
}

export interface Notification {
  id: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
  actor: NotificationActor;
  event: NotificationEvent | null;
}

export interface NotificationPage {
  notifications: Notification[];
  pagination: { page: number; limit: number; total: number };
}

// ─── API helpers ──────────────────────────────────────────────────────────────

export async function fetchNotifications(page = 1, limit = 20): Promise<NotificationPage> {
  const res = await api.get<{ success: true; data: NotificationPage }>('/notifications', {
    params: { page, limit },
  });
  return res.data.data;
}

export async function fetchUnreadCount(): Promise<number> {
  const res = await api.get<{ success: true; data: { count: number } }>(
    '/notifications/unread-count'
  );
  return res.data.data.count;
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.patch(`/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.patch('/notifications/read-all');
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export function getNotificationText(n: Notification): string {
  const actor = n.actor.username;
  switch (n.type) {
    case 'FOLLOWED_YOU':
      return `${actor} followed you`;
    case 'LIKED_EVENT': {
      const gameTitle = n.event?.game?.title;
      return gameTitle ? `${actor} liked your activity on ${gameTitle}` : `${actor} liked your activity`;
    }
    case 'COMMENTED_EVENT': {
      const gameTitle = n.event?.game?.title;
      return gameTitle ? `${actor} commented on your activity on ${gameTitle}` : `${actor} commented on your activity`;
    }
  }
}

export function getNotificationLink(n: Notification): string {
  switch (n.type) {
    case 'FOLLOWED_YOU':
      return `/users/${n.actor.username}`;
    case 'LIKED_EVENT':
    case 'COMMENTED_EVENT': {
      const slug = n.event?.game?.slug;
      return slug ? `/games/${slug}` : '/feed';
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd game-gauge-web
git add src/lib/notifications.ts
git commit -m "feat(notifications): notification types and API helpers"
```

---

## Task 10: Web — useNotifications hook

**Files:**
- Create: `game-gauge-web/src/hooks/useNotifications.ts`

- [ ] **Step 1: Create the hook**

```ts
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@/store/auth';
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  type Notification,
  type NotificationPage,
} from '@/lib/notifications';

const POLL_INTERVAL_MS = 60_000;

export function useNotifications() {
  const { isAuthenticated } = useAuthStore();
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState<NotificationPage | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const count = await fetchUnreadCount();
      setUnreadCount(count);
    } catch {
      // silent — polling failure shouldn't surface to UI
    }
  }, [isAuthenticated]);

  // Poll for unread count
  useEffect(() => {
    if (!isAuthenticated) return;

    refreshUnreadCount();
    intervalRef.current = setInterval(refreshUnreadCount, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isAuthenticated, refreshUnreadCount]);

  const loadNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoadingPage(true);
    try {
      const data = await fetchNotifications(1, 20);
      setPage(data);
    } finally {
      setIsLoadingPage(false);
    }
  }, [isAuthenticated]);

  const markRead = useCallback(
    async (id: string) => {
      await markNotificationRead(id);
      setUnreadCount((c) => Math.max(0, c - 1));
      setPage((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          notifications: prev.notifications.map((n: Notification) =>
            n.id === id ? { ...n, read: true } : n
          ),
        };
      });
    },
    [],
  );

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead();
    setUnreadCount(0);
    setPage((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        notifications: prev.notifications.map((n: Notification) => ({ ...n, read: true })),
      };
    });
  }, []);

  return {
    unreadCount,
    notifications: page?.notifications ?? [],
    isLoadingPage,
    loadNotifications,
    markRead,
    markAllRead,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useNotifications.ts
git commit -m "feat(notifications): useNotifications hook with polling"
```

---

## Task 11: Web — NotificationRow component

**Files:**
- Create: `game-gauge-web/src/components/layout/notification-row.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getNotificationText, getNotificationLink, type Notification } from '@/lib/notifications';
import { formatDistanceToNow } from 'date-fns';

interface NotificationRowProps {
  notification: Notification;
  onRead: (id: string) => void;
}

export function NotificationRow({ notification, onRead }: NotificationRowProps) {
  const router = useRouter();
  const { actor, read, createdAt } = notification;

  const handleClick = async () => {
    if (!read) await onRead(notification.id);
    router.push(getNotificationLink(notification));
  };

  const initials = actor.username.substring(0, 2).toUpperCase();
  const timeAgo = formatDistanceToNow(new Date(createdAt), { addSuffix: true });

  return (
    <button
      onClick={handleClick}
      className={`
        w-full flex items-start gap-3 px-4 py-3 text-left transition-colors
        hover:bg-brand-purple/5
        ${!read ? 'border-l-2 border-brand-purple' : 'border-l-2 border-transparent'}
      `}
    >
      <Avatar className="h-8 w-8 shrink-0 mt-0.5">
        <AvatarImage src={actor.avatar ?? undefined} alt={actor.username} />
        <AvatarFallback className="bg-brand-purple/20 text-[11px] font-medium">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-foreground/80 leading-snug">
          {getNotificationText(notification)}
        </p>
        <p className="text-[11px] text-foreground/40 mt-0.5">{timeAgo}</p>
      </div>

      {!read && (
        <div className="h-1.5 w-1.5 rounded-full bg-brand-purple mt-1.5 shrink-0" />
      )}
    </button>
  );
}
```

- [ ] **Step 2: Install date-fns if not present**

```bash
grep "date-fns" package.json || npm install date-fns
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/notification-row.tsx
git commit -m "feat(notifications): NotificationRow component"
```

---

## Task 12: Web — NotificationDrawer component

**Files:**
- Create: `game-gauge-web/src/components/layout/notification-drawer.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { NotificationRow } from './notification-row';
import type { Notification } from '@/lib/notifications';

interface NotificationDrawerProps {
  open: boolean;
  notifications: Notification[];
  isLoading: boolean;
  onClose: () => void;
  onRead: (id: string) => void;
  onMarkAllRead: () => void;
}

export function NotificationDrawer({
  open,
  notifications,
  isLoading,
  onClose,
  onRead,
  onMarkAllRead,
}: NotificationDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const hasUnread = notifications.some((n) => !n.read);

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="
          absolute right-4 top-16
          w-[360px] max-h-[520px]
          bg-background border border-brand-purple/20 rounded-xl
          shadow-[0_8px_32px_rgba(0,0,0,0.4)]
          flex flex-col overflow-hidden
        "
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-brand-purple/15">
          <span className="text-[13px] uppercase tracking-[0.08em] text-foreground/40">
            Notifications
          </span>
          <div className="flex items-center gap-2">
            {hasUnread && (
              <button
                onClick={onMarkAllRead}
                className="text-[11px] text-brand-purple/70 hover:text-brand-purple transition-colors"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="text-foreground/30 hover:text-foreground/60 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="h-4 w-4 rounded-full border-2 border-brand-purple border-t-transparent animate-spin" />
            </div>
          )}

          {!isLoading && notifications.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <p className="text-[13px] text-foreground/40">Nothing yet</p>
              <p className="text-[12px] text-foreground/25 mt-1">
                When someone follows you or reacts to your activity, it'll show up here.
              </p>
            </div>
          )}

          {!isLoading && notifications.map((n) => (
            <NotificationRow
              key={n.id}
              notification={n}
              onRead={onRead}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/notification-drawer.tsx
git commit -m "feat(notifications): NotificationDrawer component"
```

---

## Task 13: Web — NotificationBell component

**Files:**
- Create: `game-gauge-web/src/components/layout/notification-bell.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useState, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { NotificationDrawer } from './notification-drawer';
import { useNotifications } from '@/hooks/useNotifications';

export function NotificationBell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { unreadCount, notifications, isLoadingPage, loadNotifications, markRead, markAllRead } =
    useNotifications();

  const handleOpen = useCallback(async () => {
    setDrawerOpen(true);
    await loadNotifications();
  }, [loadNotifications]);

  const handleClose = useCallback(() => setDrawerOpen(false), []);

  return (
    <>
      <button
        onClick={handleOpen}
        className="relative p-1.5 rounded-md text-foreground/50 hover:text-foreground/80 hover:bg-brand-purple/10 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="
            absolute -top-0.5 -right-0.5
            min-w-[16px] h-4 px-1
            bg-brand-amber text-background
            text-[9px] font-bold leading-none
            flex items-center justify-center
            rounded-full
          ">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <NotificationDrawer
        open={drawerOpen}
        notifications={notifications}
        isLoading={isLoadingPage}
        onClose={handleClose}
        onRead={markRead}
        onMarkAllRead={markAllRead}
      />
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/notification-bell.tsx
git commit -m "feat(notifications): NotificationBell with badge and drawer"
```

---

## Task 14: Web — Wire NotificationBell into Navbar

**Files:**
- Modify: `game-gauge-web/src/components/layout/navbar.tsx`

- [ ] **Step 1: Add the import**

At the top of `src/components/layout/navbar.tsx`, add after the existing local imports:

```tsx
import { NotificationBell } from './notification-bell';
```

- [ ] **Step 2: Insert the bell into the right-side controls**

In the `{/* Right Side */}` section, find the search trigger button. The authenticated user menu follows it. Insert `<NotificationBell />` between the search trigger and the `DropdownMenu`, inside the `{isAuthenticated && user ? (` block:

```tsx
{/* Authenticated user menu */}
{isAuthenticated && user ? (
  <div className="flex items-center gap-1">
    <NotificationBell />
    <DropdownMenu>
      {/* ... existing dropdown content unchanged ... */}
    </DropdownMenu>
  </div>
) : (
  // ... existing sign-in/sign-up links unchanged ...
)}
```

- [ ] **Step 3: Start dev server and verify visually**

```bash
npm run dev
```

- Open the app in a browser while authenticated
- Confirm the bell icon appears in the navbar next to the avatar
- Confirm clicking the bell opens the drawer
- Confirm the drawer renders the empty state if no notifications exist
- Confirm the badge appears (you may need to trigger a follow/reaction via the API directly to test)

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/navbar.tsx
git commit -m "feat(notifications): add NotificationBell to navbar"
```

---

## Final verification

- [ ] Run the full API test suite: `cd game-gauge-api && npm test`
- [ ] Confirm all API tests pass
- [ ] Trigger a follow via the web UI — confirm the followed user sees a notification
- [ ] React to an activity event — confirm the event owner sees a LIKED_EVENT notification
- [ ] Add a comment — confirm the event owner sees a COMMENTED_EVENT notification
- [ ] "Mark all read" clears the badge and removes unread indicators
- [ ] Clicking a notification navigates to the correct page
- [ ] Empty state renders for a user with no notifications
- [ ] Self-follow / self-react creates no notification (guard verified)
