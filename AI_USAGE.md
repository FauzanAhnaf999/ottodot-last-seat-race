# AI Usage

## Which AI tools were used
- **Muse Spark (muse-spark-1.2-contributor-free)** via OpenCode — primary code, schema, docs generation.
- No other AI tools (no Copilot, ChatGPT, etc.) for this slice.

## What AI was used for
- Scaffolding Next.js app structure, Tailwind setup, and route handlers boilerplate.
- Drafting Postgres schema (`schema.sql`) including partial unique index and `confirm_booking()` function, later hardened with `CHECK` regex, `idempotency_keys`, RLS notes, and detailed comments.
- Implementing in-memory `store.ts` with per-class mutex to mirror `SELECT FOR UPDATE` semantics, later refactored to `crypto.randomUUID` and `dump()` projection.
- Generating minimal booking + roster UI (`app/page.tsx`, `app/roster/page.tsx`).
- Writing verification scripts (`scripts/verify.mjs`, `scripts/race.mjs`) for duplicate/overbooking/race checks.
- Adding best-practice backend layer: `lib/validation.ts` (Zod schemas), `lib/errors.ts` (typed `AppError` + `STATUS_BY_CODE`), `lib/api.ts` (`jsonOk`/`jsonError`, `Idempotency-Key` cache, `x-request-id` logging) and refactoring all `app/api/*` routes to thin controllers.
- Drafting `README.md` structure and this file from project context, later expanded to detailed Backend Architecture section (layered diagram, state machine, API contract table, error taxonomy, Mermaid sequence, isolation analysis).

## One place where AI helped you move faster
AI generated the full `store.ts` mutex + seed + transactional `confirmBooking` logic in one pass, including the per-class lock table and the 4 invariant tests. Doing this by hand would have required stitching together lock semantics, seed data, and test fixtures separately; AI produced a coherent, runnable version that passed `pnpm verify` on first execution, saving ~45 minutes.

Second boost: AI scaffolded the entire best-practice hardening pass (`lib/validation.ts` + `lib/errors.ts` + `lib/api.ts` + refactored 6 route handlers + hardened `schema.sql` with comments/RLS) in one coherent diff and rewrote the README Backend Architecture section (diagram, API contract table, Mermaid race sequence) from the existing code — saved ~90 minutes vs hand-writing each file and table.

## One place where you disagreed with, corrected, or rejected AI output
AI initially proposed **holding a seat on `pending_payment`** (counting pending + confirmed toward capacity with a TTL). I rejected this for the trial booking slice. Reasoning:
- Trials are low-value, high-no-show; holding seats for abandoners wastes inventory and adds complexity (expiry job, cron, edge cases).
- Spec says roster is only confirmed students, so pending should not consume capacity.
- The simpler invariant — *capacity checked only at confirm time, payment failure never counts* — is easier to explain and verify for the required last-seat race.
I changed the model so `pending` does not reserve a seat and documented the tradeoff explicitly (including what a TTL-based alternative would look like).

Second correction: AI scaffold used `localStorage` for persistence in the first draft of `store.ts`. I replaced it with a pure in-memory singleton via `globalThis` to avoid hydration mismatches in Next.js server components and to keep `confirmBooking` atomic without async storage I/O.

Third correction: AI’s first hardening pass generated route handlers that returned `{error, code}` but mapped `ZodError` to `500`. I corrected it to map Zod issues to `400 VALIDATION_ERROR` with `details` in `lib/errors.ts:toErrorResponse` and enforced `idSchema` on every `parent_id`/`student_id`/`trial_class_id` via `lib/validation.ts` before hitting the service — validation must be at the edge, not inside the service.

Fourth correction: AI proposed `Math.random` IDs in the original `store.ts`. I replaced it with `crypto.randomUUID` (`lib/store.ts:288`) for collision-safety and prefixed IDs (`bk_`, `pay_`) for log scannability.

## What you would change about AI workflow if you had to do this again
- Prompt AI with the full edge-case matrix up front (duplicate, overbooking, payment failure, race) and require it to produce a **failing test first** before writing implementation — TDD style would have caught the seat-holding disagreement earlier.
- Use AI for smaller, reviewable patches (one file per turn) instead of generating whole UI + API at once; the large initial diff was harder to review for subtle invariant bugs.
- Add a dedicated "critic" pass: ask AI to enumerate invariant violations it could still have after generation, rather than only asking it to build.

## How you verified the final implementation
- **Automated invariant tests (no server):** `npx tsx scripts/verify.mjs` — 10 checks covering seed counts, duplicate pending/confirmed rejection, payment_failed not on roster, overbooking beyond 4, concurrent last-seat race (only 1 of 2 parallel confirms succeeds), and idempotency. Still passes after hardening.
- **HTTP race test (with server):** `node scripts/race.mjs` against `http://localhost:3000` — sequential (B pays before A) and concurrent (`Promise.all`) confirms for `cls_race`, asserting roster stays ≤4 and exactly one succeeds. Verified `409 CLASS_FULL` for loser after Zod refactor.
- **Build check:** `pnpm build` (Next 16 Turbopack) — typecheck + static generation passes for all routes (`/`, `/roster`, `/api/*`) after adding `zod` and `lib/*` modules.
- **Manual curl (post-hardening):** `GET /api/trial-classes`, `POST /api/bookings` → `POST /api/bookings/[id]/pay` (success/failure), `GET /api/roster/[classId]` for roster accuracy; also tested `400 VALIDATION_ERROR` on bad `idSchema` and `Idempotency-Key` replay.
- **Code review:** inspected `supabase/schema.sql` (partial index + `FOR UPDATE` function + RLS/idempotency comments) and `lib/store.ts` (mutex + re-check inside critical section + `crypto.randomUUID`) and `lib/validation.ts`/`lib/errors.ts`/`lib/api.ts` to confirm validation at edge, typed errors, and DB as final arbiter.
