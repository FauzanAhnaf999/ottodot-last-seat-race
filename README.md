# Ottodot — Trial Booking (Capacity 4, Race-Safe)

Smallest working slice of Ottodot's trial booking system. Parents book a trial class for their child, pay (mock), and teachers see an accurate roster. Correctness under edge cases is prioritized over UI polish.

Stack: **Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4 + Supabase/Postgres (schema + in-memory fallback) + Vercel-ready**.

---

## How to run

```bash
# 1. Install
pnpm install

# 2. Run dev (no env vars required — uses in-memory store)
pnpm dev
# open http://localhost:3000

# 3. Verify invariants (no server needed)
pnpm verify
# or: npx tsx scripts/verify.mjs

# 4. Race test via HTTP (requires dev server running)
pnpm race
# or: BASE_URL=http://localhost:3000 node scripts/race.mjs

# 5. Production build
pnpm build && pnpm start
```

**Supabase (optional):** The app ships with a fully equivalent in-memory implementation so reviewers can run it with zero setup. To use real Postgres:

1. Create a Supabase project.
2. Run `supabase/schema.sql` then `supabase/seed.sql` in SQL Editor.
3. Add `.env.local` from `.env.example` with `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Wire `lib/store.ts` → `lib/supabase.ts` (the SQL function `confirm_booking` is the drop-in replacement for the in-memory mutex — see "Last-seat race" below).

Reset seed anytime: `POST /api/seed` or click **Reset seed** in UI. Also `GET /api/seed` shows current data.

---

## What you built

**User flows:**

- Parent selects child (filtered by parent) → picks a trial class with live availability (`confirmed_count / 4`) → creates a `pending_payment` booking → mocks payment success/failure → sees final status (`confirmed` / `payment_failed` / `pending_payment`).
- Admin/teacher views roster per class at `/roster` and via `GET /api/roster/[classId]` — only `confirmed` bookings.

**What counts as "confirmed roster":** only bookings with `status = 'confirmed'` after a successful `payment_attempt`. Everything else (`pending_payment`, `payment_failed`, `cancelled`) is excluded. Roster endpoint is the source of truth teachers see before class.

Minimal UI is at `/` (booking) and `/roster` (all classes). APIs are also directly curl-able for verification.

---

## Seed data — covers all required edge cases

| Class | State | How to demonstrate |
|-------|-------|--------------------|
| `cls_available` (Science Explorers, Ms. Putri) | **0/4** confirmed, 4 seats free. Plus one `pending_payment` (Kiko) and one `payment_failed` (Riko) seeded | **Available:** book Milo for cls_available → pay success → 1/4 |
| `cls_almost_full` (Math Masters, Mr. Adi) | **3/4** confirmed (Dina, Ella, Noah) — exactly 1 seat left | **3-confirmed + duplicate:** try booking Dina again → 409; race test with 2 new kids |
| `cls_full` (Robotics Intro, Mr. Ken) | **4/4** confirmed — full | Overbooking attempt → `CLASS_FULL` |
| `cls_race` (Space Lab, Dr. Nova) | **3/4** confirmed — dedicated race fixture | **Last-seat race:** create `stu_6`+`stu_7` pendings → concurrent `POST /pay` → only 1 wins |

Parents: Siti (par_1, kids Kiko/Milo), Budi (par_2, Dina/Riko), Anya (par_3, Ella/Sam), James (par_4, Noah).

**Duplicate:** `bk_dup_pending` — Kiko already has `pending_payment` for `cls_available` → second `POST /api/bookings` for same student+class returns `409 DUPLICATE_BOOKING`.

**Payment failure:** `bk_failed` — Riko's booking is `payment_failed` with a `failed` payment_attempt; not counted toward capacity, free to retry.

---

## Time spent

~5 hours (scaffold + data model + transactional logic + APIs + minimal UI + seed + verification scripts + docs). If scoped to "backend only" (schema + `store.ts` + routes + tests), ~3 hours.

---

## Assumptions

- Trial capacity is **fixed at 4** per spec; stored as `capacity` but validated `CHECK (capacity = 4)` so the rule is explicit and generalizable.
- A parent can only book for their own child (`student.parent_id` must match `parent_id`).
- `pending_payment` does **not** reserve a seat. Seats are only decremented on `confirmed`. This is a deliberate product decision: it avoids holding seats for unpaid/abandoned sessions and simplifies expiry (no TTL/job needed for demo). Alternative (hold seat on pending with expiry) is discussed in tradeoffs.
- Payment is mock/synchronous. Real provider would be Stripe/Midtrans with webhook; `payment_attempts` models that.
- Single trial per child per class: re-booking after `payment_failed`/`cancelled` is allowed; after `confirmed` or `pending_payment` it is not.
- Auth is out of scope — `parent_id` is passed explicitly (in production would come from session/JWT).
- Demo uses in-memory store; Postgres schema is provided and behaviorally equivalent.

---

## Key architecture & backend decisions

### Data model

```
parents(id, name, email)
students(id, parent_id → parents, name, age)
trial_classes(id, title, subject, starts_at, capacity=4, teacher_name)
bookings(id, student_id → students, trial_class_id → trial_classes, parent_id → parents,
         status ∈ {pending_payment, confirmed, payment_failed, cancelled},
         created_at, updated_at)
