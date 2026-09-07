import {
  Booking,
  BookingStatus,
  Parent,
  PaymentAttempt,
  RosterEntry,
  Student,
  TrialClass,
  TrialClassWithAvailability,
} from "./types";

// ---------------------------------------------------------------------------
// InMemoryStore — domain service + repository in one for the demo slice.
// Production mapping (see README “Architecture”):
//   UI / API Route  →  BookingService (this file)  →  Postgres + confirm_booking()
//   Validation (zod) → Business invariants → Transaction (FOR UPDATE / mutex)
// Best practice: all invariants live here, routes are thin controllers.
// ---------------------------------------------------------------------------
// Simple in-memory store that mimics Postgres transactional semantics.
// For production Supabase/Postgres, the same invariants are enforced via
// SQL transactions with SELECT ... FOR UPDATE (see supabase/schema.sql).
//
// Concurrency control: per-class mutex serializes confirm operations,
// exactly analogous to row-level locking on trial_classes in Postgres.
// Why per-class? Capacity is per trial_classes.id — serializing globally
// would needlessly block unrelated classes. Row-level lock gives max concurrency.
// ---------------------------------------------------------------------------

type StoreState = {
  parents: Map<string, Parent>;
  students: Map<string, Student>;
  trialClasses: Map<string, TrialClass>;
  bookings: Map<string, Booking>;
  payments: Map<string, PaymentAttempt>;
};

// Mutex implementation (no external dep)
class Mutex {
  private locked = false;
  private waiters: (() => void)[] = [];

  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return () => this.release();
    }
    return new Promise<() => void>((resolve) => {
      this.waiters.push(() => {
        this.locked = true;
        resolve(() => this.release());
      });
    });
  }

  private release() {
    if (this.waiters.length > 0) {
      const next = this.waiters.shift()!;
      next();
    } else {
      this.locked = false;
    }
  }
}

class InMemoryStore {
  private state: StoreState = {
    parents: new Map(),
    students: new Map(),
    trialClasses: new Map(),
    bookings: new Map(),
    payments: new Map(),
  };

  // per-class mutex simulating SELECT FOR UPDATE on trial_classes row
  private mutexes = new Map<string, Mutex>();

  private mutexFor(classId: string): Mutex {
    if (!this.mutexes.has(classId)) this.mutexes.set(classId, new Mutex());
    return this.mutexes.get(classId)!;
  }

  // ---- seed ----
  reset() {
    this.state = {
      parents: new Map(),
      students: new Map(),
      trialClasses: new Map(),
      bookings: new Map(),
      payments: new Map(),
    };
    this.mutexes.clear();
    this.seed();
  }

  seed() {
    // Parents
    const parents: Parent[] = [
      { id: "par_1", name: "Siti Rahayu", email: "siti@example.com" },
      { id: "par_2", name: "Budi Santoso", email: "budi@example.com" },
      { id: "par_3", name: "Anya Lee", email: "anya@example.com" },
      { id: "par_4", name: "James Carter", email: "james@example.com" },
    ];
    parents.forEach((p) => this.state.parents.set(p.id, p));

    // Students
    const students: Student[] = [
      { id: "stu_1", parent_id: "par_1", name: "Kiko Rahayu", age: 9 },
      { id: "stu_2", parent_id: "par_1", name: "Milo Rahayu", age: 7 },
      { id: "stu_3", parent_id: "par_2", name: "Dina Santoso", age: 10 },
      { id: "stu_4", parent_id: "par_3", name: "Ella Lee", age: 8 },
      { id: "stu_5", parent_id: "par_4", name: "Noah Carter", age: 9 },
      { id: "stu_6", parent_id: "par_2", name: "Riko Santoso", age: 8 },
      { id: "stu_7", parent_id: "par_3", name: "Sam Lee", age: 11 },
    ];
    students.forEach((s) => this.state.students.set(s.id, s));

    // Trial classes
    const now = new Date();
    const iso = (d: Date) => d.toISOString();
    const addDays = (n: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() + n);
      d.setHours(10, 0, 0, 0);
      return d;
    };

