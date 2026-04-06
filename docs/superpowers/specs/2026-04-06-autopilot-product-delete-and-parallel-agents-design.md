# Autopilot Product Delete + Max Parallel Agents Design

## Context

Users of the Autopilot feature have no way to delete a product (only archive) and no way to limit how many agents run in parallel for a product's build queue.

---

## Feature 1: Delete Product (Archive + Hard Delete)

### UX Flow

1. User hovers over a product card on `/autopilot` → trash icon appears (same hover-reveal pattern as workspace cards)
2. User clicks trash icon → confirmation modal opens with three options:
   - **Cancel** — closes modal, no action
   - **Archive** — soft-delete: calls `DELETE /api/products/{id}` → sets `status = 'archived'`
   - **Delete** — opens a second confirmation step (see below)
3. **Delete** confirmation: user must type "DELETE" in a text field, then click confirm → calls `DELETE /api/products/{id}?hard=true` → actually removes the row

### Visual Design

- Modal matches existing Mission Control modal styling (dark bg, rounded-xl, border)
- Three-button layout in the footer: `[Cancel]  [Archive (secondary)]  [Delete (red/danger)]`
- Delete step uses a text input with placeholder "Type DELETE to confirm" + red confirm button disabled until "DELETE" is typed

### Files to Change

| File | Change |
|------|--------|
| `src/app/autopilot/page.tsx` | Add trash button to product cards |
| `src/app/api/products/[id]/route.ts` | Add `?hard=true` query param handling |
| `src/lib/autopilot/products.ts` | Add `hardDeleteProduct()` function |
| New: `src/components/autopilot/DeleteProductModal.tsx` | Reusable modal component |

### API Changes

`DELETE /api/products/{id}` (existing): soft delete via `archiveProduct()`

`DELETE /api/products/{id}?hard=true` (new): calls `hardDeleteProduct()` which runs:
```sql
DELETE FROM products WHERE id = ? -- CASCADE FK removes related records
```

---

## Feature 2: Max Parallel Agents Setting

### Configuration Hierarchy

1. **Product-level setting** (UI, stored in `products.max_parallel_agents` column)
2. **Environment variable** `AUTOPILOT_MAX_PARALLEL_AGENTS` in `.env.local`
3. **Default value** `5`

The dispatch route resolves the effective value as:
```
product.max_parallel_agents ?? env.AUTOPILOT_MAX_PARALLEL_AGENTS ?? 5
```

### UX

**UI Location:** Product Settings → "Build Configuration" section, alongside existing Cost Cap fields

**Field:**
- Label: "Max Parallel Agents"
- Type: number input, range 1–20, default empty (meaning "use env or default")
- Placeholder: "Env: 5" (shows current env/default)

### Files to Change

| File | Change |
|------|--------|
| `src/lib/types.ts` | Add `max_parallel_agents?: number` to `Product` interface |
| `src/lib/db/migrations.ts` | Add migration for `max_parallel_agents` column |
| `src/lib/autopilot/products.ts` | Add `max_parallel_agents` to `updateProduct()` |
| `src/components/autopilot/ProductSettings.tsx` | Add number input in Build Configuration section |
| `src/app/api/products/[id]/route.ts` | Pass through `max_parallel_agents` in PATCH |
| `src/app/api/tasks/[id]/dispatch/route.ts` | Check parallel agent limit before dispatching |
| `.env.example` | Add `AUTOPILOT_MAX_PARALLEL_AGENTS=5` |

### Dispatch Behavior

When dispatching a task in a product's build queue:
1. Count active tasks for that product (status IN `assigned`, `in_progress`, `convoy_active`)
2. If count >= effective `max_parallel_agents` limit, return `429 Too Many Requests` with message indicating limit reached
3. Task stays in `approved` status until a slot opens

---

## Implementation Order

1. Add `max_parallel_agents` column + migration
2. Update types, products lib, API routes
3. Add UI field to ProductSettings
4. Wire up dispatch throttle
5. Add env variable to `.env.example`
6. Add delete button + modal to `/autopilot` page
7. Add hard delete API + function
8. Test the complete flow
