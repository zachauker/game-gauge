# List Reorder, Sort & Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users drag-and-drop reorder any list, sort it (Title / Date added / Progress % / Release date / Your rating), and filter it (search, genre, platform, completion status) — phase 1 of the list-improvements initiative.

**Architecture:** Backend adds two columns (`sortBy`, `sortDir`) to `GameList`, persisted via the existing `PATCH /lists/:id` endpoint, and extends the list-fetch query to include `genres`/`platforms`/per-viewer `rating` on each item's game. The existing-but-unused `order` field and `POST /lists/:id/reorder` endpoint now get wired to a drag-and-drop UI. Sorting and filtering of the fetched items happens entirely client-side via pure utility functions.

**Tech Stack:** Express + Prisma + Zod + Jest (backend, `game-gauge-api`); Next.js 16 + React 19 + Vitest + Testing Library (frontend, `game-gauge-web`); `@dnd-kit/core` + `@dnd-kit/sortable` (new dependency) for drag-and-drop.

**Spec:** `docs/superpowers/specs/2026-06-30-list-reorder-sort-filter-design.md`

---

## Task 1: Add `sortBy`/`sortDir` columns to `GameList`

**Files:**
- Modify: `game-gauge-api/prisma/schema.prisma`

- [ ] **Step 1: Add the columns to the schema**

In `game-gauge-api/prisma/schema.prisma`, find the `GameList` model:

```prisma
model GameList {
  id          String  @id @default(uuid())
  name        String
  description String?
  isPublic    Boolean @default(false)
  listType    String  @default("custom")
  isDefault   Boolean @default(false)
```

Add two fields right after `isDefault`:

```prisma
model GameList {
  id          String  @id @default(uuid())
  name        String
  description String?
  isPublic    Boolean @default(false)
  listType    String  @default("custom")
  isDefault   Boolean @default(false)
  sortBy      String  @default("custom")
  sortDir     String  @default("asc")
```

- [ ] **Step 2: Generate and apply the migration**

Run from `game-gauge-api/`:

```bash
npx prisma migrate dev --name add_list_sort_fields
```

Expected: a new directory under `prisma/migrations/` containing the `ALTER TABLE "GameList" ADD COLUMN ...` SQL, and the command exits 0. This also regenerates the Prisma client, so `GameList.sortBy`/`sortDir` become available on `prisma.gameList` types.

- [ ] **Step 3: Commit**

```bash
cd game-gauge-api
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(lists): add sortBy/sortDir columns to GameList"
```

---

## Task 2: Accept `sortBy`/`sortDir` on list update

**Files:**
- Modify: `game-gauge-api/src/validators/list.validator.ts`
- Test: `game-gauge-api/src/__tests__/services/list.service.test.ts`

- [ ] **Step 1: Write the failing test**

In `game-gauge-api/src/__tests__/services/list.service.test.ts`, inside the existing `describe('update', ...)` block (around line 206), add a new test right after the `'should update list successfully'` test:

```typescript
    it('should persist sortBy and sortDir', async () => {
      // Arrange
      const sortUpdate = { sortBy: 'title', sortDir: 'desc' as const };
      const updatedList = { ...testList, ...sortUpdate };
      (prisma.gameList.findUnique as jest.Mock).mockResolvedValue(testList);
      (prisma.gameList.update as jest.Mock).mockResolvedValue(updatedList);

      // Act
      const result = await listService.update(testList.id, testUser.id, sortUpdate);

      // Assert
      expect(prisma.gameList.update).toHaveBeenCalledWith({
        where: { id: testList.id },
        data: sortUpdate,
      });
      expect(result.sortBy).toBe('title');
      expect(result.sortDir).toBe('desc');
    });

    it('should reject an invalid sortBy value at the validator level', () => {
      expect(() => updateListSchema.parse({ sortBy: 'not-a-real-field' })).toThrow();
    });
```

Add the `updateListSchema` import at the top of the file, next to the existing imports:

```typescript
import { updateListSchema } from '../../validators/list.validator';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd game-gauge-api && npx jest list.service.test.ts -t "sortBy and sortDir"`
Expected: FAIL — `updateListSchema` strips unknown keys silently (no throw) and/or `prisma.gameList.update` isn't called with `sortBy`/`sortDir` since the validator doesn't define those fields yet.

- [ ] **Step 3: Extend the validator**

In `game-gauge-api/src/validators/list.validator.ts`, add a shared enum near the top (after the `COMPLETION_TYPES` export):

```typescript
export const LIST_SORT_BY = ['custom', 'title', 'dateAdded', 'progress', 'releaseDate', 'rating'] as const;
export type ListSortBy = (typeof LIST_SORT_BY)[number];

export const LIST_SORT_DIR = ['asc', 'desc'] as const;
export type ListSortDir = (typeof LIST_SORT_DIR)[number];
```

Then extend `updateListSchema`:

```typescript
export const updateListSchema = z.object({
  name: z
    .string()
    .min(1, 'List name cannot be empty')
    .max(100, 'List name must be less than 100 characters')
    .trim()
    .optional(),
  description: z
    .string()
    .max(500, 'Description must be less than 500 characters')
    .trim()
    .optional(),
  isPublic: z.boolean().optional(),
  sortBy: z.enum(LIST_SORT_BY, {
    errorMap: () => ({
      message: `sortBy must be one of: ${LIST_SORT_BY.join(', ')}`,
    }),
  }).optional(),
  sortDir: z.enum(LIST_SORT_DIR, {
    errorMap: () => ({ message: 'sortDir must be "asc" or "desc"' }),
  }).optional(),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd game-gauge-api && npx jest list.service.test.ts -t "sortBy and sortDir"`
