# Internal Messaging System — Design Spec
**Date:** 2026-07-01
**Repos:** game-gauge-api, game-gauge-web
**Status:** Approved

---

## Overview

An internal messaging system letting users send text and share games, lists, reviews, and activity events directly to other users, in 1:1 or group conversations. Messaging is currently completely absent from the product — the only user-to-user interaction is following, reactions, and comments on public activity events. This is the first feature requiring real-time push delivery; the backend previously relied entirely on REST + client polling.

Access is gated by a message-request model (Instagram-style): mutual follows land straight in the recipient's inbox, everyone else lands in a "Requests" tab pending acceptance. Basic user-to-user blocking is included since open message requests otherwise have no spam/abuse guard.

---

## Scope

**In scope:**
- 1:1 and group conversations
- Text messages
- Rich share attachments: games, lists (including private lists, via an implicit access grant), reviews, activity events
- Message requests (mutual-follow bypass, explicit accept/decline for everyone else)
- Basic blocking (freezes 1:1 messaging both ways, hides the conversation both ways)
- Edit / soft-delete own messages
- Archive-a-conversation-for-self (reappears if the other party messages again)
- Group management: rename, add/remove member (creator-only), leave (any member)
- Real-time delivery via socket.io, with REST as the source of truth and a resync-on-reconnect path
- Dedicated `/messages` page with its own unread-badge nav icon (separate from the notification bell)

**Explicitly NOT in scope for this pass:**
- Read receipts (per-message) — only a per-participant `lastReadAt` for unread-badge purposes
- Typing indicators
- Arbitrary image/file uploads in messages
- Push notifications (iOS/browser) beyond in-app delivery
- Rate-limiting / spam-detection infrastructure — no rate limiter exists in the codebase today and adding one is a separate concern
- Blocking's effect on shared group chats — a block only prevents new 1:1 DMs between the two users; it does not eject either party from a group both are in

---

## Data Model

Four new Prisma models; no changes to existing models beyond new relation fields on `User`, `Game`, `GameList`, `Review`, and `ActivityEvent`.

```prisma
model Conversation {
  id        String   @id @default(uuid())
  isGroup   Boolean  @default(false)
  name      String?           // group name only; null for 1:1
  creatorId String?           // set for groups; drives rename/add/remove permission
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt   // standard bookkeeping only (renames, membership changes, etc.)
  lastMessageAt DateTime @default(now()) // set ONLY by MessageService on send — drives inbox sort + archive-unhide logic

  participants ConversationParticipant[]
  messages     Message[]

  @@index([lastMessageAt])
}

model ConversationParticipant {
  id             String    @id @default(uuid())
  conversationId String
  userId         String
  status         String    @default("ACCEPTED") // ACCEPTED | PENDING | DECLINED
  hiddenAt       DateTime? // "delete for me" — hidden until conversation.lastMessageAt exceeds this
  leftAt         DateTime? // group leave; historical messages remain attributed to this user
  lastReadAt     DateTime  @default(now()) // powers unread badge; no per-message receipts

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
  content         String?   @db.Text          // used when type = TEXT
  gameId          String?
  listId          String?
  reviewId        String?
  activityEventId String?
  editedAt        DateTime?
  deletedAt       DateTime? // soft delete
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

### Updates to existing models

Add relation fields:

```prisma
// User
conversationParticipants ConversationParticipant[]
messagesSent             Message[]
blocksMade               Block[] @relation("Blocker")
blocksReceived           Block[] @relation("Blocked")

// Game
messageShares Message[]

// GameList
messageShares Message[]

// Review
messageShares Message[]

