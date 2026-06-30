# User Profiles — Design Spec

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this spec task-by-task.

**Goal:** Complete and extend the existing user profile page — wire the follow button, fix data bugs, add an Activity tab, show follower/following counts as clickable links, and build dedicated followers/following pages with infinite scroll throughout.

**Architecture:** Option B — decompose the existing monolithic `users/[username]/page.tsx` into focused components in `src/components/profile/`, add four new API endpoints for user-scoped paginated data, and add two new Next.js pages for followers/following lists.

**Tech stack:** Next.js 14 (App Router, `"use client"` components), Tailwind + brand tokens (`brand-purple`, `brand-amber`), Express/TypeScript API (repository → service → controller → routes pattern), Prisma 7 + PostgreSQL, TDD with Jest.

---

## 1. Problems Being Fixed

The existing profile page at `src/app/(main)/users/[username]/page.tsx` has two bugs and several missing features:

**Bug 1 — Wrong user data in tabs:** The Ratings and Reviews tabs call `/ratings/me/recent` and `/reviews/me/recent`, which always return the *logged-in* user's data, not the viewed user's. Viewing someone else's profile shows your own ratings.

**Bug 2 — Follow button not wired:** The Follow button is hardcoded HTML that calls nothing. The `FollowButton` component (`src/components/social/follow-button.tsx`) and `useFollow` hook (`src/hooks/useFollow.ts`) already exist and must be used instead.

**Missing features:**
- No Activity tab (the API endpoint `GET /api/users/:username/activity` already exists)
- Followers/following counts not shown in the stats row
- No way to browse who follows/is following a user
- No pagination — all tabs load a fixed 12 items with no way to see more

---

## 2. API Changes (game-gauge-api)

### Existing endpoints — no changes needed

- `GET /api/users/:username` — profile data (id, username, name, bio, avatar, createdAt)
- `GET /api/users/:username/stats` — already returns `{ totalRatings, totalReviews, totalLists, averageRating, publicListsCount, followerCount, followingCount, isFollowing, isFollowedBy }`
- `GET /api/users/:username/activity` — paginated activity feed, routed to `activityController.getUserActivity`

### New endpoints

All four follow the existing `{ success: true, data: { items, total, page, hasMore } }` envelope. All accept `?page=1&limit=20` query params. All are public (no authentication required to read).

#### `GET /api/users/:username/ratings`

Returns paginated ratings for the given user, each with the associated game.

```
Response data:
{
  items: Array<{
    id: string
    score: number
    createdAt: string
    game: { id, title, slug, coverImage }
  }>
  total: number
  page: number
  hasMore: boolean
}
```

Implementation: add to `user.routes.ts`, handle in `userController.getUserRatings`, delegate to `userService.getUserRatings(username, { page, limit })`, which calls `ratingRepository.findByUser(userId, { page, limit })` using the existing `findMany` pattern.

#### `GET /api/users/:username/reviews`

Returns paginated reviews for the given user, each with the associated game and helpful vote count.

```
Response data:
{
  items: Array<{
    id: string
    content: string
    spoilers: boolean
    createdAt: string
    game: { id, title, slug, coverImage }
    _count: { helpfulVotes: number }
  }>
  total: number
  page: number
  hasMore: boolean
}
```

Implementation: same pattern — `userController.getUserReviews` → `userService.getUserReviews` → `reviewRepository.findByUser`.

#### `GET /api/users/:username/followers`

Returns paginated list of users who follow the given user. Includes `isFollowing` (does the *viewer* follow each follower) when a valid JWT is provided.

```
Response data:
{
  items: Array<{
    id: string
    username: string
    firstName: string | null
    lastName: string | null
    avatar: string | null
    bio: string | null
    isFollowing: boolean   // viewer → this user; false if unauthenticated
  }>
  total: number
  page: number
  hasMore: boolean
}
```

Implementation: `userController.getFollowers` → `followService.getFollowers(profileUserId, viewerId?, { page, limit })` → `followRepository.getFollowers(...)`.

#### `GET /api/users/:username/following`

Same shape as `/followers` but returns users that the given user follows.

Implementation: `userController.getFollowing` → `followService.getFollowing(...)` → `followRepository.getFollowing(...)`.

---

## 3. Web Component Architecture (game-gauge-web)

### New directory: `src/components/profile/`

#### `profile-header.tsx`
Props: `profile` (id, username, firstName, lastName, bio, avatar, createdAt), `isOwnProfile: boolean`

Renders: avatar (image or initials fallback), display name, `@username` if name is set, bio, join year. For own profile: "Edit profile" link to `/settings`. For others: `<FollowButton userId={profile.id} />` (the existing component from `src/components/social/follow-button.tsx`).

#### `profile-stats.tsx`
Props: `stats` (totalRatings, totalReviews, averageRating, publicListsCount, followerCount, followingCount), `username: string`

Renders the stats row. Ratings, Reviews, Avg score, and Lists are plain text pills. Followers and Following are `<Link href="/users/[username]/followers">` and `<Link href="/users/[username]/following">` respectively, styled with `text-brand-purple/80` to indicate they are interactive.