Expected: PASS

- [ ] **Step 5: Run the full backend test suite**

Run: `cd game-gauge-api && npx jest`
Expected: PASS (no regressions in existing list/other tests)

- [ ] **Step 6: Commit**

```bash
cd game-gauge-api
git add src/validators/list.validator.ts src/__tests__/services/list.service.test.ts
git commit -m "feat(lists): accept sortBy/sortDir on PATCH /lists/:id"
```

---

## Task 3: Include genres/platforms/per-viewer rating in list fetch

**Files:**
- Modify: `game-gauge-api/src/repositories/list.repository.ts`
- Modify: `game-gauge-api/src/services/list.service.ts`
- Test: `game-gauge-api/src/__tests__/services/list.service.test.ts`

- [ ] **Step 1: Write the failing test**

In `game-gauge-api/src/__tests__/services/list.service.test.ts`, inside `describe('findById', ...)` (around line 92), add:

```typescript
    it('passes the viewer id through so per-viewer rating data is fetched', async () => {
      // Arrange
      (prisma.gameList.findUnique as jest.Mock).mockResolvedValue(testList);

      // Act
      await listService.findById(testList.id, 'viewer-id');

      // Assert
      expect(prisma.gameList.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: testList.id },
          include: expect.objectContaining({
            items: expect.objectContaining({
              include: expect.objectContaining({
                game: expect.objectContaining({
                  select: expect.objectContaining({
                    genres: true,
                    platforms: true,
                    ratings: { where: { userId: 'viewer-id' }, select: { score: true }, take: 1 },
                  }),
                }),
              }),
            }),
          }),
        })
      );
    });

    it('omits the ratings include when there is no viewer (anonymous request)', async () => {
      // Arrange
      (prisma.gameList.findUnique as jest.Mock).mockResolvedValue(testList);

      // Act
      await listService.findById(testList.id, undefined);

      // Assert
      expect(prisma.gameList.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            items: expect.objectContaining({
              include: expect.objectContaining({
                game: expect.objectContaining({
                  select: expect.objectContaining({ ratings: false }),
                }),
              }),
            }),
          }),
        })
      );
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd game-gauge-api && npx jest list.service.test.ts -t "viewer"`
Expected: FAIL — current `findById` select only includes `id, title, slug, coverImage, releaseDate` and never includes `ratings`.

- [ ] **Step 3: Update the repository**

In `game-gauge-api/src/repositories/list.repository.ts`, update the `ListWithItems` interface (lines 4-19):

```typescript
export interface ListWithItems extends GameList {
  items: Array<
    GameListItem & {
      game: {
        id: string;
        title: string;
        slug: string;
        coverImage: string | null;
        releaseDate: Date | null;
        genres: string[];
        platforms: string[];
        ratings?: { score: number }[];
      };
    }
  >;
  _count: {
    items: number;
  };
}
```

Update `findById` (lines 55-80) to accept an optional `viewerUserId` and build the `game.select` accordingly:

```typescript
  /**
   * Find list by ID. When viewerUserId is provided, also fetches that
   * viewer's own rating for each game (used for "sort by your rating").
   */
  async findById(id: string, viewerUserId?: string): Promise<ListWithItems | null> {
    return prisma.gameList.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { order: 'asc' },
          include: {
            game: {
              select: {
                id: true,
                title: true,
                slug: true,
                coverImage: true,
                releaseDate: true,
                genres: true,
                platforms: true,
                ratings: viewerUserId
                  ? { where: { userId: viewerUserId }, select: { score: true }, take: 1 }
                  : false,
              },
            },
          },
        },
        _count: {
          select: {
            items: true,
          },
        },
      },
    });
  }
```

- [ ] **Step 4: Update the service to pass the viewer id through**

In `game-gauge-api/src/services/list.service.ts`, update `findById` (lines 53-62):

```typescript
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

(No other `listRepository.findById(listId)` call sites need the second argument — they're ownership checks that don't render game data to a viewer.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd game-gauge-api && npx jest list.service.test.ts`
Expected: PASS (all `findById` tests, including the two new ones)

- [ ] **Step 6: Run the full backend test suite**

Run: `cd game-gauge-api && npx jest`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd game-gauge-api
git add src/repositories/list.repository.ts src/services/list.service.ts src/__tests__/services/list.service.test.ts
git commit -m "feat(lists): include genres/platforms/per-viewer rating in list fetch"
```

---

## Task 4: Frontend types and API helpers

**Files:**
- Modify: `game-gauge-web/src/lib/api.ts`
- Modify: `game-gauge-web/src/lib/lists.ts`

- [ ] **Step 1: Extend `GameList` and `GameListItem` types**

In `game-gauge-web/src/lib/api.ts`, add a `ListSortBy`/`ListSortDir` type and extend `GameList` (around line 179) and `GameListItem.game` (around line 200):

```typescript
export type ListSortBy = "custom" | "title" | "dateAdded" | "progress" | "releaseDate" | "rating";
export type ListSortDir = "asc" | "desc";

// List types
export interface GameList {
  id: string;
  name: string;
  description?: string;
  isPublic: boolean;
  isDefault: boolean;
  listType: ListType;
  sortBy: ListSortBy;
  sortDir: ListSortDir;
  userId: string;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    username: string;
    avatar?: string;
  };
  items?: GameListItem[];
  _count?: {
    items: number;
  };
}

