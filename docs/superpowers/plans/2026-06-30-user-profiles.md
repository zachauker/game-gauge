# User Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete and extend the existing user profile page — fix data bugs, add an Activity tab with mixed format, show clickable follower/following counts, add infinite scroll to all tabs, and build dedicated followers/following list pages.

**Architecture:** Decompose the existing 568-line `users/[username]/page.tsx` into focused components in `src/components/profile/`. Add two new API endpoints (`GET /users/:username/ratings` and `GET /users/:username/reviews`) to fix the bug where tabs showed the logged-in user's data. The followers/following API, service, and controller methods already exist — only new pages and components are needed on the web side.

**Tech Stack:** Next.js 14 (App Router, `"use client"`), Tailwind + brand tokens (`brand-purple`, `brand-amber`), Express/TypeScript (repo → service → controller → routes), Prisma 7, Jest (TDD for API). Web repo at `/Users/zacharyauker/Development/game-gauge-web/`. API repo at `/Users/zacharyauker/Development/game-gauge/game-gauge-api/`.

---

## File Structure

### API — New/Modified files
```
game-gauge-api/src/
  repositories/
    rating.repository.ts          MODIFY — add findByUserProfile()
    review.repository.ts          MODIFY — add findByUserProfile()
  services/
    user.service.ts               MODIFY — add getUserRatings(), getUserReviews()
  controllers/
    user.controller.ts            MODIFY — add getUserRatings(), getUserReviews()
  routes/
    user.routes.ts                MODIFY — add 2 new routes
  __tests__/services/
    user.ratings.service.test.ts  CREATE
    user.reviews.service.test.ts  CREATE
```

### Web — New files
```
game-gauge-web/src/
  lib/
    profile.ts                                          CREATE — typed API helpers
  components/profile/
    profile-header.tsx                                  CREATE
    profile-stats.tsx                                   CREATE
    ratings-tab.tsx                                     CREATE
    reviews-tab.tsx                                     CREATE
    activity-tab.tsx                                    CREATE
    lists-tab.tsx                                       CREATE
    follow-user-row.tsx                                 CREATE
  app/(main)/users/[username]/
    page.tsx                                            MODIFY — refactor to use components
    followers/page.tsx                                  CREATE
    following/page.tsx                                  CREATE
```

---

## Task 1: API — Ratings by username endpoint (TDD)

**Files:**
- Modify: `game-gauge-api/src/repositories/rating.repository.ts`
- Modify: `game-gauge-api/src/services/user.service.ts`
- Create: `game-gauge-api/src/__tests__/services/user.ratings.service.test.ts`

### Background

`ratingRepository.findByUser` exists but includes `user` not `game`. We need a profile-specific method that includes the game. `userService.getUserRatings` will look up the user by username, then call the new repo method.

- [ ] **Step 1: Write the failing test**

Create `game-gauge-api/src/__tests__/services/user.ratings.service.test.ts`:

```typescript
import { userService } from '../../services/user.service';
import { NotFoundError } from '../../utils/errors.util';
import { testUser, testGame, testRating } from '../setup';

jest.mock('../../repositories/user.repository', () => ({
  userRepository: {
    getProfile: jest.fn(),
    findById: jest.fn(),
    findByUsername: jest.fn(),
    getUserStats: jest.fn(),
    updateProfile: jest.fn(),
    updateUsername: jest.fn(),
    searchByUsername: jest.fn(),
  },
}));

jest.mock('../../repositories/rating.repository', () => ({
  ratingRepository: {
    findByUserProfile: jest.fn(),
  },
}));

import { userRepository } from '../../repositories/user.repository';
import { ratingRepository } from '../../repositories/rating.repository';

const mockRatingPage = {
  items: [
    {
      id: testRating.id,
      score: testRating.score,
      createdAt: testRating.createdAt,
      game: { id: testGame.id, title: testGame.title, slug: testGame.slug, coverImage: testGame.coverImage },
    },
  ],
  total: 1,
  page: 1,
  hasMore: false,
};

describe('UserService.getUserRatings', () => {
  beforeEach(() => {
    (userRepository.getProfile as jest.Mock).mockResolvedValue(testUser);
    (ratingRepository.findByUserProfile as jest.Mock).mockResolvedValue(mockRatingPage);
  });

  it('returns paginated ratings for the user', async () => {
    const result = await userService.getUserRatings(testUser.username, 1, 20);
    expect(ratingRepository.findByUserProfile).toHaveBeenCalledWith(testUser.id, 1, 20);
    expect(result).toEqual(mockRatingPage);
  });

  it('throws NotFoundError when user does not exist', async () => {
    (userRepository.getProfile as jest.Mock).mockResolvedValue(null);
    await expect(userService.getUserRatings('ghost', 1, 20)).rejects.toThrow(NotFoundError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd game-gauge-api
npm test -- --testPathPattern="user.ratings.service" --no-coverage
```

Expected: FAIL — `userService.getUserRatings is not a function`

- [ ] **Step 3: Add `findByUserProfile` to RatingRepository**

In `game-gauge-api/src/repositories/rating.repository.ts`, add this interface and method:

After the existing interfaces, add:
```typescript
export interface ProfileRatingItem {
  id: string;
  score: number;
  createdAt: Date;
  game: { id: string; title: string; slug: string; coverImage: string | null };
}

export interface ProfileRatingPage {
  items: ProfileRatingItem[];
  total: number;
  page: number;
  hasMore: boolean;
}
```

Add this method inside the `RatingRepository` class (after `getRecentByUser`):
```typescript
async findByUserProfile(userId: string, page: number, limit: number): Promise<ProfileRatingPage> {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.rating.findMany({
      where: { userId },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        score: true,
        createdAt: true,
        game: { select: { id: true, title: true, slug: true, coverImage: true } },
      },
    }),
    prisma.rating.count({ where: { userId } }),
  ]);
  return { items, total, page, hasMore: skip + items.length < total };
}
```

- [ ] **Step 4: Add `getUserRatings` to UserService**