    const classes: TrialClass[] = [
      {
        id: "cls_available",
        title: "Science Explorers — Trial",
        subject: "Science",
        starts_at: iso(addDays(2)),
        capacity: 4,
        teacher_name: "Ms. Putri",
      },
      {
        id: "cls_almost_full",
        title: "Math Masters — Trial",
        subject: "Math",
        starts_at: iso(addDays(3)),
        capacity: 4,
        teacher_name: "Mr. Adi",
      },
      {
        id: "cls_full",
        title: "Robotics Intro — Trial",
        subject: "Science",
        starts_at: iso(addDays(1)),
        capacity: 4,
        teacher_name: "Mr. Ken",
      },
      {
        id: "cls_race",
        title: "Space Lab — Trial (Race Test)",
        subject: "Science",
        starts_at: iso(addDays(4)),
        capacity: 4,
        teacher_name: "Dr. Nova",
      },
    ];
    classes.forEach((c) => this.state.trialClasses.set(c.id, c));

    // Seed confirmed bookings:
    // cls_almost_full has exactly 3 confirmed -> 1 seat left (race scenario base)
    const seedBookings: Booking[] = [
      {
        id: "bk_1",
        student_id: "stu_3",
        trial_class_id: "cls_almost_full",
        parent_id: "par_2",
        status: "confirmed",
        created_at: iso(new Date(Date.now() - 86400000)),
        updated_at: iso(new Date(Date.now() - 86400000)),
      },
      {
        id: "bk_2",
        student_id: "stu_4",
        trial_class_id: "cls_almost_full",
        parent_id: "par_3",
        status: "confirmed",
        created_at: iso(new Date(Date.now() - 80000000)),
        updated_at: iso(new Date(Date.now() - 80000000)),
      },
      {
        id: "bk_3",
        student_id: "stu_5",
        trial_class_id: "cls_almost_full",
        parent_id: "par_4",
        status: "confirmed",
        created_at: iso(new Date(Date.now() - 70000000)),
        updated_at: iso(new Date(Date.now() - 70000000)),
      },
      // cls_full has 4 confirmed -> full
      {
        id: "bk_4",
        student_id: "stu_1",
        trial_class_id: "cls_full",
        parent_id: "par_1",
        status: "confirmed",
        created_at: iso(new Date(Date.now() - 90000000)),
        updated_at: iso(new Date(Date.now() - 90000000)),
      },
      {
        id: "bk_5",
        student_id: "stu_2",
        trial_class_id: "cls_full",
        parent_id: "par_1",
        status: "confirmed",
        created_at: iso(new Date(Date.now() - 85000000)),
        updated_at: iso(new Date(Date.now() - 85000000)),
      },
      {
        id: "bk_6",
        student_id: "stu_3",
        trial_class_id: "cls_full",
        parent_id: "par_2",
        status: "confirmed",
        created_at: iso(new Date(Date.now() - 84000000)),
        updated_at: iso(new Date(Date.now() - 84000000)),
      },
      {
        id: "bk_7",
        student_id: "stu_4",
        trial_class_id: "cls_full",
        parent_id: "par_3",
        status: "confirmed",
        created_at: iso(new Date(Date.now() - 83000000)),
        updated_at: iso(new Date(Date.now() - 83000000)),
      },
      // cls_race has 3 confirmed -> last seat race (same as almost_full but dedicated to race test)
      {
        id: "bk_8",
        student_id: "stu_1",
        trial_class_id: "cls_race",
        parent_id: "par_1",
        status: "confirmed",
        created_at: iso(new Date(Date.now() - 60000000)),
        updated_at: iso(new Date(Date.now() - 60000000)),
      },
      {
        id: "bk_9",
        student_id: "stu_2",
        trial_class_id: "cls_race",
        parent_id: "par_1",
        status: "confirmed",
        created_at: iso(new Date(Date.now() - 59000000)),
        updated_at: iso(new Date(Date.now() - 59000000)),
      },
      {
        id: "bk_10",
        student_id: "stu_3",
        trial_class_id: "cls_race",
        parent_id: "par_2",
        status: "confirmed",
        created_at: iso(new Date(Date.now() - 58000000)),
        updated_at: iso(new Date(Date.now() - 58000000)),
      },
      // duplicate booking attempt seed: stu_1 already pending for cls_available? We'll create a pending
      {
        id: "bk_dup_pending",
        student_id: "stu_1",
        trial_class_id: "cls_available",
        parent_id: "par_1",
        status: "pending_payment",
        created_at: iso(new Date(Date.now() - 50000000)),
        updated_at: iso(new Date(Date.now() - 50000000)),
      },
      // payment failure seed
      {
        id: "bk_failed",
        student_id: "stu_6",
        trial_class_id: "cls_available",
        parent_id: "par_2",
        status: "payment_failed",
        created_at: iso(new Date(Date.now() - 40000000)),
        updated_at: iso(new Date(Date.now() - 40000000)),
      },
    ];
    seedBookings.forEach((b) => this.state.bookings.set(b.id, b));