export interface GameListItem {
  id: string;
  listId: string;
  gameId: string;
  notes?: string;
  order: number;
  progressPct?: number | null;
  progressNote?: string | null;
  completedAt?: string | null;
  completionType?: string | null;
  steamAchievements?: SteamAchievements | null;
  createdAt: string;
  game?: {
    id: string;
    title: string;
    slug: string;
    coverImage?: string;
    releaseDate?: string;
    genres?: string[];
    platforms?: string[];
    ratings?: { score: number }[];
  };
}
```

- [ ] **Step 2: Extend `updateList` and add `reorderListItems` in `lib/lists.ts`**

In `game-gauge-web/src/lib/lists.ts`, update the imports and the `updateList`/reorder section:

```typescript
import { api } from "@/lib/api";
import type { GameList, GameListItem, DefaultLists, ListSortBy, ListSortDir } from "@/lib/api";
```

Replace `updateList` (lines 43-49):

```typescript
export async function updateList(
  listId: string,
  payload: {
    name?: string;
    description?: string;
    isPublic?: boolean;
    sortBy?: ListSortBy;
    sortDir?: ListSortDir;
  }
): Promise<GameList> {
  const { data } = await api.patch(`/lists/${listId}`, payload);
  return data.data;
}
```

Add a new helper near the bottom of the "List item operations" section (after `updateListItem`, around line 87):

```typescript
export async function reorderListItems(
  listId: string,
  items: Array<{ id: string; order: number }>
): Promise<void> {
  await api.post(`/lists/${listId}/reorder`, { items });
}
```

- [ ] **Step 3: Type-check**

Run: `cd game-gauge-web && npm run type-check`
Expected: PASS (existing callers of `updateList` only pass `name`/`description`/`isPublic`, which remain valid since the new fields are optional)

- [ ] **Step 4: Commit**

```bash
cd game-gauge-web
git add src/lib/api.ts src/lib/lists.ts
git commit -m "feat(lists): add sort fields to list types and API helpers"
```

---

## Task 5: Pure sort/filter utility

**Files:**
- Create: `game-gauge-web/src/lib/list-sort-filter.ts`
- Test: `game-gauge-web/src/lib/__tests__/list-sort-filter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `game-gauge-web/src/lib/__tests__/list-sort-filter.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  sortListItems,
  filterListItems,
  DEFAULT_LIST_FILTER_STATE,
} from "../list-sort-filter";
import type { GameListItem } from "@/lib/api";

function makeItem(overrides: Partial<GameListItem>): GameListItem {
  return {
    id: overrides.id ?? "item-1",
    listId: "list-1",
    gameId: overrides.gameId ?? "game-1",
    order: overrides.order ?? 0,
    progressPct: overrides.progressPct,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    game: {
      id: overrides.gameId ?? "game-1",
      title: "Untitled",
      slug: "untitled",
      genres: [],
      platforms: [],
      ratings: [],
      ...overrides.game,
    },
    ...overrides,
  };
}

describe("sortListItems", () => {
  it("sorts by custom order ascending by item.order", () => {
    const items = [
      makeItem({ id: "a", order: 2 }),
      makeItem({ id: "b", order: 0 }),
      makeItem({ id: "c", order: 1 }),
    ];
    const result = sortListItems(items, "custom", "asc");
    expect(result.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by title A-Z", () => {
    const items = [
      makeItem({ id: "a", game: { id: "g1", title: "Zelda", slug: "z", genres: [], platforms: [] } }),
      makeItem({ id: "b", game: { id: "g2", title: "Alan Wake", slug: "a", genres: [], platforms: [] } }),
    ];
    const result = sortListItems(items, "title", "asc");
    expect(result.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("sorts by progress descending", () => {
    const items = [
      makeItem({ id: "a", progressPct: 20 }),
      makeItem({ id: "b", progressPct: 90 }),
      makeItem({ id: "c", progressPct: 50 }),
    ];
    const result = sortListItems(items, "progress", "desc");
    expect(result.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by your rating, treating missing ratings as 0", () => {
    const items = [
      makeItem({ id: "a", game: { id: "g1", title: "A", slug: "a", genres: [], platforms: [], ratings: [{ score: 7 }] } }),
      makeItem({ id: "b", game: { id: "g2", title: "B", slug: "b", genres: [], platforms: [], ratings: [] } }),
      makeItem({ id: "c", game: { id: "g3", title: "C", slug: "c", genres: [], platforms: [], ratings: [{ score: 9 }] } }),
    ];
    const result = sortListItems(items, "rating", "desc");
    expect(result.map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("sorts by release date ascending, treating missing dates as earliest", () => {
    const items = [
      makeItem({ id: "a", game: { id: "g1", title: "A", slug: "a", genres: [], platforms: [], releaseDate: "2020-01-01" } }),
      makeItem({ id: "b", game: { id: "g2", title: "B", slug: "b", genres: [], platforms: [] } }),
      makeItem({ id: "c", game: { id: "g3", title: "C", slug: "c", genres: [], platforms: [], releaseDate: "2010-01-01" } }),
    ];
    const result = sortListItems(items, "releaseDate", "asc");
    expect(result.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });
});

describe("filterListItems", () => {
  const items = [
    makeItem({
      id: "a",
      progressPct: 0,
      game: { id: "g1", title: "Hollow Knight", slug: "hk", genres: ["Metroidvania"], platforms: ["PC"] },
    }),
    makeItem({
      id: "b",
      progressPct: 100,
      game: { id: "g2", title: "Hades", slug: "hades", genres: ["Roguelike"], platforms: ["PC", "Switch"] },
    }),
    makeItem({
      id: "c",
      progressPct: 50,
      game: { id: "g3", title: "Celeste", slug: "celeste", genres: ["Platformer"], platforms: ["Switch"] },
    }),
  ];

  it("returns everything when filters are at default", () => {
    expect(filterListItems(items, DEFAULT_LIST_FILTER_STATE)).toHaveLength(3);
  });

  it("filters by case-insensitive title search", () => {
    const result = filterListItems(items, { ...DEFAULT_LIST_FILTER_STATE, search: "hol" });
    expect(result.map((i) => i.id)).toEqual(["a"]);
  });

  it("filters by genre (any match)", () => {
    const result = filterListItems(items, { ...DEFAULT_LIST_FILTER_STATE, genres: ["Roguelike"] });
    expect(result.map((i) => i.id)).toEqual(["b"]);
  });

  it("filters by platform (any match)", () => {
    const result = filterListItems(items, { ...DEFAULT_LIST_FILTER_STATE, platforms: ["Switch"] });
    expect(result.map((i) => i.id)).toEqual(["b", "c"]);
  });

  it("filters by completion status", () => {
    expect(
      filterListItems(items, { ...DEFAULT_LIST_FILTER_STATE, status: "completed" }).map((i) => i.id)
    ).toEqual(["b"]);
    expect(
      filterListItems(items, { ...DEFAULT_LIST_FILTER_STATE, status: "not_started" }).map((i) => i.id)
    ).toEqual(["a"]);
    expect(
      filterListItems(items, { ...DEFAULT_LIST_FILTER_STATE, status: "in_progress" }).map((i) => i.id)
    ).toEqual(["c"]);
  });

  it("combines search and genre filters", () => {
    const result = filterListItems(items, {
      ...DEFAULT_LIST_FILTER_STATE,
      search: "ce",
      genres: ["Platformer"],
    });
    expect(result.map((i) => i.id)).toEqual(["c"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd game-gauge-web && npx vitest run src/lib/__tests__/list-sort-filter.test.ts`
