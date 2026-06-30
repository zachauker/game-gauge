# List Reorder, Sort & Filter — Design

**Status:** Approved
**Phase:** 1 of 4 in the "interactive, customizable, dynamic lists" initiative
(Phase 2: visual customization. Phase 3: smart/dynamic lists. Phase 4: social/collaborative lists. Each gets its own spec.)

## Background

Game lists (`/lists`, `/lists/[id]`) currently render items in a fixed order with no
sorting or filtering. The backend already has unused capability for manual ordering:
`GameListItem.order` and `POST /lists/:id/reorder` exist but the frontend never calls
them or exposes drag-and-drop.

## Goals

- Manual drag-and-drop reordering, available on every list (default and custom).
- Sort options beyond manual order: Title, Date added, Progress %, Release date, Your rating.
- Client-side filtering: search by title, genre, platform, and completion status.
- Sort choice persists per list, server-side, across devices and visits. Filters are
  transient (reset on reload) — they are not persisted.

## Non-goals

- Visual customization (list covers/icons/colors, view density) — phase 2.
- Rule-based/auto-populating "smart" lists — phase 3.
- Shared/collaborative list editing — phase 4.
- Server-side filtering/pagination of list items (lists are small enough for client-side
  filtering of the already-fetched item set).

## Data model

Add two columns to `GameList`:

```prisma
model GameList {
  // ...existing fields...
  sortBy  String @default("custom") // "custom" | "title" | "dateAdded" | "progress" | "releaseDate" | "rating"
  sortDir String @default("asc")    // "asc" | "desc"
}
```

No new tables. `GameListItem.order` continues to drive the `custom` sort. Filters
(search text, genre, platform, status) are pure client-side UI state — not persisted
anywhere.

## API changes

- Extend `PATCH /lists/:id` (validator + service) to accept optional `sortBy` and
  `sortDir` alongside the existing `name`/`description`/`isPublic` fields. No new route.
- Extend `ListRepository.findById`'s `game` select to include `genres` and `platforms`
  (already plain array columns on `Game`) so the frontend can build filter chips.
- For the "Your rating" sort: include each game's rating *for the requesting user*
  (`game.ratings` filtered by `where: { userId: requestingUserId }, take: 1`) so sorting
  by rating works correctly for viewers who aren't the list owner (e.g. on public lists).
- Reordering continues to use the existing `POST /lists/:id/reorder` — no changes needed
  beyond wiring the frontend to call it.

## Frontend UX

### Toolbar

An inline bar below the list header on `/lists/[id]` (search input + sort dropdown +
filter chips, single row, wrapping on narrow viewports):

- **Search** — text input, filters the visible items by game title as the user types.
- **Sort dropdown** — Custom / Title / Date added / Progress % / Release date / Your
  rating, with an asc/desc toggle. Selecting anything but Custom immediately `PATCH`es
  the list's `sortBy`/`sortDir` and re-renders items in that order.
- **Genre / Platform filter chips** — multi-select, populated from the distinct
  genres/platforms present among the list's own items (not a global catalog list).
- **Status filter chip** — "Not started / In progress / Completed", shown only when the
  list has progress-tracked items (Currently Playing, or any list with `progressPct` set
  on at least one item).

Filters and search apply on top of whatever sort is active: filtering narrows the
visible set, sorting determines the order of what remains. All computed client-side
over the already-fetched `list.items` array.

### Drag-and-drop reordering

- Library: `dnd-kit` (new dependency in `game-gauge-web`) — touch-friendly, accessible,
  actively maintained. (`react-beautiful-dnd` was considered but is deprecated.)
- Drag handles are only active when `sortBy === "custom"`. Selecting any other sort
  hides/disables the drag handles, since the displayed order is computed by that sort —
  this avoids "why didn't my drag do anything" confusion. Switching back to Custom
  re-enables dragging at the last manually-saved order.
- On drop: call `POST /lists/:id/reorder` with the new item order. Optimistic UI update
  with rollback on request failure.
- Touch support comes from dnd-kit by default — works on mobile without extra wiring.

## Testing approach

- **Backend:** unit tests for the extended `PATCH /lists/:id` validator/service
  (rejects invalid `sortBy`/`sortDir` values), and a service test confirming the
  per-viewer rating include works correctly for a non-owner viewing a public list.
- **Frontend:** component test verifying drag handles are disabled when a non-custom
  sort is active; unit tests for the client-side filter/sort utility as a pure function
  against fixture item arrays.
- **Manual:** drag-and-drop on desktop and touch-emulated mobile (devtools), confirm
  sort choice persists across reload/device, confirm filters reset on reload.