    // payment attempts for failed case
    this.state.payments.set("pay_failed_1", {
      id: "pay_failed_1",
      booking_id: "bk_failed",
      status: "failed",
      amount_cents: 50000,
      provider_ref: "mock_fail_001",
      created_at: iso(new Date(Date.now() - 40000000)),
    });
  }

  // ---- helpers ----
  private nowIso() {
    return new Date().toISOString();
  }

  private genId(prefix: string) {
    // Best practice: use crypto.randomUUID (RFC4122 v4) — collision-safe,
    // lexicographically sortable when needed use ulid; avoids Math.random bias.
    // Prefix keeps IDs human-scannable in logs (bk_, pay_) without losing entropy.
    return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  }

  // Debug/observability helper — replaces leaky (store as any).state access
  // Best practice: repository never exposes internal Map; expose projection instead.
  dump() {
    return {
      parents: [...this.state.parents.values()],
      students: [...this.state.students.values()],
      trialClasses: [...this.state.trialClasses.values()],
      bookings: [...this.state.bookings.values()],
      payments: [...this.state.payments.values()],
    };
  }

  getAllBookings(): Booking[] {
    return [...this.state.bookings.values()];
  }

  countConfirmed(classId: string): number {
    let c = 0;
    for (const b of this.state.bookings.values()) {
      if (b.trial_class_id === classId && b.status === "confirmed") c++;
    }
    return c;
  }

  // ---- public API ----

  getParents(): Parent[] {
    return [...this.state.parents.values()];
  }

  getStudents(): Student[] {
    return [...this.state.students.values()];
  }

  getStudentsByParent(parentId: string): Student[] {
    return [...this.state.students.values()].filter((s) => s.parent_id === parentId);
  }

  getTrialClasses(): TrialClassWithAvailability[] {
    return [...this.state.trialClasses.values()].map((c) => {
      const confirmed = this.countConfirmed(c.id);
      return {
        ...c,
        confirmed_count: confirmed,
        available_seats: Math.max(0, c.capacity - confirmed),
        is_full: confirmed >= c.capacity,
      };
    });
  }

  getTrialClass(id: string): TrialClassWithAvailability | null {
    const c = this.state.trialClasses.get(id);
    if (!c) return null;
    const confirmed = this.countConfirmed(id);
    return {
      ...c,
      confirmed_count: confirmed,
      available_seats: Math.max(0, c.capacity - confirmed),
      is_full: confirmed >= c.capacity,
    };
  }

  getBooking(id: string): Booking | null {
    return this.state.bookings.get(id) ?? null;
  }

  getBookingsForClass(classId: string): Booking[] {
    return [...this.state.bookings.values()].filter((b) => b.trial_class_id === classId);
  }

  getBookingsForStudentClass(studentId: string, classId: string): Booking[] {
    return [...this.state.bookings.values()].filter(
      (b) => b.student_id === studentId && b.trial_class_id === classId
    );
  }

  getRoster(classId: string): RosterEntry[] {
    const bookings = [...this.state.bookings.values()]
      .filter((b) => b.trial_class_id === classId && b.status === "confirmed")
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    return bookings.map((b) => {
      const student = this.state.students.get(b.student_id)!;
      const parent = this.state.parents.get(b.parent_id)!;
      return {
        booking_id: b.id,
        student,
        parent,
        booking_status: b.status,
        booked_at: b.created_at,
      };
    });
  }

  getPaymentsForBooking(bookingId: string): PaymentAttempt[] {
    return [...this.state.payments.values()].filter((p) => p.booking_id === bookingId);
  }

  // Create pending booking — thin, fast, no lock.
  // Best practice: keep creation cheap & non-blocking; capacity is checked only
  // at confirm time to avoid holding inventory for abandoners.
  // Invariants enforced here (fail-fast, no DB lock needed):
  //  - FK existence (parents, students, trial_classes)
  //  - Authorization: student.parent_id === parent_id (otherwise FORBIDDEN)
  //  - Idempotency guard: reject if pending_payment|confirmed exists for (student, class)
  //    Note: payment_failed/cancelled do NOT block — allows retry, matches product spec.
  // Returns 409 DUPLICATE_BOOKING on double-submit (double-click safe).
  createPendingBooking(params: {
    parent_id: string;
    student_id: string;
    trial_class_id: string;
  }): { booking: Booking } | { error: string; code: string } {
    const { parent_id, student_id, trial_class_id } = params;

    // validate existence
    if (!this.state.parents.has(parent_id)) return { error: "Parent not found", code: "PARENT_NOT_FOUND" };
    const student = this.state.students.get(student_id);
    if (!student) return { error: "Student not found", code: "STUDENT_NOT_FOUND" };
    if (student.parent_id !== parent_id) return { error: "Student does not belong to parent", code: "FORBIDDEN" };
    const trialClass = this.state.trialClasses.get(trial_class_id);
    if (!trialClass) return { error: "Trial class not found", code: "CLASS_NOT_FOUND" };

    // duplicate check: any pending_payment or confirmed for same student+class -> reject
    for (const b of this.state.bookings.values()) {
      if (
        b.student_id === student_id &&
        b.trial_class_id === trial_class_id &&
        (b.status === "pending_payment" || b.status === "confirmed")
      ) {
        return { error: "Duplicate booking: child already has pending/confirmed booking for this class", code: "DUPLICATE_BOOKING" };
      }
    }

    const now = this.nowIso();
    const booking: Booking = {
      id: this.genId("bk"),
      student_id,
      trial_class_id,
      parent_id,
      status: "pending_payment",
      created_at: now,
      updated_at: now,
    };
    this.state.bookings.set(booking.id, booking);
    return { booking };
  }

  // Confirm booking — THE critical section. Must be atomic.
  // Best practice: “check-then-act” must be inside a single transaction/lock.
  // Naive read-then-write (read available=1, both write) → 5/4 overbooking bug.
  // Correct: serialize per class, re-read inside lock, then decide.
  // Postgres equivalent (see supabase/schema.sql confirm_booking()):
  //   BEGIN;
  //   SELECT * FROM trial_classes WHERE id = $1 FOR UPDATE; -- row lock = mutexFor(classId)
  //   SELECT COUNT(*) FROM bookings WHERE trial_class_id=$1 AND status='confirmed';
  //   -- 1) duplicate confirmed? → 409 DUPLICATE_BOOKING (also partial unique index)
  //   -- 2) capacity >= 4?     → 409 CLASS_FULL
  //   UPDATE bookings SET status='confirmed' WHERE id=$2;
  //   INSERT INTO payment_attempts ... status='succeeded'
  //   COMMIT;
  // In-memory analog: per-class Mutex (row-level lock). Holds lock ONLY for
  // local DB work — payment provider call stays OUTSIDE the lock (see api/pay route).
  // Idempotent: re-confirming an already-confirmed booking returns same payment.
  async confirmBooking(params: {
    booking_id: string;
    provider_ref?: string;
    amount_cents?: number;
  }): Promise<{ booking: Booking; payment: PaymentAttempt } | { error: string; code: string }> {
    const booking = this.state.bookings.get(params.booking_id);
    if (!booking) return { error: "Booking not found", code: "BOOKING_NOT_FOUND" };
    if (booking.status !== "pending_payment") {
      // idempotent: if already confirmed, return it
      if (booking.status === "confirmed") {
        const pay = [...this.state.payments.values()].find((p) => p.booking_id === booking.id && p.status === "succeeded");
        if (pay) return { booking, payment: pay };
        return { error: `Booking already ${booking.status}`, code: "INVALID_STATUS" };
      }
      return { error: `Booking status is ${booking.status}, cannot confirm`, code: "INVALID_STATUS" };
    }

    const classId = booking.trial_class_id;
    const release = await this.mutexFor(classId).acquire();
    try {
      // Re-fetch inside critical section
      const fresh = this.state.bookings.get(params.booking_id)!;
      if (fresh.status !== "pending_payment") {
        if (fresh.status === "confirmed") {
          const pay = [...this.state.payments.values()].find((p) => p.booking_id === fresh.id && p.status === "succeeded");
          if (pay) return { booking: fresh, payment: pay };
        }
        return { error: `Booking status changed to ${fresh.status}`, code: "INVALID_STATUS" };
      }

      // duplicate confirmed check (partial unique index simulation)
      for (const b of this.state.bookings.values()) {
        if (
          b.id !== fresh.id &&
          b.student_id === fresh.student_id &&
          b.trial_class_id === fresh.trial_class_id &&
          b.status === "confirmed"
        ) {
          return { error: "Duplicate confirmed booking", code: "DUPLICATE_BOOKING" };
        }
      }

      // capacity check
      const confirmedCount = this.countConfirmed(classId);
      const trialClass = this.state.trialClasses.get(classId)!;
      if (confirmedCount >= trialClass.capacity) {
        // Do NOT auto-fail booking here; caller decides to mark failed or retry.
        // We mark as payment_failed with reason capacity to make UI clear, but per spec
        // we could also keep pending and return error. Here we return error and let caller handle.
        return { error: "Class is full (capacity 4 reached)", code: "CLASS_FULL" };
      }

      // All checks pass -> confirm
      const now = this.nowIso();
      const updated: Booking = { ...fresh, status: "confirmed", updated_at: now };
      this.state.bookings.set(updated.id, updated);

      const payment: PaymentAttempt = {
        id: this.genId("pay"),
        booking_id: updated.id,
        status: "succeeded",
        amount_cents: params.amount_cents ?? 99000,
        provider_ref: params.provider_ref ?? `mock_${Date.now()}`,
        created_at: now,
      };
      this.state.payments.set(payment.id, payment);

      // small artificial delay to expose race if mutex not held (for testing)
      // await new Promise(r => setTimeout(r, 10));

      return { booking: updated, payment };
    } finally {
      release();
    }
  }

  // Mark payment as failed — terminal, no seat taken.
  // Best practice: roster query is WHERE status='confirmed' only, so failed
  // bookings never affect capacity. Keep audit trail in payment_attempts.
  // Allows retry: new pending can be created for same (student,class) after failure.
  async failBookingPayment(params: {
    booking_id: string;
    reason?: string;
    provider_ref?: string;
  }): Promise<{ booking: Booking; payment: PaymentAttempt } | { error: string; code: string }> {
    const booking = this.state.bookings.get(params.booking_id);
    if (!booking) return { error: "Booking not found", code: "BOOKING_NOT_FOUND" };
    if (booking.status !== "pending_payment") {
      return { error: `Cannot fail payment for booking status ${booking.status}`, code: "INVALID_STATUS" };
    }

    const now = this.nowIso();
    const updated: Booking = { ...booking, status: "payment_failed", updated_at: now };
    this.state.bookings.set(booking.id, updated);

    const payment: PaymentAttempt = {
      id: this.genId("pay"),
      booking_id: booking.id,
      status: "failed",
      amount_cents: 99000,
      provider_ref: params.provider_ref ?? `mock_fail_${Date.now()}`,
      created_at: now,
    };
    this.state.payments.set(payment.id, payment);

    return { booking: updated, payment };
  }

  cancelBooking(bookingId: string): { booking: Booking } | { error: string; code: string } {
    const b = this.state.bookings.get(bookingId);
    if (!b) return { error: "Booking not found", code: "BOOKING_NOT_FOUND" };
    if (b.status === "confirmed") {
      // In real system we might need to handle refund, but for trial we allow cancel to free seat
    }
    const now = this.nowIso();
    const updated = { ...b, status: "cancelled" as BookingStatus, updated_at: now };
    this.state.bookings.set(b.id, updated);
    return { booking: updated };
  }
}

// Singleton global store (persists across hot reloads in dev via globalThis)
const globalForStore = globalThis as unknown as { __ottodot_store?: InMemoryStore };

export const store = globalForStore.__ottodot_store ?? new InMemoryStore();
if (!globalForStore.__ottodot_store) {
  globalForStore.__ottodot_store = store;
  store.reset();
}