Expected: FAIL — `../list-sort-filter` module does not exist yet.

- [ ] **Step 3: Implement the utility**

Create `game-gauge-web/src/lib/list-sort-filter.ts`:

```typescript
/**
 * src/lib/list-sort-filter.ts
 *
 * Pure client-side sort/filter helpers for list detail pages.
 * Sorting mirrors GameList.sortBy/sortDir (persisted server-side);
 * filtering is transient UI state, never sent to the server.
 */

import type { GameListItem } from "@/lib/api";
import type { ListSortBy, ListSortDir } from "@/lib/api";

export type SortBy = ListSortBy;
export type SortDir = ListSortDir;

export type ListStatusFilter = "all" | "not_started" | "in_progress" | "completed";

export interface ListFilterState {
  search: string;
  genres: string[];
  platforms: string[];
  status: ListStatusFilter;
}

export const DEFAULT_LIST_FILTER_STATE: ListFilterState = {
  search: "",
  genres: [],
  platforms: [],
  status: "all",
};

export function sortListItems(
  items: GameListItem[],
  sortBy: SortBy,
  sortDir: SortDir
): GameListItem[] {
  if (sortBy === "custom") {
    return [...items].sort((a, b) => a.order - b.order);
  }

  const dir = sortDir === "asc" ? 1 : -1;

  return [...items].sort((a, b) => {
    switch (sortBy) {
      case "title":
        return (a.game?.title ?? "").localeCompare(b.game?.title ?? "") * dir;
      case "dateAdded":
        return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
      case "progress":
        return ((a.progressPct ?? 0) - (b.progressPct ?? 0)) * dir;
      case "releaseDate": {
        const aTime = a.game?.releaseDate ? new Date(a.game.releaseDate).getTime() : 0;
        const bTime = b.game?.releaseDate ? new Date(b.game.releaseDate).getTime() : 0;
        return (aTime - bTime) * dir;
      }
      case "rating": {
        const aScore = a.game?.ratings?.[0]?.score ?? 0;
        const bScore = b.game?.ratings?.[0]?.score ?? 0;
        return (aScore - bScore) * dir;
      }
      default:
        return 0;
    }
  });
}

export function filterListItems(
  items: GameListItem[],
  filters: ListFilterState
): GameListItem[] {
  const search = filters.search.trim().toLowerCase();

  return items.filter((item) => {
    if (search && !(item.game?.title ?? "").toLowerCase().includes(search)) {
      return false;
    }

    if (filters.genres.length > 0) {
      const itemGenres = item.game?.genres ?? [];
      if (!filters.genres.some((g) => itemGenres.includes(g))) return false;
    }

    if (filters.platforms.length > 0) {
      const itemPlatforms = item.game?.platforms ?? [];
      if (!filters.platforms.some((p) => itemPlatforms.includes(p))) return false;
    }

    if (filters.status !== "all") {
      const pct = item.progressPct ?? 0;
      if (filters.status === "not_started" && pct !== 0) return false;
      if (filters.status === "in_progress" && (pct === 0 || pct === 100)) return false;
      if (filters.status === "completed" && pct !== 100) return false;
    }

    return true;
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd game-gauge-web && npx vitest run src/lib/__tests__/list-sort-filter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd game-gauge-web
git add src/lib/list-sort-filter.ts src/lib/__tests__/list-sort-filter.test.ts
git commit -m "feat(lists): add pure sort/filter utility for list items"
```

---

## Task 6: `ListToolbar` component