In `game-gauge-api/src/services/user.service.ts`, add this import at the top:
```typescript
import { ratingRepository } from '../repositories/rating.repository';
```

Add this method to the `UserService` class (after `getRecentActivity`):
```typescript
async getUserRatings(username: string, page: number, limit: number) {
  const profile = await userRepository.getProfile(username);
  if (!profile) throw new NotFoundError('User not found');
  return ratingRepository.findByUserProfile(profile.id, page, limit);
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- --testPathPattern="user.ratings.service" --no-coverage
```

Expected: PASS — 2 tests passing

- [ ] **Step 6: Commit**

```bash
cd game-gauge-api
git add src/repositories/rating.repository.ts src/services/user.service.ts src/__tests__/services/user.ratings.service.test.ts
git commit -m "feat(profiles): add getUserRatings service + findByUserProfile repo method"
```

---

## Task 2: API — Reviews by username endpoint (TDD)

**Files:**
- Modify: `game-gauge-api/src/repositories/review.repository.ts`
- Modify: `game-gauge-api/src/services/user.service.ts`
- Create: `game-gauge-api/src/__tests__/services/user.reviews.service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `game-gauge-api/src/__tests__/services/user.reviews.service.test.ts`:

```typescript
import { userService } from '../../services/user.service';
import { NotFoundError } from '../../utils/errors.util';
import { testUser, testGame, testReview } from '../setup';

jest.mock('../../repositories/user.repository', () => ({
  userRepository: {
    getProfile: jest.fn(),
    findById: jest.fn(),
    findByUsername: jest.fn(),
    getUserStats: jest.fn(),
    updateProfile: jest.fn(),
    updateUsername: jest.fn(),
    searchByUsername: jest.fn(),
  },
}));

jest.mock('../../repositories/review.repository', () => ({
  reviewRepository: {
    findByUserProfile: jest.fn(),
  },
}));

// userService also imports ratingRepository — stub it out
jest.mock('../../repositories/rating.repository', () => ({
  ratingRepository: {
    findByUserProfile: jest.fn(),
  },
}));

import { userRepository } from '../../repositories/user.repository';
import { reviewRepository } from '../../repositories/review.repository';

const mockReviewPage = {
  items: [
    {
      id: testReview.id,
      content: testReview.content,
      spoilers: testReview.spoilers,
      createdAt: testReview.createdAt,
      game: { id: testGame.id, title: testGame.title, slug: testGame.slug, coverImage: testGame.coverImage },
      _count: { helpfulVotes: 0 },
    },
  ],
  total: 1,
  page: 1,
  hasMore: false,
};