#### `ratings-tab.tsx`
Props: `username: string`

Client component. Fetches `GET /api/users/:username/ratings?page=1&limit=20` on mount. Infinite scroll: `IntersectionObserver` on a sentinel div at the bottom triggers `page + 1` fetch and appends results. Each row: cover image (36×48), game title, `timeAgo(createdAt)`, amber star + score badge.

#### `reviews-tab.tsx`
Props: `username: string`

Same infinite scroll pattern. Each row: cover (28×36), game title, date, 2-line excerpt (or "Contains spoilers" if `spoilers: true`), helpful count.

#### `activity-tab.tsx`
Props: `username: string`

Mixed format — fetches `GET /api/users/:username/activity`. For each event:
- `RATED_GAME` → compact row with cover, title, "Rated · time", score badge
- `REVIEWED_GAME` → full card with cover, title, "Reviewed · time", 3-line review excerpt
- `ADDED_TO_LIST`, `COMPLETED_GAME`, `STARTED_GAME`, `FOLLOWED_USER`, `CREATED_LIST` → compact row with cover (or user avatar for follows), title/target, event label, time

Reuses `ActivityEventCard` from `src/components/social/activity-event-card.tsx` for review events. Compact rows are inline — not a shared component (YAGNI).

#### `lists-tab.tsx`
Props: `username: string` (uses profile ID via prop or fetched from context)

Fetches `GET /api/lists/user/:userId` (existing endpoint). Infinite scroll same pattern. Each row: list name, description snippet, item count.

#### `follow-user-row.tsx`
Props: `user` (id, username, firstName, lastName, avatar, bio, isFollowing)

Single row used on both followers and following pages. Avatar (36×36 circle, initials fallback), username (bold), bio (truncated, muted), `<FollowButton userId={user.id} initialIsFollowing={isFollowing} />`.

### New lib file: `src/lib/profile.ts`

Typed API helpers following the same `api.get(path).then(r => r.data.data)` pattern as `social.ts`:

```typescript
fetchUserRatings(username, page, limit): Promise<RatingPage>
fetchUserReviews(username, page, limit): Promise<ReviewPage>
fetchUserFollowers(username, page, limit): Promise<FollowListPage>
fetchUserFollowing(username, page, limit): Promise<FollowListPage>
```

Types: `RatingItem`, `ReviewItem`, `FollowListUser`, `RatingPage`, `ReviewPage`, `FollowListPage`.

### Modified: `src/app/(main)/users/[username]/page.tsx`

Remove all inline sub-components (StatPill, TabButton, RatingsTab, ReviewsTab, ListsTab, timeAgo). Replace with imports from `src/components/profile/`. Wire tab content to new components. Add Activity tab between Reviews and Lists. The page component itself stays `"use client"` and manages only `activeTab` state — all data fetching moves into the individual tab components.

### New pages

#### `src/app/(main)/users/[username]/followers/page.tsx`

`"use client"`. Fetches profile for the header, then fetches `/followers` with infinite scroll. Renders `ProfileHeader` + `ProfileStats` (read-only, links disabled) at top, then a list of `FollowUserRow` components below. Back link: `← @username`.

#### `src/app/(main)/users/[username]/following/page.tsx`

Identical structure to followers page, using `fetchUserFollowing`.

---

## 4. Infinite Scroll Pattern

All tabs and list pages use the same `IntersectionObserver` pattern:

```typescript
// Sentinel div at bottom of list
const sentinelRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && hasMore && !loading) {
      loadMore();
    }
  });
  if (sentinelRef.current) observer.observe(sentinelRef.current);
  return () => observer.disconnect();
}, [hasMore, loading]);
```

`loadMore` increments `page` state, fetches the next page, and appends to the items array. Loading state shows a small spinner at the bottom, not a full-page loader.

---

## 5. Empty States

Each tab renders a centered empty state when `items.length === 0` and not loading:
- Ratings: star icon + "No ratings yet"
- Reviews: message icon + "No reviews yet"
- Activity: activity icon + "No activity yet"
- Lists: list icon + "No public lists"
- Followers/Following pages: users icon + "No followers yet" / "Not following anyone yet"

---

## 6. Authentication Context

The profile page already computes `isOwnProfile = currentUser?.username === username` via the Zustand auth store. This is passed to `ProfileHeader`. The followers/following pages also need `isOwnProfile` to conditionally show "Edit profile" vs "Follow" in the shared header.

The four new API endpoints are public — no auth required to read. The `/followers` and `/following` endpoints accept an optional JWT to populate `isFollowing` on each returned user. These two routes use a new `optionalAuthenticate` middleware (a thin wrapper around the existing JWT verification that calls `next()` instead of throwing when no token is present, leaving `req.user` undefined). The `/ratings` and `/reviews` endpoints require no auth at all.

---

## 7. Testing

All new API service and repository methods follow TDD:
- Unit tests in `game-gauge-api/src/__tests__/services/` for `getUserRatings`, `getUserReviews`, `getFollowers`, `getFollowing`
- Mock pattern: `jest.mock('../config/database', ...)` — same as existing tests
- No new Prisma schema changes required

Web components are not unit tested (no existing web test suite).