**Files:**
- Create: `game-gauge-web/src/components/lists/list-toolbar.tsx`
- Test: `game-gauge-web/src/components/lists/__tests__/list-toolbar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `game-gauge-web/src/components/lists/__tests__/list-toolbar.test.tsx`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ListToolbar } from "../list-toolbar";
import { DEFAULT_LIST_FILTER_STATE } from "@/lib/list-sort-filter";

afterEach(cleanup);

const defaultProps = {
  search: "",
  onSearchChange: vi.fn(),
  sortBy: "custom" as const,
  sortDir: "asc" as const,
  onSortChange: vi.fn(),
  availableGenres: ["Action", "RPG"],
  availablePlatforms: ["PC", "Switch"],
  selectedGenres: DEFAULT_LIST_FILTER_STATE.genres,
  onGenresChange: vi.fn(),
  selectedPlatforms: DEFAULT_LIST_FILTER_STATE.platforms,
  onPlatformsChange: vi.fn(),
  showStatusFilter: true,
  status: DEFAULT_LIST_FILTER_STATE.status,
  onStatusChange: vi.fn(),
};

describe("ListToolbar", () => {
  it("calls onSearchChange as the user types", () => {
    const onSearchChange = vi.fn();
    render(<ListToolbar {...defaultProps} onSearchChange={onSearchChange} />);
    fireEvent.change(screen.getByPlaceholderText("Search this list..."), {
      target: { value: "hades" },
    });
    expect(onSearchChange).toHaveBeenCalledWith("hades");
  });

  it("does not show a direction toggle when sort is custom", () => {
    render(<ListToolbar {...defaultProps} sortBy="custom" />);
    expect(screen.queryByLabelText(/Sort (ascending|descending)/)).toBeNull();
  });

  it("shows a direction toggle when a non-custom sort is active", () => {
    render(<ListToolbar {...defaultProps} sortBy="title" sortDir="asc" />);
    expect(screen.getByLabelText("Sort descending")).toBeDefined();
  });

  it("toggles sort direction when the direction button is clicked", () => {
    const onSortChange = vi.fn();
    render(<ListToolbar {...defaultProps} sortBy="title" sortDir="asc" onSortChange={onSortChange} />);
    fireEvent.click(screen.getByLabelText("Sort descending"));
    expect(onSortChange).toHaveBeenCalledWith("title", "desc");
  });

  it("toggles a genre on and off via onGenresChange", () => {
    const onGenresChange = vi.fn();
    render(<ListToolbar {...defaultProps} onGenresChange={onGenresChange} />);
    fireEvent.click(screen.getByRole("button", { name: /^Genre/ }));
    fireEvent.click(screen.getByText("Action"));
    expect(onGenresChange).toHaveBeenCalledWith(["Action"]);
  });

  it("hides the status filter when showStatusFilter is false", () => {
    render(<ListToolbar {...defaultProps} showStatusFilter={false} />);
    expect(screen.queryByText("All statuses")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd game-gauge-web && npx vitest run src/components/lists/__tests__/list-toolbar.test.tsx`
Expected: FAIL — `../list-toolbar` does not exist yet.

- [ ] **Step 3: Implement the component**

Create `game-gauge-web/src/components/lists/list-toolbar.tsx`:

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Search, ArrowUp, ArrowDown, Check } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SortBy, SortDir, ListStatusFilter } from "@/lib/list-sort-filter";

export const SORT_FIELD_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "custom", label: "Custom order" },
  { value: "title", label: "Title" },
  { value: "dateAdded", label: "Date added" },
  { value: "progress", label: "Progress %" },
  { value: "releaseDate", label: "Release date" },
  { value: "rating", label: "Your rating" },
];

const STATUS_OPTIONS: { value: ListStatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
];