// ActivityEvent
messageShares Message[]
```

### Key design decisions

- **Request state is per-participant, not per-conversation.** In a group, one invitee can be `PENDING` while others are already `ACCEPTED` — each invitee's own follow relationship with the creator determines their initial status.
- **A share is its own message type**, not a text message with an attachment bolted on. `type` determines which of `content`/`gameId`/`listId`/`reviewId`/`activityEventId` is populated. Matches how Instagram/Discord present a share as its own bubble.
- **No per-message read receipts** — a single `lastReadAt` per participant is sufficient for an unread badge and matches the decision to defer read receipts.
- **Archive-for-self needs no cleanup job**: set `hiddenAt` to hide; the conversation is visible again once `conversation.lastMessageAt > hiddenAt`, computed at query time. `lastMessageAt` is set only by `MessageService` on send — kept separate from Prisma's auto-managed `updatedAt` so a rename or membership change can't accidentally un-hide an archived conversation.
- **Declining a request is terminal** for that participant: `status = DECLINED` drops the conversation from both their inbox and requests tab permanently (mirrors Instagram's "Delete" on a request).

---

## Backend API

New route files: `conversation.routes.ts`, mounted under `/api/conversations`. Follows the existing layered pattern: `routes` → `controllers` → `services` → `repositories`, with new `conversation.service.ts`, `message.service.ts`, `block.service.ts` and matching repositories/controllers/validators.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/conversations` | Inbox: `ACCEPTED` + non-hidden, sorted by `lastMessageAt` desc, with last-message preview and per-conversation unread flag |
| `GET` | `/api/conversations/requests` | Pending (`PENDING`) conversations for the current user |
| `POST` | `/api/conversations` | Create 1:1 or group. Body: `{ participantUsernames: string[], isGroup: boolean, name?: string }`. Dedups existing 1:1 threads between the same two users; computes each invitee's initial `status` from the mutual-follow check |
| `GET` | `/api/conversations/:id` | Conversation detail + participants (404 if requester isn't a participant) |
| `GET` | `/api/conversations/:id/messages` | Cursor-paginated history, `?before=messageId&limit=` |
| `POST` | `/api/conversations/:id/messages` | Send a message. Body varies by `type`; validates participant status and block state |
| `PATCH` | `/api/conversations/:id/messages/:messageId` | Edit own `TEXT` message |
| `DELETE` | `/api/conversations/:id/messages/:messageId` | Soft-delete own message |
| `POST` | `/api/conversations/:id/accept` | Accept a pending request (sets own `status = ACCEPTED`) |
| `POST` | `/api/conversations/:id/decline` | Decline (sets own `status = DECLINED`) |
| `DELETE` | `/api/conversations/:id` | Archive-for-self (sets `hiddenAt`), or leave if group (sets `leftAt`) |
| `PATCH` | `/api/conversations/:id` | Rename group — creator only |
| `POST` | `/api/conversations/:id/members/:username` | Add member — creator only. New member's initial `status` is computed the same way as at creation time (mutual-follow-with-creator → `ACCEPTED`, otherwise `PENDING`) |
| `DELETE` | `/api/conversations/:id/members/:userId` | Remove member (creator only) or leave (self) |
| `GET` | `/api/conversations/unread-count` | `{ count: number }` — REST fallback for the socket-driven badge |
| `POST` | `/api/users/:username/block` | Block a user |
| `DELETE` | `/api/users/:username/block` | Unblock |
| `GET` | `/api/users/me/blocks` | List currently blocked users |

All endpoints require `authenticate` middleware.

---

## Real-Time Layer (Socket.io)

A socket.io server attaches to the same HTTP server as Express in `server.ts`. New file: `src/sockets/index.ts`.

- **Auth**: handshake includes the same JWT the client already sends as a Bearer header, verified via the existing `verifyToken` from `jwt.util.ts`. Invalid/expired token → immediate disconnect; client falls back to REST fetches for that session until token refresh triggers a reconnect.
- **Rooms**: on connect, the server looks up every `conversationId` the user actively participates in (`ConversationParticipant` where `status = ACCEPTED` and `leftAt IS NULL`) and joins those rooms, plus a personal `user:{userId}` room for account-wide events.
- **REST remains the source of truth.** Sending a message is a normal `MessageService.send()` call — validates and persists via Prisma first; the socket broadcast to `conversation:{id}` fires only after the write succeeds.
- **Events emitted**: `message:new`, `message:edited`, `message:deleted`, `conversation:new` (a new thread/request appeared for a `user:{userId}` room), `conversation:updated` (rename/membership change), `unread:update`.
- **Reconnection correctness**: on reconnect, the client refetches messages newer than its last-seen message ID via REST (`GET /conversations/:id/messages`), so a dropped connection can't silently lose messages.
- **Scaling note**: single Railway instance is assumed; if horizontal scaling is added later, cross-instance broadcast will need a Redis adapter for socket.io. Not needed now.

---

## Attachment Sharing & Access Control

- **Share trigger**: a "Share" action is added to game pages, list pages, review cards, and activity-feed items. It opens a "Send to…" picker (existing conversations, or start a new 1:1/group), then posts to `POST /conversations/:id/messages` with the appropriate `type` and entity ID.
- **Private list access**: no separate grants table. List visibility (`list.service.ts`) gets one additional clause — a list is viewable if it's public, owned by the viewer, **or** there exists a non-deleted `Message` with `type = LIST_SHARE`, `listId = <list>`, in a conversation where the viewer has `status = ACCEPTED`. Sharing a private list is therefore self-enforcing from message data, and access persists even if the message is later scrolled past.
- **Games, reviews, and activity events** need no additional access logic — already reachable at their normal public URLs.
- **Rendering**: each share type renders as a distinct preview card in the thread — cover art + title (game), name + item count (list), excerpt + rating (review), actor + summary (activity event) — tappable through to the real page.

---

## Web UI

### `/messages` page

Two-pane layout: conversation list on the left, active thread on the right (desktop), matching the chosen mockup direction (full page, not a slide-over). `/messages/[conversationId]` is directly linkable. A "Requests" tab sits alongside the main inbox list.

### Navbar

A new message icon (paper-plane style) next to the existing notification bell, with its own unread badge — separate from the `Notification` model entirely. Driven live by `unread:update` socket events; falls back to polling `GET /api/conversations/unread-count` every 60 seconds if the socket is disconnected, mirroring the degradation pattern already used by `useNotifications`.

### New components (`src/components/messages/`)

- `conversation-list.tsx`, `conversation-list-item.tsx`
- `message-thread.tsx`, `message-bubble.tsx`
- `share-attachment-card.tsx` (variant per share type)
- `message-composer.tsx`
- `new-conversation-dialog.tsx` (user/group picker)
- `requests-tab.tsx`
- `share-to-dialog.tsx` (reused from game/list/review/activity "Share" buttons elsewhere in the app)
- `messages-nav-icon.tsx`

### New hooks (`src/hooks/`)

- `use-socket.ts` — singleton socket.io-client connection, JWT auth, reconnect-triggered resync
- `use-conversations.ts` — inbox list, live-updated via socket events, REST fallback
- `use-messages.ts` — paginated history + live append for one conversation
- `use-message-requests.ts`
- `use-blocked-users.ts`

### New lib files

- `src/lib/socket.ts` — socket.io-client setup/singleton
- `src/lib/messages.ts` — REST API calls, type definitions

---

## Error Handling & Edge Cases

- **Not a participant**: fetching a conversation/messages you don't belong to returns `404`, not `403` — avoids leaking existence, consistent with `errors.util.ts` conventions.
- **Blocked send attempt**: `POST .../messages` checks the `Block` table both directions before persisting; returns `403`. The UI should prevent reaching this state, but the API enforces it independently.
- **Declined/blocked requests are terminal** for that user — they don't resurface.
- **Group permissions**: only the creator can rename/add/remove members; a removed or left member's historical messages remain, attributed to a `senderId` no longer active in `ConversationParticipant`.
- **Socket auth failure**: disconnects immediately; client degrades to REST until reconnect succeeds.
- **No new rate-limiting infrastructure**: flagged as a known gap given open message requests, not addressed in this pass — there's no existing rate limiter in the codebase to extend.

---

## Testing Strategy

Follows the existing `__tests__/services` and `__tests__/controllers` structure:

- Unit tests for `ConversationService`, `MessageService`, `BlockService`: request/accept/decline flow, mutual-follow bypass, block enforcement (both directions), private-list-via-share access grant, archive-for-self visibility logic, group add/remove/leave permissions.
- Controller tests for all new REST routes (auth required, 404 on non-participant access, 403 on blocked send).
- Socket broadcast logic is thin (persist-then-emit) and covered indirectly by service tests. The actual real-time delivery path is verified manually in-browser during implementation (two authenticated sessions messaging each other), consistent with this project's UI-verification norm rather than an automated socket-integration test.

### Testing checklist

- [ ] Prisma migration runs cleanly; `Conversation`, `ConversationParticipant`, `Message`, `Block` created with correct indexes
- [ ] Mutual-follow users' new conversation lands directly in `ACCEPTED` status
- [ ] Non-mutual-follow conversation lands as `PENDING` for the recipient, visible in Requests tab
- [ ] Accepting a request moves it to the main inbox; declining removes it permanently
- [ ] Group creation sets per-invitee status independently based on their own follow relationship with the creator
- [ ] Sending each message `type` (TEXT, GAME_SHARE, LIST_SHARE, REVIEW_SHARE, ACTIVITY_SHARE) persists correctly and renders the right preview card
- [ ] Sharing a private list grants the recipient view access; access persists after the fact
- [ ] Sharing a private list does NOT grant access to a third party not in that conversation
- [ ] Blocking a user hides the 1:1 conversation for both parties and rejects new sends both directions
- [ ] Unblocking restores the conversation and its history
- [ ] Editing/deleting a message updates/soft-deletes correctly; other participants can't edit/delete someone else's message
- [ ] Archiving a conversation hides it from the archiver's inbox; a new message from the other party un-hides it
- [ ] Group leave removes the user from future message delivery but preserves their historical messages
- [ ] Only the group creator can rename or add/remove members; non-creator attempts return 403
- [ ] Socket connects with valid JWT, joins correct rooms, receives `message:new` in real time across two browser sessions
- [ ] Invalid/expired JWT on socket handshake disconnects immediately
- [ ] Reconnecting after a dropped connection resyncs any missed messages via REST
- [ ] Unread badge updates live via socket and via 60s REST fallback when socket is down
- [ ] Fetching a conversation/messages as a non-participant returns 404

---

## What is NOT in scope

- Read receipts (per-message) — only unread-badge-level `lastReadAt`
- Typing indicators
- Image/file upload attachments — text and entity shares only
- Push notifications (iOS/browser) beyond in-app delivery
- Rate-limiting / spam-detection infrastructure
- Blocking's effect on shared group membership — blocks only prevent new 1:1 DMs
- Horizontal scaling support for socket.io (Redis adapter) — single-instance assumed