payment_attempts(id, booking_id → bookings, status ∈ {pending, succeeded, failed},
                 amount_cents, provider_ref, created_at)
```

Indexes: `bookings(trial_class_id, status)`, `bookings(student_id, trial_class_id)`, `payment_attempts(booking_id)`.

### Booking statuses

- `pending_payment` — intent created, no seat taken. Waiting for payment.
- `confirmed` — payment succeeded **and** capacity/duplicate checks passed inside transaction. Counts toward `capacity`.
- `payment_failed` — payment failed (mock failure). Never counts toward capacity. Allows retry (new booking).
- `cancelled` — explicit cancel, frees seat (not used in happy path but modeled).

### Key API endpoints

```
GET  /api/trial-classes          → list with confirmed_count, available_seats, is_full
GET  /api/parents                → list parents
GET  /api/students?parentId=...  → children by parent
POST /api/bookings               → {parent_id, student_id, trial_class_id} → 201 + booking | 409 DUPLICATE
GET  /api/bookings/[id]          → booking + payments + trialClass
POST /api/bookings/[id]/pay      → {simulate:"success"|"failure"} → confirm or fail payment
GET  /api/roster/[classId]       → {trialClass, roster: confirmed only, confirmed_count}
POST /api/seed                   → reset to seed (also GET /api/seed for dump)
```

Example:

```bash
curl -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{"parent_id":"par_1","student_id":"stu_2","trial_class_id":"cls_available"}'

curl -X POST http://localhost:3000/api/bookings/<id>/pay \
  -H "Content-Type: application/json" \
  -d '{"simulate":"success"}'