describe('UserService.getUserReviews', () => {
  beforeEach(() => {
    (userRepository.getProfile as jest.Mock).mockResolvedValue(testUser);
    (reviewRepository.findByUserProfile as jest.Mock).mockResolvedValue(mockReviewPage);
  });

  it('returns paginated reviews for the user', async () => {
    const result = await userService.getUserReviews(testUser.username, 1, 20);
    expect(reviewRepository.findByUserProfile).toHaveBeenCalledWith(testUser.id, 1, 20);
    expect(result).toEqual(mockReviewPage);
  });

  it('throws NotFoundError when user does not exist', async () => {
    (userRepository.getProfile as jest.Mock).mockResolvedValue(null);
    await expect(userService.getUserReviews('ghost', 1, 20)).rejects.toThrow(NotFoundError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --testPathPattern="user.reviews.service" --no-coverage
```

Expected: FAIL — `userService.getUserReviews is not a function`

- [ ] **Step 3: Add `findByUserProfile` to ReviewRepository**

In `game-gauge-api/src/repositories/review.repository.ts`, add interfaces and method.

After the existing interfaces at the top, add:
```typescript
export interface ProfileReviewItem {
  id: string;
  content: string;
  spoilers: boolean;
  createdAt: Date;
  game: { id: string; title: string; slug: string; coverImage: string | null };
  _count: { helpfulVotes: number };
}

export interface ProfileReviewPage {
  items: ProfileReviewItem[];
  total: number;
  page: number;
  hasMore: boolean;
}
```

Add this method inside the `ReviewRepository` class (after `getUserReviewCount`):
```typescript
async findByUserProfile(userId: string, page: number, limit: number): Promise<ProfileReviewPage> {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.review.findMany({
      where: { userId },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        content: true,
        spoilers: true,
        createdAt: true,
        game: { select: { id: true, title: true, slug: true, coverImage: true } },
        _count: { select: { helpfulVotes: true } },
      },
    }),
    prisma.review.count({ where: { userId } }),
  ]);
  return { items, total, page, hasMore: skip + items.length < total };
}
```

- [ ] **Step 4: Add `getUserReviews` to UserService**

In `game-gauge-api/src/services/user.service.ts`, add this import:
```typescript
import { reviewRepository } from '../repositories/review.repository';
```

Add this method to the `UserService` class (after `getUserRatings`):
```typescript
async getUserReviews(username: string, page: number, limit: number) {
  const profile = await userRepository.getProfile(username);
  if (!profile) throw new NotFoundError('User not found');
  return reviewRepository.findByUserProfile(profile.id, page, limit);
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- --testPathPattern="user.reviews.service" --no-coverage
```

Expected: PASS — 2 tests passing

- [ ] **Step 6: Run full test suite to verify nothing is broken**

```bash
npm test -- --no-coverage
```

Expected: all previously passing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add src/repositories/review.repository.ts src/services/user.service.ts src/__tests__/services/user.reviews.service.test.ts
git commit -m "feat(profiles): add getUserReviews service + findByUserProfile repo method"
```

---

## Task 3: API — Wire controller and routes

**Files:**
- Modify: `game-gauge-api/src/controllers/user.controller.ts`
- Modify: `game-gauge-api/src/routes/user.routes.ts`

### Background

Add two controller methods and register two routes. The `paginationSchema` validator already exists in `src/validators/social.validator.ts` (`z.object({ page, limit })`).

- [ ] **Step 1: Add controller methods**

In `game-gauge-api/src/controllers/user.controller.ts`, add this import at the top:
```typescript
import { paginationSchema } from '../validators/social.validator';
```

Add these two methods to the `UserController` class (after `searchUsers`):

```typescript
/**
 * GET /api/users/:username/ratings
 */
async getUserRatings(req: Request, res: Response, next: NextFunction) {
  try {
    const { username } = req.params;
    const { page, limit } = paginationSchema.parse(req.query);
    const result = await userService.getUserRatings(username, page, limit);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/users/:username/reviews
 */
async getUserReviews(req: Request, res: Response, next: NextFunction) {
  try {
    const { username } = req.params;
    const { page, limit } = paginationSchema.parse(req.query);
    const result = await userService.getUserReviews(username, page, limit);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
```

- [ ] **Step 2: Register routes**

In `game-gauge-api/src/routes/user.routes.ts`, add these two routes after the `/:username/activity` route:

```typescript
/**
 * @route   GET /api/users/:username/ratings
 * @desc    Paginated ratings for a user (profile Ratings tab)
 * @access  Public
 */
router.get('/:username/ratings', userController.getUserRatings.bind(userController));

/**
 * @route   GET /api/users/:username/reviews
 * @desc    Paginated reviews for a user (profile Reviews tab)
 * @access  Public
 */
router.get('/:username/reviews', userController.getUserReviews.bind(userController));
```

- [ ] **Step 3: Verify compilation**

```bash
cd game-gauge-api
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Smoke test the endpoints**

Start the API (`npm run dev`), then in a separate terminal:

```bash
# Replace with an actual username in your database
curl "http://localhost:3000/api/users/testuser/ratings?page=1&limit=5" | jq .
# Expected: { success: true, data: { items: [...], total: N, page: 1, hasMore: false|true } }

curl "http://localhost:3000/api/users/testuser/reviews?page=1&limit=5" | jq .
# Expected: same shape, items include game and _count.helpfulVotes
```

- [ ] **Step 5: Commit**

```bash
git add src/controllers/user.controller.ts src/routes/user.routes.ts
git commit -m "feat(profiles): add GET /users/:username/ratings and /reviews routes"
```

---

## Task 4: Web — Profile API helpers (`profile.ts`)

**Files:**
- Create: `game-gauge-web/src/lib/profile.ts`

### Background

`social.ts` already has `getFollowers`, `getFollowing`, `getUserActivity`, and all the `ActivityEvent` types. `profile.ts` needs helpers only for the two new endpoints (ratings and reviews). Do not duplicate types already in `social.ts`.

- [ ] **Step 1: Create the file**

Create `game-gauge-web/src/lib/profile.ts`:

```typescript
import { api } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProfileGame {
  id: string;
  title: string;
  slug: string;
  coverImage: string | null;
}

export interface ProfileRatingItem {
  id: string;
  score: number;
  createdAt: string;
  game: ProfileGame;
}

export interface ProfileReviewItem {
  id: string;
  content: string;
  spoilers: boolean;
  createdAt: string;
  game: ProfileGame;
  _count: { helpfulVotes: number };
}

export interface ProfileRatingPage {
  items: ProfileRatingItem[];
  total: number;
  page: number;
  hasMore: boolean;
}

export interface ProfileReviewPage {
  items: ProfileReviewItem[];
  total: number;
  page: number;
  hasMore: boolean;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

export async function fetchUserRatings(
  username: string,
  page = 1,
  limit = 20
): Promise<ProfileRatingPage> {
  const { data } = await api.get(`/users/${username}/ratings`, {
    params: { page, limit },
  });
  return data.data;
}

export async function fetchUserReviews(
  username: string,
  page = 1,
  limit = 20
): Promise<ProfileReviewPage> {
  const { data } = await api.get(`/users/${username}/reviews`, {
    params: { page, limit },
  });
  return data.data;
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd game-gauge-web
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/profile.ts
git commit -m "feat(profiles): add profile API helpers for ratings and reviews"
```

---

## Task 5: Web — ProfileHeader + ProfileStats components

**Files:**
- Create: `game-gauge-web/src/components/profile/profile-header.tsx`
- Create: `game-gauge-web/src/components/profile/profile-stats.tsx`

### Background

`ProfileHeader` renders the avatar, name, bio, join date, and follow/edit action. It uses the existing `FollowButton` component from `src/components/social/follow-button.tsx`.

`ProfileStats` renders the stats row. Followers and Following are `<Link>` elements pointing to the dedicated pages.

Both receive their data as props — no fetching here.

- [ ] **Step 1: Create ProfileHeader**

Create `game-gauge-web/src/components/profile/profile-header.tsx`:

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { Settings, Calendar } from "lucide-react";
import { FollowButton } from "@/components/social/follow-button";

interface ProfileHeaderProps {
  profile: {
    id: string;
    username: string;
    firstName: string | null;
    lastName: string | null;
    bio: string | null;
    avatar: string | null;
    createdAt: string;
  };
  isOwnProfile: boolean;
  isFollowing: boolean;
  followerCount: number;
}

export function ProfileHeader({
  profile,
  isOwnProfile,
  isFollowing,
  followerCount,
}: ProfileHeaderProps) {
  const displayName =
    profile.firstName && profile.lastName
      ? `${profile.firstName} ${profile.lastName}`
      : profile.username;
  const initials = profile.username.substring(0, 2).toUpperCase();
  const joinYear = new Date(profile.createdAt).getFullYear();

  return (
    <div className="flex items-start gap-5 mb-8">
      {/* Avatar */}
      <div className="h-20 w-20 rounded-full bg-brand-purple/25 border-2 border-brand-purple/20 flex items-center justify-center shrink-0 overflow-hidden">
        {profile.avatar ? (
          <Image
            src={profile.avatar}
            alt={displayName}
            width={80}
            height={80}
            className="object-cover"
          />
        ) : (
          <span className="text-[22px] font-medium text-foreground/50">
            {initials}
          </span>
        )}
      </div>

      {/* Identity */}
      <div className="flex-1 min-w-0 pt-1">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[20px] font-medium tracking-tight text-foreground leading-tight">
              {displayName}
            </h1>
            {profile.firstName && profile.lastName && (
              <p className="text-[13px] text-foreground/40 mt-0.5">
                @{profile.username}
              </p>
            )}
          </div>

          {isOwnProfile ? (
            <Link
              href="/settings"
              className="flex items-center gap-1.5 text-[12px] text-foreground/40 hover:text-foreground/70 bg-card border border-brand-purple/20 hover:border-brand-purple/35 rounded-lg px-3 py-1.5 transition-all shrink-0"
            >
              <Settings className="h-3.5 w-3.5" />
              Edit profile
            </Link>
          ) : (
            <FollowButton
              username={profile.username}
              initialIsFollowing={isFollowing}
              initialFollowerCount={followerCount}
              size="sm"
            />
          )}
        </div>

        {profile.bio && (
          <p className="text-[13px] text-foreground/50 leading-relaxed mt-2 max-w-lg">
            {profile.bio}
          </p>
        )}

        <p className="flex items-center gap-1.5 text-[11px] text-foreground/25 mt-2">
          <Calendar className="h-3 w-3" />
          Member since {joinYear}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create ProfileStats**

Create `game-gauge-web/src/components/profile/profile-stats.tsx`:

```tsx
import Link from "next/link";

interface ProfileStatsProps {
  username: string;
  totalRatings: number;
  totalReviews: number;
  averageRating: number;
  publicListsCount: number;
  followerCount: number;
  followingCount: number;
}

function StatPill({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="text-center px-4 first:pl-0 last:pr-0 border-r border-brand-purple/15 last:border-0">
      <p className="text-[18px] font-medium text-foreground leading-tight tabular-nums">
        {value}
      </p>
      <p className="text-[11px] text-foreground/35 uppercase tracking-[0.06em] mt-0.5">
        {label}
      </p>
    </div>
  );
}

function LinkStatPill({
  value,
  label,
  href,
}: {
  value: number;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="text-center px-4 first:pl-0 last:pr-0 border-r border-brand-purple/15 last:border-0 hover:bg-brand-purple/5 rounded transition-colors"
    >
      <p className="text-[18px] font-medium text-brand-purple/80 leading-tight tabular-nums">
        {value}
      </p>
      <p className="text-[11px] text-foreground/35 uppercase tracking-[0.06em] mt-0.5">
        {label}
      </p>
    </Link>
  );
}

export function ProfileStats({
  username,
  totalRatings,
  totalReviews,
  averageRating,
  publicListsCount,
  followerCount,
  followingCount,
}: ProfileStatsProps) {
  return (
    <div className="flex items-center gap-0 mb-8 p-4 bg-card border border-brand-purple/15 rounded-lg">
      <StatPill value={totalRatings} label="Ratings" />
      <StatPill value={totalReviews} label="Reviews" />
      <StatPill
        value={averageRating > 0 ? averageRating.toFixed(1) : "—"}
        label="Avg score"
      />
      <StatPill value={publicListsCount} label="Lists" />
      <LinkStatPill
        value={followerCount}
        label="Followers"
        href={`/users/${username}/followers`}
      />
      <LinkStatPill
        value={followingCount}
        label="Following"
        href={`/users/${username}/following`}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd game-gauge-web
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/profile/profile-header.tsx src/components/profile/profile-stats.tsx
git commit -m "feat(profiles): add ProfileHeader and ProfileStats components"
```

---

## Task 6: Web — RatingsTab + ReviewsTab components

**Files:**
- Create: `game-gauge-web/src/components/profile/ratings-tab.tsx`
- Create: `game-gauge-web/src/components/profile/reviews-tab.tsx`

### Background

Both tabs use `IntersectionObserver` on a sentinel div to trigger infinite scroll. On mount they load page 1. When the sentinel enters the viewport and `hasMore` is true, they append the next page.

- [ ] **Step 1: Create RatingsTab**

Create `game-gauge-web/src/components/profile/ratings-tab.tsx`:

```tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { Star, Loader2 } from "lucide-react";
import { fetchUserRatings, ProfileRatingItem } from "@/lib/profile";

function timeAgo(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function RatingsTab({ username }: { username: string }) {
  const [items, setItems] = useState<ProfileRatingItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadPage = useCallback(
    async (pageNum: number) => {
      setLoading(true);
      try {
        const result = await fetchUserRatings(username, pageNum, 20);
        setItems((prev) => (pageNum === 1 ? result.items : [...prev, ...result.items]));
        setHasMore(result.hasMore);
        setPage(pageNum);
      } catch {
        // leave existing items in place on error
      } finally {
        setLoading(false);
      }
    },
    [username]
  );

  useEffect(() => {
    loadPage(1);
  }, [loadPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore && !loading) {
        loadPage(page + 1);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, page, loadPage]);

  if (!loading && items.length === 0) {
    return (
      <div className="py-14 text-center">
        <Star className="h-7 w-7 text-foreground/10 mx-auto mb-3" />
        <p className="text-[13px] text-foreground/35">No ratings yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((rating) => (
        <Link
          key={rating.id}
          href={`/games/${rating.game.slug}`}
          className="flex items-center gap-3 p-3 rounded-lg bg-card border border-brand-purple/10 hover:border-brand-purple/25 transition-colors group"
        >
          <div className="w-9 h-12 rounded overflow-hidden bg-brand-purple/10 shrink-0 relative">
            {rating.game.coverImage && (
              <Image
                src={rating.game.coverImage}
                alt={rating.game.title}
                fill
                className="object-cover"
                sizes="36px"
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-foreground/80 group-hover:text-foreground truncate transition-colors">
              {rating.game.title}
            </p>
            <p className="text-[11px] text-foreground/30 mt-0.5">
              {timeAgo(rating.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Star className="h-3 w-3 fill-brand-amber text-brand-amber" />
            <span className="text-[13px] font-medium text-brand-amber tabular-nums">
              {rating.score}
            </span>
          </div>
        </Link>
      ))}

      <div ref={sentinelRef} className="flex justify-center py-4">
        {loading && <Loader2 className="h-5 w-5 animate-spin text-foreground/20" />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create ReviewsTab**

Create `game-gauge-web/src/components/profile/reviews-tab.tsx`:

```tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { BookOpen, Loader2 } from "lucide-react";
import { fetchUserReviews, ProfileReviewItem } from "@/lib/profile";

function timeAgo(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function ReviewsTab({ username }: { username: string }) {
  const [items, setItems] = useState<ProfileReviewItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadPage = useCallback(
    async (pageNum: number) => {
      setLoading(true);
      try {
        const result = await fetchUserReviews(username, pageNum, 20);
        setItems((prev) => (pageNum === 1 ? result.items : [...prev, ...result.items]));
        setHasMore(result.hasMore);
        setPage(pageNum);
      } catch {
        // leave existing items in place on error
      } finally {
        setLoading(false);
      }
    },
    [username]
  );

  useEffect(() => {
    loadPage(1);
  }, [loadPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore && !loading) {
        loadPage(page + 1);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, page, loadPage]);

  if (!loading && items.length === 0) {
    return (
      <div className="py-14 text-center">
        <BookOpen className="h-7 w-7 text-foreground/10 mx-auto mb-3" />
        <p className="text-[13px] text-foreground/35">No reviews yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((review) => (
        <Link
          key={review.id}
          href={`/games/${review.game.slug}`}
          className="block p-4 rounded-lg bg-card border border-brand-purple/10 hover:border-brand-purple/25 transition-colors group"
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-9 rounded overflow-hidden bg-brand-purple/10 shrink-0 relative">
                {review.game.coverImage && (
                  <Image
                    src={review.game.coverImage}
                    alt={review.game.title}
                    fill
                    className="object-cover"
                    sizes="28px"
                  />
                )}
              </div>
              <p className="text-[13px] font-medium text-foreground/80 group-hover:text-foreground truncate transition-colors">
                {review.game.title}
              </p>
            </div>
            <span className="text-[11px] text-foreground/25 shrink-0">
              {timeAgo(review.createdAt)}
            </span>
          </div>

          {review.spoilers ? (
            <p className="text-[12px] text-foreground/30 italic">
              Contains spoilers — click to read
            </p>
          ) : (
            <p className="text-[12px] text-foreground/50 leading-relaxed line-clamp-2">
              {review.content}
            </p>
          )}

          {review._count.helpfulVotes > 0 && (
            <p className="text-[11px] text-foreground/25 mt-2">
              {review._count.helpfulVotes} found this helpful
            </p>
          )}
        </Link>
      ))}

      <div ref={sentinelRef} className="flex justify-center py-4">
        {loading && <Loader2 className="h-5 w-5 animate-spin text-foreground/20" />}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd game-gauge-web
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/profile/ratings-tab.tsx src/components/profile/reviews-tab.tsx
git commit -m "feat(profiles): add RatingsTab and ReviewsTab with infinite scroll"
```

---

## Task 7: Web — ActivityTab component

**Files:**
- Create: `game-gauge-web/src/components/profile/activity-tab.tsx`

### Background

Mixed format: `REVIEWED_GAME` events render as full `ActivityEventCard` components (from `src/components/social/activity-event-card.tsx`). All other event types render as compact rows. `getUserActivity` from `social.ts` is the API helper. The `ActivityEvent` and `timeAgo` types also come from `social.ts`.

- [ ] **Step 1: Create ActivityTab**

Create `game-gauge-web/src/components/profile/activity-tab.tsx`:

```tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { Activity, Loader2, Star } from "lucide-react";
import { getUserActivity, ActivityEvent, timeAgo } from "@/lib/social";
import { ActivityEventCard } from "@/components/social/activity-event-card";

const EVENT_LABELS: Partial<Record<ActivityEvent["type"], string>> = {
  RATED_GAME: "Rated",
  ADDED_TO_LIST: "Added to list",
  COMPLETED_GAME: "Completed",
  STARTED_GAME: "Started playing",
  FOLLOWED_USER: "Followed",
  CREATED_LIST: "Created list",
};

function CompactRow({ event }: { event: ActivityEvent }) {
  const label = EVENT_LABELS[event.type] ?? event.type;
  const href = event.game ? `/games/${event.game.slug}` : null;
  const score = event.meta?.score as number | undefined;
  const targetUsername = event.meta?.username as string | undefined;

  const inner = (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-card border border-brand-purple/10 hover:border-brand-purple/25 transition-colors group">
      <div className="w-9 h-12 rounded overflow-hidden bg-brand-purple/10 shrink-0 relative">
        {event.game?.coverImage && (
          <Image
            src={event.game.coverImage}
            alt={event.game.title ?? ""}
            fill
            className="object-cover"
            sizes="36px"
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-foreground/80 group-hover:text-foreground truncate transition-colors">
          {event.game?.title ?? targetUsername ?? "—"}
        </p>
        <p className="text-[11px] text-foreground/30 mt-0.5">
          {label} · {timeAgo(event.createdAt)}
        </p>
      </div>
      {event.type === "RATED_GAME" && score !== undefined && (
        <div className="flex items-center gap-1 shrink-0">
          <Star className="h-3 w-3 fill-brand-amber text-brand-amber" />
          <span className="text-[13px] font-medium text-brand-amber tabular-nums">
            {score}
          </span>
        </div>
      )}
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function ActivityTab({ username }: { username: string }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadPage = useCallback(
    async (pageNum: number) => {
      setLoading(true);
      try {
        const result = await getUserActivity(username, { page: pageNum, limit: 20 });
        setEvents((prev) =>
          pageNum === 1 ? result.events : [...prev, ...result.events]
        );
        setHasMore(result.hasMore);
        setPage(pageNum);
      } catch {
        // leave existing events in place on error
      } finally {
        setLoading(false);
      }
    },
    [username]
  );

  useEffect(() => {
    loadPage(1);
  }, [loadPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore && !loading) {
        loadPage(page + 1);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, page, loadPage]);

  if (!loading && events.length === 0) {
    return (
      <div className="py-14 text-center">
        <Activity className="h-7 w-7 text-foreground/10 mx-auto mb-3" />
        <p className="text-[13px] text-foreground/35">No activity yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {events.map((event) =>
        event.type === "REVIEWED_GAME" ? (
          <ActivityEventCard key={event.id} event={event} />
        ) : (
          <CompactRow key={event.id} event={event} />
        )
      )}

      <div ref={sentinelRef} className="flex justify-center py-4">
        {loading && <Loader2 className="h-5 w-5 animate-spin text-foreground/20" />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd game-gauge-web
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/profile/activity-tab.tsx
git commit -m "feat(profiles): add ActivityTab with mixed compact/card format"
```

---

## Task 8: Web — ListsTab component

**Files:**
- Create: `game-gauge-web/src/components/profile/lists-tab.tsx`

### Background

Uses the existing `GET /api/lists/user/:userId` endpoint which accepts `?page=N&limit=N`. The profile page already passes the user's `id` (not username) to this endpoint, so `ListsTab` receives `userId` as a prop.

- [ ] **Step 1: Create ListsTab**

Create `game-gauge-web/src/components/profile/lists-tab.tsx`:

```tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { List, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

interface GameListItem {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  createdAt: string;
  _count: { items: number };
}

export function ListsTab({ userId }: { userId: string }) {
  const [lists, setLists] = useState<GameListItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadPage = useCallback(
    async (pageNum: number) => {
      setLoading(true);
      try {
        const { data } = await api.get(`/lists/user/${userId}`, {
          params: { page: pageNum, limit: 20 },
        });
        const result = data.data;
        const newLists: GameListItem[] = Array.isArray(result)
          ? result
          : result.data ?? [];
        setLists((prev) => (pageNum === 1 ? newLists : [...prev, ...newLists]));
        setHasMore(result.hasMore ?? false);
        setPage(pageNum);
      } catch {
        // leave existing lists in place on error
      } finally {
        setLoading(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    loadPage(1);
  }, [loadPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore && !loading) {
        loadPage(page + 1);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, page, loadPage]);

  if (!loading && lists.length === 0) {
    return (
      <div className="py-14 text-center">
        <List className="h-7 w-7 text-foreground/10 mx-auto mb-3" />
        <p className="text-[13px] text-foreground/35">No public lists</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {lists.map((list) => (
        <Link
          key={list.id}
          href={`/lists/${list.id}`}
          className="flex items-center justify-between p-3.5 rounded-lg bg-card border border-brand-purple/10 hover:border-brand-purple/25 transition-colors group"
        >
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-foreground/80 group-hover:text-foreground truncate transition-colors">
              {list.name}
            </p>
            {list.description && (
              <p className="text-[11px] text-foreground/35 truncate mt-0.5">
                {list.description}
              </p>
            )}
          </div>
          <span className="text-[11px] text-foreground/30 shrink-0 ml-4">
            {list._count.items} game{list._count.items !== 1 ? "s" : ""}
          </span>
        </Link>
      ))}

      <div ref={sentinelRef} className="flex justify-center py-4">
        {loading && <Loader2 className="h-5 w-5 animate-spin text-foreground/20" />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd game-gauge-web
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/profile/lists-tab.tsx
git commit -m "feat(profiles): add ListsTab with infinite scroll"
```

---

## Task 9: Web — FollowUserRow + followers/following pages

**Files:**
- Create: `game-gauge-web/src/components/profile/follow-user-row.tsx`
- Create: `game-gauge-web/src/app/(main)/users/[username]/followers/page.tsx`
- Create: `game-gauge-web/src/app/(main)/users/[username]/following/page.tsx`

### Background

`getFollowers` and `getFollowing` already exist in `src/lib/social.ts`. `FollowUser` type (with optional `isFollowing`) also exists there. `FollowButton` from `src/components/social/follow-button.tsx` handles the follow/unfollow action.

The followers/following pages share the same structure: load profile for the header, then paginate the list with infinite scroll.

- [ ] **Step 1: Create FollowUserRow**

Create `game-gauge-web/src/components/profile/follow-user-row.tsx`:

```tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { FollowButton } from "@/components/social/follow-button";
import { FollowUser } from "@/lib/social";

interface FollowUserRowProps {
  user: FollowUser;
  showFollowButton: boolean;
}

export function FollowUserRow({ user, showFollowButton }: FollowUserRowProps) {
  const initials = user.username.substring(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-card border border-brand-purple/10">
      <Link href={`/users/${user.username}`} className="shrink-0">
        <div className="h-9 w-9 rounded-full bg-brand-purple/25 border border-brand-purple/20 flex items-center justify-center overflow-hidden">
          {user.avatar ? (
            <Image
              src={user.avatar}
              alt={user.username}
              width={36}
              height={36}
              className="object-cover"
            />
          ) : (
            <span className="text-[12px] font-medium text-foreground/50">
              {initials}
            </span>
          )}
        </div>
      </Link>

      <div className="flex-1 min-w-0">
        <Link href={`/users/${user.username}`}>
          <p className="text-[13px] font-medium text-foreground/80 hover:text-foreground truncate transition-colors">
            {user.username}
          </p>
        </Link>
        {user.bio && (
          <p className="text-[11px] text-foreground/35 truncate mt-0.5">
            {user.bio}
          </p>
        )}
      </div>

      {showFollowButton && (
        <FollowButton
          username={user.username}
          initialIsFollowing={user.isFollowing ?? false}
          initialFollowerCount={0}
          size="sm"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the followers page**

Create `game-gauge-web/src/app/(main)/users/[username]/followers/page.tsx`:

```tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { MainLayout } from "@/components/layout/main-layout";
import { FollowUserRow } from "@/components/profile/follow-user-row";
import { useAuthStore } from "@/store/auth";
import { getFollowers, FollowUser } from "@/lib/social";
import { api } from "@/lib/api";
import { ChevronLeft, Users, Loader2 } from "lucide-react";

export default function FollowersPage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;
  const { user: currentUser } = useAuthStore();

  const [profileId, setProfileId] = useState<string | null>(null);
  const [followers, setFollowers] = useState<FollowUser[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Load profile to get the ID (needed to check isOwnProfile)
  useEffect(() => {
    api
      .get(`/users/${username}`)
      .then((res) => setProfileId(res.data.data.id))
      .catch(() => router.back());
  }, [username, router]);

  const loadPage = useCallback(
    async (pageNum: number) => {
      setLoading(true);
      try {
        const result = await getFollowers(username, { page: pageNum, limit: 20 });
        setFollowers((prev) =>
          pageNum === 1 ? result.users : [...prev, ...result.users]
        );
        setHasMore(result.hasMore);
        setPage(pageNum);
      } catch {
        // leave existing list in place
      } finally {
        setLoading(false);
      }
    },
    [username]
  );

  useEffect(() => {
    loadPage(1);
  }, [loadPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore && !loading) {
        loadPage(page + 1);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, page, loadPage]);

  const isOwnProfile = profileId != null && currentUser?.id === profileId;

  return (
    <MainLayout>
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-2xl">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-[12px] text-foreground/30 hover:text-foreground/60 transition-colors mb-6"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          @{username}
        </button>

        <h1 className="text-[18px] font-medium tracking-tight text-foreground mb-6">
          Followers
        </h1>

        {!loading && followers.length === 0 ? (
          <div className="py-14 text-center">
            <Users className="h-7 w-7 text-foreground/10 mx-auto mb-3" />
            <p className="text-[13px] text-foreground/35">No followers yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {followers.map((user) => (
              <FollowUserRow
                key={user.id}
                user={user}
                showFollowButton={!isOwnProfile && currentUser?.username !== user.username}
              />
            ))}
            <div ref={sentinelRef} className="flex justify-center py-4">
              {loading && (
                <Loader2 className="h-5 w-5 animate-spin text-foreground/20" />
              )}
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
```

- [ ] **Step 3: Create the following page**

Create `game-gauge-web/src/app/(main)/users/[username]/following/page.tsx`:

```tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { MainLayout } from "@/components/layout/main-layout";
import { FollowUserRow } from "@/components/profile/follow-user-row";
import { useAuthStore } from "@/store/auth";
import { getFollowing, FollowUser } from "@/lib/social";
import { api } from "@/lib/api";
import { ChevronLeft, Users, Loader2 } from "lucide-react";

export default function FollowingPage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;
  const { user: currentUser } = useAuthStore();

  const [profileId, setProfileId] = useState<string | null>(null);
  const [following, setFollowing] = useState<FollowUser[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .get(`/users/${username}`)
      .then((res) => setProfileId(res.data.data.id))
      .catch(() => router.back());
  }, [username, router]);

  const loadPage = useCallback(
    async (pageNum: number) => {
      setLoading(true);
      try {
        const result = await getFollowing(username, { page: pageNum, limit: 20 });
        setFollowing((prev) =>
          pageNum === 1 ? result.users : [...prev, ...result.users]
        );
        setHasMore(result.hasMore);
        setPage(pageNum);
      } catch {
        // leave existing list in place
      } finally {
        setLoading(false);
      }
    },
    [username]
  );

  useEffect(() => {
    loadPage(1);
  }, [loadPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore && !loading) {
        loadPage(page + 1);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, page, loadPage]);

  const isOwnProfile = profileId != null && currentUser?.id === profileId;

  return (
    <MainLayout>
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-2xl">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-[12px] text-foreground/30 hover:text-foreground/60 transition-colors mb-6"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          @{username}
        </button>

        <h1 className="text-[18px] font-medium tracking-tight text-foreground mb-6">
          Following
        </h1>

        {!loading && following.length === 0 ? (
          <div className="py-14 text-center">
            <Users className="h-7 w-7 text-foreground/10 mx-auto mb-3" />
            <p className="text-[13px] text-foreground/35">Not following anyone yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {following.map((user) => (
              <FollowUserRow
                key={user.id}
                user={user}
                showFollowButton={!isOwnProfile && currentUser?.username !== user.username}
              />
            ))}
            <div ref={sentinelRef} className="flex justify-center py-4">
              {loading && (
                <Loader2 className="h-5 w-5 animate-spin text-foreground/20" />
              )}
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd game-gauge-web
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/follow-user-row.tsx \
        src/app/\(main\)/users/\[username\]/followers/page.tsx \
        src/app/\(main\)/users/\[username\]/following/page.tsx
git commit -m "feat(profiles): add FollowUserRow and followers/following pages"
```

---

## Task 10: Web — Refactor profile page

**Files:**
- Modify: `game-gauge-web/src/app/(main)/users/[username]/page.tsx`

### Background

Replace the existing 568-line page with a clean version that:
1. Fetches profile + stats in parallel (same as before)
2. Passes follow state to `ProfileHeader` (uses `isFollowing` + `followerCount` from stats)
3. Uses `ProfileStats` with follower/following counts
4. Renders `RatingsTab`, `ReviewsTab`, `ActivityTab`, `ListsTab` — each does its own data fetching
5. Removes the old inline `StatPill`, `TabButton`, `RatingsTab`, `ReviewsTab`, `ListsTab`, `timeAgo` helpers
6. Adds the Activity tab between Reviews and Lists

The stats endpoint already returns `followerCount`, `followingCount`, `isFollowing` from `followService.getFollowStats`.

- [ ] **Step 1: Replace the profile page**

Overwrite `game-gauge-web/src/app/(main)/users/[username]/page.tsx` with:

```tsx
"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { MainLayout } from "@/components/layout/main-layout";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileStats } from "@/components/profile/profile-stats";
import { RatingsTab } from "@/components/profile/ratings-tab";
import { ReviewsTab } from "@/components/profile/reviews-tab";
import { ActivityTab } from "@/components/profile/activity-tab";
import { ListsTab } from "@/components/profile/lists-tab";
import { useAuthStore } from "@/store/auth";
import { api } from "@/lib/api";
import { Star, BookOpen, Activity, List, ChevronLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Tab = "ratings" | "reviews" | "activity" | "lists";

interface UserProfile {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  bio: string | null;
  avatar: string | null;
  createdAt: string;
}

interface UserStats {
  totalRatings: number;
  totalReviews: number;
  totalLists: number;
  averageRating: number;
  publicListsCount: number;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] border-b-2 -mb-px transition-colors ${
        active
          ? "border-brand-amber text-foreground/90 font-medium"
          : "border-transparent text-foreground/40 hover:text-foreground/70"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { user: currentUser } = useAuthStore();
  const username = params.username as string;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("ratings");

  const isOwnProfile = currentUser?.username === username;

  useEffect(() => {
    setIsLoading(true);
    setError("");
    Promise.all([
      api.get(`/users/${username}`),
      api.get(`/users/${username}/stats`),
    ])
      .then(([profileRes, statsRes]) => {
        setProfile(profileRes.data.data);
        setStats(statsRes.data.data);
      })
      .catch((err: unknown) => {
        const msg =
          (err as { response?: { data?: { error?: { message?: string } } } })
            ?.response?.data?.error?.message ?? "Failed to load profile";
        setError(msg);
        toast.error("Failed to load profile");
      })
      .finally(() => setIsLoading(false));
  }, [username]);

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-7 w-7 animate-spin text-foreground/20" />
        </div>
      </MainLayout>
    );
  }

  if (error || !profile || !stats) {
    return (
      <MainLayout>
        <div className="container mx-auto px-4 py-20 text-center">
          <p className="text-[14px] text-foreground/40 mb-4">
            {error || "This user couldn't be found."}
          </p>
          <button
            onClick={() => router.back()}
            className="text-[13px] text-brand-purple hover:text-foreground/70 transition-colors"
          >
            ← Go back
          </button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-4xl">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-[12px] text-foreground/30 hover:text-foreground/60 transition-colors mb-8"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back
        </button>

        <ProfileHeader
          profile={profile}
          isOwnProfile={isOwnProfile}
          isFollowing={stats.isFollowing}
          followerCount={stats.followerCount}
        />

        <ProfileStats
          username={username}
          totalRatings={stats.totalRatings}
          totalReviews={stats.totalReviews}
          averageRating={stats.averageRating}
          publicListsCount={stats.publicListsCount}
          followerCount={stats.followerCount}
          followingCount={stats.followingCount}
        />

        {/* Tabs */}
        <div className="flex items-center border-b border-brand-purple/15 mb-6">
          <TabButton
            active={activeTab === "ratings"}
            onClick={() => setActiveTab("ratings")}
            icon={<Star className="h-3.5 w-3.5" />}
            label="Ratings"
          />
          <TabButton
            active={activeTab === "reviews"}
            onClick={() => setActiveTab("reviews")}
            icon={<BookOpen className="h-3.5 w-3.5" />}
            label="Reviews"
          />
          <TabButton
            active={activeTab === "activity"}
            onClick={() => setActiveTab("activity")}
            icon={<Activity className="h-3.5 w-3.5" />}
            label="Activity"
          />
          <TabButton
            active={activeTab === "lists"}
            onClick={() => setActiveTab("lists")}
            icon={<List className="h-3.5 w-3.5" />}
            label="Lists"
          />
        </div>

        {activeTab === "ratings" && <RatingsTab username={username} />}
        {activeTab === "reviews" && <ReviewsTab username={username} />}
        {activeTab === "activity" && <ActivityTab username={username} />}
        {activeTab === "lists" && <ListsTab userId={profile.id} />}
      </div>
    </MainLayout>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd game-gauge-web
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Smoke test in browser**

Start both servers:
```bash
# Terminal 1 — API
cd game-gauge-api && npm run dev

# Terminal 2 — Web
cd game-gauge-web && npm run dev
```

Navigate to `http://localhost:3001/users/<any-username>`. Verify:
- Profile header loads with correct name/bio/avatar
- Stats row shows Ratings, Reviews, Avg, Lists, Followers (clickable), Following (clickable)
- All four tabs switch correctly
- Ratings tab shows the viewed user's ratings (not your own)
- Reviews tab shows the viewed user's reviews
- Activity tab shows mixed format (compact rows + full cards for reviews)
- Lists tab shows public lists
- Follow/Unfollow button works for other users' profiles
- Clicking "Followers" → navigates to `/users/:username/followers`
- Clicking "Following" → navigates to `/users/:username/following`
- Both follower/following pages load correctly with infinite scroll

- [ ] **Step 4: Commit**

```bash
cd game-gauge-web
git add src/app/\(main\)/users/\[username\]/page.tsx
git commit -m "feat(profiles): refactor profile page to use decomposed components"
```

---

## Summary

| Task | Scope | Key Deliverable |
|---|---|---|
| 1 | API | `findByUserProfile` on RatingRepository + `getUserRatings` service |
| 2 | API | `findByUserProfile` on ReviewRepository + `getUserReviews` service |
| 3 | API | Controller + routes for `/users/:username/ratings` and `/reviews` |
| 4 | Web | `src/lib/profile.ts` typed API helpers |
| 5 | Web | `ProfileHeader` + `ProfileStats` components |
| 6 | Web | `RatingsTab` + `ReviewsTab` with infinite scroll |
| 7 | Web | `ActivityTab` with mixed format infinite scroll |
| 8 | Web | `ListsTab` with infinite scroll |
| 9 | Web | `FollowUserRow` + followers/following pages |
| 10 | Web | Refactored profile page |