function MultiSelectChip({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  if (options.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] border transition-colors ${
          selected.length > 0
            ? "border-brand-purple/50 bg-brand-purple/15 text-brand-purple"
            : "border-brand-purple/20 text-foreground/50 hover:border-brand-purple/40"
        }`}
      >
        <span>
          {label}
          {selected.length > 0 ? ` (${selected.length})` : ""}
        </span>
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-brand-purple/15 rounded-lg shadow-xl overflow-hidden min-w-[180px] max-h-64 overflow-y-auto">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              className={`w-full text-left px-4 py-2 text-[12px] transition-colors flex items-center justify-between ${
                selected.includes(option)
                  ? "text-brand-purple bg-brand-purple/10"
                  : "text-foreground/70 hover:bg-brand-purple/10 hover:text-foreground"
              }`}
            >
              <span>{option}</span>
              {selected.includes(option) && <Check className="h-3 w-3" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface ListToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  sortBy: SortBy;
  sortDir: SortDir;
  onSortChange: (sortBy: SortBy, sortDir: SortDir) => void;
  availableGenres: string[];
  availablePlatforms: string[];
  selectedGenres: string[];
  onGenresChange: (genres: string[]) => void;
  selectedPlatforms: string[];
  onPlatformsChange: (platforms: string[]) => void;
  showStatusFilter: boolean;
  status: ListStatusFilter;
  onStatusChange: (status: ListStatusFilter) => void;
}

export function ListToolbar({
  search,
  onSearchChange,
  sortBy,
  sortDir,
  onSortChange,
  availableGenres,
  availablePlatforms,
  selectedGenres,
  onGenresChange,
  selectedPlatforms,
  onPlatformsChange,
  showStatusFilter,
  status,
  onStatusChange,
}: ListToolbarProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap p-3 border border-brand-purple/15 rounded-lg mb-6">
      <div className="relative flex-1 min-w-[160px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground/30" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search this list..."
          className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-background border border-brand-purple/20 rounded-md focus:outline-none focus:border-brand-purple/50 text-foreground placeholder:text-foreground/30"
        />
      </div>

      <Select value={sortBy} onValueChange={(value) => onSortChange(value as SortBy, sortDir)}>
        <SelectTrigger className="w-auto h-auto py-1.5 px-3 text-[12px] rounded-full border-brand-purple/20 gap-1.5">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_FIELD_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {sortBy !== "custom" && (
        <button
          type="button"
          onClick={() => onSortChange(sortBy, sortDir === "asc" ? "desc" : "asc")}
          className="p-1.5 rounded-full border border-brand-purple/20 text-foreground/50 hover:text-foreground hover:border-brand-purple/40 transition-colors"
          aria-label={sortDir === "asc" ? "Sort descending" : "Sort ascending"}
        >
          {sortDir === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          )}
        </button>
      )}

      <MultiSelectChip
        label="Genre"
        options={availableGenres}
        selected={selectedGenres}
        onChange={onGenresChange}
      />
      <MultiSelectChip
        label="Platform"
        options={availablePlatforms}
        selected={selectedPlatforms}
        onChange={onPlatformsChange}
      />

      {showStatusFilter && (
        <Select value={status} onValueChange={(value) => onStatusChange(value as ListStatusFilter)}>
          <SelectTrigger className="w-auto h-auto py-1.5 px-3 text-[12px] rounded-full border-brand-purple/20 gap-1.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd game-gauge-web && npx vitest run src/components/lists/__tests__/list-toolbar.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd game-gauge-web
git add src/components/lists/list-toolbar.tsx src/components/lists/__tests__/list-toolbar.test.tsx
git commit -m "feat(lists): add ListToolbar (search, sort, genre/platform/status filters)"
```

---

## Task 7: Install dnd-kit and extract `ListItemRow`

**Files:**
- Modify: `game-gauge-web/package.json`
- Create: `game-gauge-web/src/components/lists/list-item-row.tsx`
- Test: `game-gauge-web/src/components/lists/__tests__/list-item-row.test.tsx`

- [ ] **Step 1: Install dependencies**

Run: `cd game-gauge-web && npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
Expected: exits 0, `package.json`/`package-lock.json` updated. (If npm reports a peer-dependency warning about React 19, this is expected — dnd-kit's listed peer range predates React 19 but the libraries work correctly with it; the warning is non-blocking.)

- [ ] **Step 2: Write the failing test**

Create `game-gauge-web/src/components/lists/__tests__/list-item-row.test.tsx`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import type { ComponentProps } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { ListItemRow } from "../list-item-row";
import type { GameListItem } from "@/lib/api";

afterEach(cleanup);

const item: GameListItem = {
  id: "item-1",
  listId: "list-1",
  gameId: "game-1",
  order: 0,
  progressPct: 40,
  createdAt: "2026-01-01T00:00:00.000Z",
  game: { id: "game-1", title: "Hollow Knight", slug: "hollow-knight" },
};

function renderRow(overrides: Partial<ComponentProps<typeof ListItemRow>> = {}) {
  return render(
    <DndContext>
      <SortableContext items={[item.id]}>
        <ListItemRow
          item={item}
          isOwner={true}
          isPlayingList={true}
          dragEnabled={true}
          syncingAchievements={false}
          hasSteam={false}
          onRemove={vi.fn()}
          onProgressEditClick={vi.fn()}
          onSyncAchievements={vi.fn()}
          onCompleteClick={vi.fn()}
          {...overrides}
        />
      </SortableContext>
    </DndContext>
  );
}

describe("ListItemRow", () => {
  it("shows a drag handle when dragEnabled is true", () => {
    renderRow({ dragEnabled: true });
    expect(screen.getByLabelText("Drag to reorder")).toBeDefined();
  });

  it("hides the drag handle when dragEnabled is false", () => {
    renderRow({ dragEnabled: false });
    expect(screen.queryByLabelText("Drag to reorder")).toBeNull();
  });

  it("calls onRemove with the game id when the remove button is clicked", () => {
    const onRemove = vi.fn();
    renderRow({ onRemove });
    fireEvent.click(screen.getByLabelText("Remove game"));
    expect(onRemove).toHaveBeenCalledWith("game-1");
  });

  it("hides owner-only controls when isOwner is false", () => {
    renderRow({ isOwner: false, dragEnabled: false });
    expect(screen.queryByLabelText("Remove game")).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd game-gauge-web && npx vitest run src/components/lists/__tests__/list-item-row.test.tsx`
Expected: FAIL — `../list-item-row` does not exist yet.

- [ ] **Step 4: Implement the component**

Create `game-gauge-web/src/components/lists/list-item-row.tsx`, extracting the per-item card markup currently inlined in `src/app/(main)/lists/[id]/page.tsx` (lines 298-407) and adding `dnd-kit` sortable support plus a drag handle:

```tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { GripVertical, Trash2, Trophy, CheckCircle2 } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { GameListItem } from "@/lib/api";
import { ProgressBar } from "@/components/lists/progress-bar";
import { AchievementBadge } from "@/components/lists/achievement-badge";

interface ListItemRowProps {
  item: GameListItem;
  isOwner: boolean;
  isPlayingList: boolean;
  dragEnabled: boolean;
  syncingAchievements: boolean;
  hasSteam: boolean;
  onRemove: (gameId: string) => void;
  onProgressEditClick: () => void;
  onSyncAchievements: () => void;
  onCompleteClick: () => void;
}

export function ListItemRow({
  item,
  isOwner,
  isPlayingList,
  dragEnabled,
  syncingAchievements,
  hasSteam,
  onRemove,
  onProgressEditClick,
  onSyncAchievements,
  onCompleteClick,
}: ListItemRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !dragEnabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isAt100 = isPlayingList && (item.progressPct ?? 0) === 100;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-card rounded-lg border p-4 transition-colors ${
        isAt100 ? "border-brand-teal/30" : "border-brand-purple/15 hover:border-brand-purple/25"
      }`}
    >
      <div className="flex items-start gap-4">
        {dragEnabled && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="mt-1 text-foreground/20 hover:text-foreground/50 cursor-grab active:cursor-grabbing shrink-0"
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}

        <div className="w-12 h-16 relative rounded overflow-hidden bg-brand-purple/10 shrink-0 border border-brand-purple/10">
          {item.game?.coverImage ? (
            <Image src={item.game.coverImage} alt={item.game.title ?? ""} fill className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[10px] text-foreground/20">
              No art
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                href={`/games/${item.game?.slug}`}
                className="text-[14px] font-medium text-foreground hover:text-brand-purple transition-colors line-clamp-1"
              >
                {item.game?.title}
              </Link>
              {item.notes && (
                <p className="text-[12px] text-foreground/40 mt-0.5 line-clamp-2">{item.notes}</p>
              )}
            </div>

            {isOwner && (
              <button
                className="p-1.5 shrink-0 text-foreground/25 hover:text-brand-red hover:bg-brand-red/5 rounded transition-colors"
                onClick={() => onRemove(item.gameId)}
                aria-label="Remove game"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {isPlayingList && (
            <div className="mt-3 space-y-1.5">
              <ProgressBar value={item.progressPct} editable={isOwner} onClick={onProgressEditClick} />
              {item.progressNote && (
                <p className="text-[12px] text-foreground/35 italic">{item.progressNote}</p>
              )}

              <AchievementBadge
                achievements={item.steamAchievements}
                isSyncing={syncingAchievements}
                onSync={onSyncAchievements}
                hasSteam={hasSteam}
              />

              {isAt100 && (
                <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-brand-teal/10 border border-brand-teal/20 rounded-lg text-[12px] text-brand-teal">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span className="flex-1">
                    You&apos;re at 100% — ready to mark this complete?
                  </span>
                  <button
                    onClick={onCompleteClick}
                    className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded border border-brand-teal/30 hover:bg-brand-teal/20 transition-colors"
                  >
                    <Trophy className="h-3 w-3" />
                    Complete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd game-gauge-web && npx vitest run src/components/lists/__tests__/list-item-row.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd game-gauge-web
git add package.json package-lock.json src/components/lists/list-item-row.tsx src/components/lists/__tests__/list-item-row.test.tsx
git commit -m "feat(lists): add ListItemRow with dnd-kit drag handle"
```

---

## Task 8: Wire toolbar + drag-and-drop into the list detail page

**Files:**
- Modify: `game-gauge-web/src/app/(main)/lists/[id]/page.tsx`

- [ ] **Step 1: Update imports**

In `game-gauge-web/src/app/(main)/lists/[id]/page.tsx`, replace the import block (lines 1-32) with:

```tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { MainLayout } from "@/components/layout/main-layout";
import {
  ChevronLeft,
  Plus,
  Globe,
  Lock,
  Loader2,
  Trash2,
  Edit,
  Search,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { useAuthStore } from "@/store/auth";
import { getErrorMessage } from "@/lib/api";
import type { GameList, GameListItem } from "@/lib/api";
import {
  getList,
  deleteList,
  removeGameFromList,
  updateListItem,
  updateList,
  reorderListItems,
} from "@/lib/lists";
import { CreateListDialog } from "@/components/lists/create-list-dialog";
import { AddGameToListDialog } from "@/components/lists/add-game-dialog";
import { ProgressEditDialog } from "@/components/lists/progress-edit-dialog";
import { CompleteGameDialog } from "@/components/lists/complete-game-dialog";
import { SteamWishlistImportDialog } from "@/components/lists/steam-wishlist-import-dialog";
import { ListToolbar } from "@/components/lists/list-toolbar";
import { ListItemRow } from "@/components/lists/list-item-row";
import {
  sortListItems,
  filterListItems,
  DEFAULT_LIST_FILTER_STATE,
  type SortBy,
  type SortDir,
  type ListFilterState,
} from "@/lib/list-sort-filter";
import { syncAchievements } from "@/lib/lists";
import { toast } from "sonner";
```

(`Image`, `Trophy`, `CheckCircle2`, and `AchievementBadge` are no longer used directly in `page.tsx` — they now live inside `ListItemRow` — so they're dropped from this import block.)

- [ ] **Step 2: Add filter state and sensors**

In the component body, after the existing state declarations (after `const [syncingAchievementsFor, setSyncingAchievementsFor] = useState<string | null>(null);`, around line 59), add:

```tsx
  const [filters, setFilters] = useState<ListFilterState>(DEFAULT_LIST_FILTER_STATE);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
```

- [ ] **Step 3: Add computed sort/filter values**

Directly below the existing derived `const` block (after `const existingGameIds = ...`, around line 66), add:

```tsx
  const sortBy = (list?.sortBy ?? "custom") as SortBy;
  const sortDir = (list?.sortDir ?? "asc") as SortDir;
  const dragEnabled = isOwner && sortBy === "custom";

  const sortedItems = useMemo(
    () => (list ? sortListItems(list.items ?? [], sortBy, sortDir) : []),
    [list, sortBy, sortDir]
  );
  const visibleItems = useMemo(() => filterListItems(sortedItems, filters), [sortedItems, filters]);

  const availableGenres = useMemo(
    () => Array.from(new Set((list?.items ?? []).flatMap((i) => i.game?.genres ?? []))).sort(),
    [list]
  );
  const availablePlatforms = useMemo(
    () => Array.from(new Set((list?.items ?? []).flatMap((i) => i.game?.platforms ?? []))).sort(),
    [list]
  );
  const hasProgressData = (list?.items ?? []).some((i) => i.progressPct !== null && i.progressPct !== undefined);
```

- [ ] **Step 4: Add sort-change and drag-end handlers**

After `handleSyncAchievements` (around line 146), add:

```tsx
  const handleSortChange = async (newSortBy: SortBy, newSortDir: SortDir) => {
    if (!list) return;
    const previous = list;
    setList({ ...list, sortBy: newSortBy, sortDir: newSortDir });
    try {
      await updateList(listId, { sortBy: newSortBy, sortDir: newSortDir });
    } catch (err) {
      setList(previous);
      toast.error(getErrorMessage(err));
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!list || !over || active.id === over.id) return;

    const oldIndex = sortedItems.findIndex((i) => i.id === active.id);
    const newIndex = sortedItems.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(sortedItems, oldIndex, newIndex).map((item, index) => ({
      ...item,
      order: index,
    }));
    const previous = list;
    setList({ ...list, items: reordered });

    try {
      await reorderListItems(
        listId,
        reordered.map((item) => ({ id: item.id, order: item.order }))
      );
    } catch (err) {
      setList(previous);
      toast.error(getErrorMessage(err));
    }
  };
```

- [ ] **Step 5: Render the toolbar and replace the item list with the dnd-kit-wrapped version**

Replace the `{/* ── Game list ── */}` block (lines 292-410) with:

```tsx
        {/* ── Toolbar ── */}
        {list.items && list.items.length > 0 && (
          <ListToolbar
            search={filters.search}
            onSearchChange={(search) => setFilters((f) => ({ ...f, search }))}
            sortBy={sortBy}
            sortDir={sortDir}
            onSortChange={handleSortChange}
            availableGenres={availableGenres}
            availablePlatforms={availablePlatforms}
            selectedGenres={filters.genres}
            onGenresChange={(genres) => setFilters((f) => ({ ...f, genres }))}
            selectedPlatforms={filters.platforms}
            onPlatformsChange={(platforms) => setFilters((f) => ({ ...f, platforms }))}
            showStatusFilter={hasProgressData}
            status={filters.status}
            onStatusChange={(status) => setFilters((f) => ({ ...f, status }))}
          />
        )}

        {/* ── No results from filters ── */}
        {list.items && list.items.length > 0 && visibleItems.length === 0 && (
          <div className="rounded-lg border border-dashed border-brand-purple/20 bg-card py-14 text-center">
            <Search className="mx-auto h-8 w-8 text-foreground/20 mb-3" />
            <p className="text-[13px] text-foreground/40">No games match your search/filters.</p>
          </div>
        )}

        {/* ── Game list ── */}
        {visibleItems.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {visibleItems.map((item: GameListItem) => (
                  <ListItemRow
                    key={item.id}
                    item={item}
                    isOwner={isOwner}
                    isPlayingList={isPlayingList}
                    dragEnabled={dragEnabled}
                    syncingAchievements={syncingAchievementsFor === item.gameId}
                    hasSteam={Boolean(user?.steamId)}
                    onRemove={handleRemoveGame}
                    onProgressEditClick={() =>
                      setProgressEdit({
                        gameId: item.gameId,
                        gameTitle: item.game?.title ?? "",
                        currentPct: item.progressPct,
                        currentNote: item.progressNote,
                      })
                    }
                    onSyncAchievements={() => handleSyncAchievements(item.gameId)}
                    onCompleteClick={() =>
                      setCompleteTarget({ gameId: item.gameId, gameTitle: item.game?.title ?? "" })
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
```

- [ ] **Step 6: Type-check**

Run: `cd game-gauge-web && npm run type-check`
Expected: PASS

- [ ] **Step 7: Run the full frontend test suite**

Run: `cd game-gauge-web && npm test`
Expected: PASS (no regressions in existing component tests)

- [ ] **Step 8: Commit**

```bash
cd game-gauge-web
git add src/app/\(main\)/lists/\[id\]/page.tsx
git commit -m "feat(lists): wire sort/filter toolbar and drag-and-drop into list detail page"
```

---

## Task 9: Manual verification

- [ ] **Step 1: Start both servers**

Run: `cd game-gauge-api && npm run dev` (in one terminal)
Run: `cd game-gauge-web && npm run dev` (in another terminal)

- [ ] **Step 2: Verify drag-and-drop**

1. Sign in, open a custom list with 3+ games (or add some via "Add Game").
2. Confirm a drag handle (grip icon) appears on the left of each row.
3. Drag the first item to the last position. Confirm the order updates immediately and persists after a page reload.
4. Repeat on the Currently Playing default list — confirm dragging works there too.

- [ ] **Step 3: Verify sort**

1. On the same list, switch the sort dropdown to "Title". Confirm items re-order alphabetically and the drag handles disappear.
2. Reload the page. Confirm the list still shows "Title" sort (persisted server-side) — open the same list in a different browser/incognito session signed in as the same user to confirm it's not just a localStorage artifact.
3. Click the direction toggle. Confirm order reverses.
4. Switch back to "Custom order". Confirm drag handles reappear and the list returns to the manually-set order.

- [ ] **Step 4: Verify filters**

1. Type a partial game title into the search box. Confirm the list narrows to matches only.
2. Open the Genre filter, select a genre. Confirm the list narrows; select a second genre and confirm it's an OR (either genre matches).
3. Clear filters, reload the page. Confirm filters reset to empty (not persisted).
4. On the Currently Playing list, confirm the Status filter chip appears and correctly filters Not started / In progress / Completed.
5. On a list with no progress data (e.g. Wishlist), confirm the Status filter chip is hidden.

- [ ] **Step 5: Verify non-owner / public list view**

1. View a public list as a different signed-in user (or logged out). Confirm: no drag handles, no remove buttons, sort/filter still work (read-only).

- [ ] **Step 6: Mobile/touch check**

Using browser devtools device emulation (or a real device), confirm drag-and-drop works via touch on a custom list.