curl http://localhost:3000/api/roster/cls_available | jq
```

---

## Backend / Design — how edge cases are handled

### Duplicate confirmed bookings

- **DB:** `CREATE UNIQUE INDEX uniq_confirmed_booking ON bookings(student_id, trial_class_id) WHERE status='confirmed'` — the database is the final arbiter. Even if app logic races, Postgres rejects the second `confirmed` with `23505`.
- **App:** `createPendingBooking` rejects if a `pending_payment` or `confirmed` already exists for the same `student_id`+`trial_class_id` (prevents double-clicks / double-submit). `confirmBooking` re-checks inside the critical section.
- **UX:** 409 `DUPLICATE_BOOKING` on `POST /api/bookings`; UI surfaces the error.

### Payment failure without adding to roster

- Booking is created as `pending_payment`. Roster query is `WHERE status='confirmed'` only.
- `POST /pay` with `simulate:"failure"` calls `failBookingPayment` → sets `booking.status='payment_failed'` and inserts `payment_attempt` with `status='failed'`. No capacity consumed.
- Retries are allowed: a new `pending_payment` booking can be created for the same student+class after a failure (since the failed booking no longer blocks). This matches real-world "try again" behavior.

### Last-seat race (the required scenario)

> A selects last seat → pending. B selects same seat → pending. B pays first → confirmed. A pays → must fail.

**Approach chosen: pessimistic locking (SELECT FOR UPDATE) — serialized confirm.**

In Postgres (`supabase/schema.sql` → `confirm_booking()`):

```sql
BEGIN;
SELECT * FROM trial_classes WHERE id = $1 FOR UPDATE;  -- locks the class row
SELECT COUNT(*) FROM bookings WHERE trial_class_id=$1 AND status='confirmed';
-- if count >= capacity → raise CLASS_FULL
-- if duplicate confirmed exists → raise DUPLICATE_BOOKING
UPDATE bookings SET status='confirmed' WHERE id=$2;
INSERT INTO payment_attempts ...;
COMMIT;
```

Only one transaction can hold the `FOR UPDATE` lock on the class row at a time. The second transaction blocks until the first commits, then sees `count = 4` and fails with `CLASS_FULL`. This guarantees **at most one confirmed booking for the last seat**, regardless of payment order or timing.

In the in-memory demo (`lib/store.ts`): a per-class `Mutex` (`mutexFor(classId)`) serializes `confirmBooking` for that `classId`, with the same count-then-update inside the critical section. It is the exact behavioral analogue of the row lock.

**Why not optimistic / first-come check-then-insert without a lock?** That is the bug the scenario describes: both A and B read `available=1`, both insert, both succeed → 5/4 overbooking. So we rejected that.

**Why pessimistic over optimistic with retry?** For capacity 4 and low contention, either pessimistic or optimistic (unique constraint + retry + capacity check in a serializable transaction) would work. We chose pessimistic because:
- It maps directly to Postgres primitives and is easy to reason about.
- It gives a clean `409 CLASS_FULL` error without needing retry loops on the client.
- Contention is low (4 seats, short critical section), so lock hold time is negligible.

**Tradeoffs accepted:**
- Holding a row lock for the duration of the confirm (including a potential external payment call in a real system) would be bad. So in our flow, **payment is outside the lock**: we create `pending_payment` without a lock, call the payment provider, then **only the confirm step** (which is local DB work) holds the lock. In a real Stripe integration, the webhook would confirm inside the transaction. This avoids holding DB locks over network I/O.
- `pending_payment` does not hold a seat, so a class can appear to have a seat when many users are at the payment step, and then some payments fail with `CLASS_FULL`. This is the correct business tradeoff for trials (prefer failing a late payer over holding inventory for abandoners). If product required seat-holding, we would add a TTL on `pending_payment` (e.g., 10-min expiry via `pg_cron` or a background job) and count `pending` + `confirmed` toward capacity — but that was cut for simplicity (see "cut").
- Throughput: row-level lock serializes confirms for the same class, but classes are independent (lock is per `trial_class_id`), so booking for `cls_available` does not block booking for `cls_race`.

### Which checks belong where

| Check | UI | Backend | Database | Background job |
|-------|----|---------|----------|----------------|
| Child belongs to parent | ✓ (filter dropdown) | ✓ (enforce `student.parent_id == parent_id`) | FK | — |
| Class exists / not full (display) | ✓ (disable full, show seats) | — (informational only) | — | — |
| Capacity ≤4 (authoritative) | ✗ (never trust UI) | ✓ (inside transaction/mutex) | — (count via `confirm_booking`) | — |
| Duplicate `confirmed` | ✓ (disable duplicate) | ✓ (inside transaction) | ✓ (`uniq_confirmed_booking` partial index) | — |
| Payment failure → not on roster | ✓ (show status) | ✓ (set `payment_failed`) | `WHERE status='confirmed'` in roster query | — |
| Last-seat race | ✗ | ✓ (serialized via `FOR UPDATE` / mutex) | ✓ (transaction isolation) | — |
| Stale `pending` expiry | — | — (cut) | — (cut) | Would be here (cron to `cancel` expired pending) |
| Idempotency of payment webhook | — | ✓ (`pending → confirmed` only, re-confirm idempotent) | Unique `payment_attempts` per booking | — |

Rule: **UI for convenience, backend for correctness, DB for invariants, jobs for time-based cleanup.**

---

## What you deliberately cut

- Auth / sessions (parent identity is a param, not a JWT).
- Real payment provider & webhooks (mock `success`/`failure` only).
- `pending_payment` TTL/expiry + background reaper.
- Email / WhatsApp notifications.
- Search, pagination, date filtering (trial list is small).
- Migrations runner (SQL files are manual in this slice).
- Rate limiting / idempotency keys on `POST /api/bookings` (would add `Idempotency-Key` header in production).

---

## What you would monitor after release

- **Invariants:** `confirmed_count > capacity` (alert 0 tolerance), `uniq_confirmed_booking` violations, race failures rate (`CLASS_FULL` on pay).
- **Business:** booking conversion (`pending → confirmed`), payment failure rate, roster accuracy (confirmed vs actual attendance).
- **Performance:** p95 latency for `confirm_booking`, lock wait time, contention on hot classes.
- **Reliability:** webhook delivery / reconciliation job lag, `pending` age distribution (abandoned checkouts).
- **Logs/Traces:** structured logs for `create → pay → confirm/fail` with `booking_id`, `class_id`, `student_id`, `request_id`; Sentry for 5xx / `CLASS_FULL` spikes.

---

## What you would do next with more time

1. **Expiry for pending:** add `expires_at` on `bookings`, `pg_cron` job every minute to `cancel` expired pendings, and optionally hold seats for `pending` with a countdown in UI.
2. **Webhook path:** integrate Stripe, move payment outside transaction, verify signature, idempotent `POST /webhooks/stripe` → `confirm_booking`.
3. **Idempotency keys:** client-generated `Idempotency-Key` on `POST /api/bookings` to safely retry.
4. **Realtime roster:** Supabase Realtime subscription for teachers so roster updates without refresh.
5. **Tests:** add Playwright E2E for concurrent UI race, and load test with `k6` for hot class.
6. **Admin:** auth, role checks (teacher vs admin), CSV export, attendance marking.

---

## Project structure

```
app/                      # Next.js App Router
  api/                    # Route handlers (trial-classes, bookings, roster, seed)
  page.tsx                # Booking UI
  roster/page.tsx         # Teacher roster UI
lib/
  types.ts                # Domain types
  store.ts                # In-memory store + per-class mutex (prod-equivalent logic)
  supabase.ts             # Real Supabase client (optional)
supabase/
  schema.sql              # Postgres DDL + confirm_booking() function
  seed.sql                # Supabase seed (mirrors store.ts seed)
scripts/
  verify.mjs              # Invariant tests (no server needed)
  race.mjs                # HTTP race test (needs dev server)
```

---

## Verification

```bash
pnpm verify
# 10 passed: seed counts, duplicate, available, payment_failed not on roster,
# overbooking, last-seat race (concurrent), idempotency

pnpm race
# Sequential + concurrent pays for cls_race → exactly 1 succeeds, 1 gets CLASS_FULL, roster stays ≤4
```

Manual curl:

```bash
curl http://localhost:3000/api/trial-classes | jq
curl http://localhost:3000/api/roster/cls_race | jq
curl -X POST http://localhost:3000/api/bookings -H "Content-Type: application/json" \
  -d '{"parent_id":"par_1","student_id":"stu_1","trial_class_id":"cls_available"}' | jq
```

---

## License

Internal demo for Ottodot.
