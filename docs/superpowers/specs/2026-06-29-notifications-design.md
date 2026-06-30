# Notifications System — Design Spec
**Date:** 2026-06-29
**Repos:** game-gauge-api, game-gauge-web
**Status:** Approved

---

## Overview

An in-app notification system that makes social interactions feel alive. Currently, social actions (follows, likes, comments) are completely silent — the recipient has no way to know they happened. This spec covers schema, API, and web UI. Push notifications for iOS are out of scope for this pass but the data model is designed to support them without a future migration.

---

## Trigger Events

Three user actions create a notification:

| Trigger | Type | Recipient |
|---------|------|-----------|
| User A follows User B | `FOLLOWED_YOU` | User B |
| User A reacts to User B's activity event | `LIKED_EVENT` | User B |
| User A comments on User B's activity event | `COMMENTED_EVENT` | User B |

**Self-notification guard:** never create a notification when `actorId === userId`.  
**Reaction toggle:** only create a notification when a reaction is *added*, not removed.

---

## Schema

### New model: `Notification`

```prisma
model Notification {
  id        String   @id @default(uuid())
  userId    String
  actorId   String
  type      String   // FOLLOWED_YOU | LIKED_EVENT | COMMENTED_EVENT
  eventId   String?  // null for FOLLOWED_YOU; ActivityEvent id for the other types
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

### Updates to `User`

Add two relation fields:

```prisma
notifications      Notification[] @relation("NotificationRecipient")
sentNotifications  Notification[] @relation("NotificationActor")
```

### Updates to `ActivityEvent`

Add one relation field:

```prisma
notifications Notification[]
```

No `meta` JSON field — the `type` + `eventId` is sufficient for the UI to build display strings and deep links. Keeping it lean also means iOS push payloads can be derived from the same fields without stale stored text.

---

## API

All endpoints require authentication (`authenticate` middleware). Base path: `/api/notifications`.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/notifications` | Paginated notifications for current user, newest first |
| `GET` | `/api/notifications/unread-count` | Returns `{ count: number }` |
| `PATCH` | `/api/notifications/:id/read` | Mark single notification read |
| `PATCH` | `/api/notifications/read-all` | Mark all notifications read |

### `GET /api/notifications` response shape

```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "uuid",
        "type": "LIKED_EVENT",
        "read": false,
        "createdAt": "2026-06-29T12:00:00Z",
        "actor": {
          "id": "uuid",
          "username": "zachauker",
          "avatar": "https://..."
        },
        "event": {
          "id": "uuid",
          "type": "RATED_GAME",
          "meta": { "gameTitle": "Elden Ring", "gameSlug": "elden-ring" }
        }
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 47 }
  }
}
```

`event` is `null` for `FOLLOWED_YOU` notifications. Actor avatar and username are included so the UI renders without a second fetch.

### New files (API)

- `src/controllers/notification.controller.ts`
- `src/services/notification.service.ts`
- `src/repositories/notification.repository.ts`
- `src/routes/notification.routes.ts`
- `src/validators/notification.validator.ts` (pagination schema reuse)

### Service integration

Notification creation is fire-and-forget — failures must not break the parent operation:

```ts
// follow.service.ts — after UserFollow row is created
notificationService.create({
  userId: followingId,
  actorId: followerId,
  type: 'FOLLOWED_YOU',
}).catch(() => {});

// interaction.service.ts — after reaction is added (not on remove)
notificationService.create({
  userId: event.userId,
  actorId,
  type: 'LIKED_EVENT',
  eventId: event.id,
}).catch(() => {});

// interaction.service.ts — after comment is created
notificationService.create({
  userId: event.userId,
  actorId,
  type: 'COMMENTED_EVENT',
  eventId: event.id,
}).catch(() => {});
```

Self-notification guard lives in `notificationService.create()` — if `actorId === userId`, return early without writing.

---

## Web UI

### Navbar bell

- Authenticated-only; sits alongside the user avatar in the existing navbar
- Polls `GET /api/notifications/unread-count` every 60 seconds
- Displays an amber badge with the raw count, capped at display of "9+" beyond 9
- Clicking opens the notifications drawer

### Notifications drawer

Slides in from the right (top on mobile). Renders up to 20 most recent notifications.

**Each row:**
- Actor avatar (small, circular)
- Human-readable string built from `type` + actor username + event meta:
  - `FOLLOWED_YOU` → "**zachauker** followed you"
  - `LIKED_EVENT` → "**zachauker** liked your rating of **Elden Ring**"
  - `COMMENTED_EVENT` → "**zachauker** commented on your review of **Hollow Knight**"
- Relative timestamp ("2m ago", "3h ago", "yesterday")
- Unread indicator: brand-purple left border on the row
- Clicking: marks notification read via `PATCH /:id/read`, then navigates to the relevant content:
  - `FOLLOWED_YOU` → `/users/{actor.username}`
  - `LIKED_EVENT` / `COMMENTED_EVENT` → the activity event anchor (game page or feed)

**Drawer header:** title ("Notifications") + "Mark all read" button (calls `PATCH /read-all`, clears all unread indicators).

**Empty state:** "Nothing yet — when someone follows you or reacts to your activity, it'll show up here."

### Polling strategy

60-second interval polling on `unread-count` only — no SSE or WebSockets. The full notification list is fetched on drawer open, not continuously. This is sufficient for current usage and avoids complexity that would need to be re-evaluated for iOS anyway.

### New files (web)

- `src/components/layout/notification-bell.tsx` — bell icon + badge + drawer trigger
- `src/components/layout/notification-drawer.tsx` — drawer shell + notification list
- `src/components/layout/notification-row.tsx` — single notification row
- `src/hooks/use-notifications.ts` — polling hook for unread count, fetch/mutate helpers
- `src/lib/notifications.ts` — type definitions, display string builder, deep link resolver

---

## What is NOT in scope

- Push notifications (iOS) — the schema supports it; implementation deferred
- Email notifications — not aligned with the product's low-noise philosophy
- Notification preferences / settings — add in a later pass once volume and types are known
- Real-time delivery (SSE/WebSockets) — 60s polling is sufficient now
- A dedicated `/notifications` full page — drawer is enough for this pass; promote later if needed

---

## iOS readiness notes

- No stored display text in the schema — all strings are derived at render time from `type` + relational data. When iOS push lands, the same derivation logic generates the push title/body.
- A `pushToken` field on `User` (or a separate `DevicePushToken` table for multi-device) will be needed at that point but requires no changes to `Notification`.
- The API response shape maps cleanly to `UNNotificationContent` on iOS.

---

## Testing checklist

- [ ] Prisma migration runs cleanly; `Notification` table created with correct indexes
- [ ] Following a user creates a `FOLLOWED_YOU` notification for the followee
- [ ] Reacting to an event creates a `LIKED_EVENT` notification for the event owner
- [ ] Removing a reaction does NOT create a notification
- [ ] Commenting creates a `COMMENTED_EVENT` notification for the event owner
- [ ] Self-actions create no notification
- [ ] `GET /api/notifications` returns correct pagination and actor data
- [ ] `GET /api/notifications/unread-count` returns accurate count
- [ ] `PATCH /:id/read` marks one notification read
- [ ] `PATCH /read-all` marks all read; unread count returns 0
- [ ] Navbar bell shows correct badge count; clears after mark-all-read
- [ ] Drawer opens, rows render with correct text and timestamps
- [ ] Clicking a notification marks it read and navigates correctly
- [ ] Empty state renders when no notifications exist
- [ ] Failed notification write does not break follow / reaction / comment operations
