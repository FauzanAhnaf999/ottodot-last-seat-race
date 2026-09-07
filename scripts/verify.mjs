#!/usr/bin/env node
// Verification script — runs against store directly (no HTTP needed)
// Checks: duplicate, overbooking, payment failure, last-seat race

import { store } from "../lib/store.ts";

async function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function run() {
  console.log("== Ottodot Verification ==\n");
  let passed = 0, failed = 0;
  const test = async (name, fn) => {
    try { await fn(); console.log(`✓ ${name}`); passed++; }
    catch (e) { console.log(`✗ ${name}: ${e.message}`); failed++; }
  };

  // Reset
  await store.reset();

  await test("Seed: cls_almost_full has 3 confirmed, 1 left", async () => {
    const c = await store.getTrialClass("cls_almost_full");
    await assert(c.confirmed_count === 3, `expected 3 got ${c.confirmed_count}`);
    await assert(c.available_seats === 1, `expected 1 got ${c.available_seats}`);
  });

  await test("Seed: cls_full has 4 confirmed, 0 left", async () => {
    const c = await store.getTrialClass("cls_full");
    await assert(c.confirmed_count === 4, `got ${c.confirmed_count}`);
    await assert(c.is_full === true, "should be full");
  });

  await test("Seed: cls_available has 0 confirmed", async () => {
    const c = await store.getTrialClass("cls_available");
    await assert(c.confirmed_count === 0, `got ${c.confirmed_count}`);
  });

  await test("Duplicate pending rejected", async () => {
    const res = await store.createPendingBooking({ parent_id: "par_1", student_id: "stu_1", trial_class_id: "cls_available" });
    await assert("error" in res, "should have error");
    await assert(res.code === "DUPLICATE_BOOKING", `code ${res.code}`);
  });

  await test("Available seat: create + confirm succeeds", async () => {
    const p = await store.createPendingBooking({ parent_id: "par_2", student_id: "stu_6", trial_class_id: "cls_available" });
    let booking;
    if ("error" in p) {
      const p2 = await store.createPendingBooking({ parent_id: "par_3", student_id: "stu_7", trial_class_id: "cls_available" });
      await assert(!("error" in p2), `p2 error ${p2.error}`);
      booking = p2.booking;
    } else {
      booking = p.booking;
    }
    const conf = await store.confirmBooking({ booking_id: booking.id });
    await assert(!("error" in conf), `confirm error ${conf.error}`);
    await assert(conf.booking.status === "confirmed", "should be confirmed");
    const c = await store.getTrialClass("cls_available");
    await assert(c.confirmed_count === 1, `expected 1 got ${c.confirmed_count}`);
  });

  await test("Duplicate confirmed rejected", async () => {
    await store.reset();
    const p1 = await store.createPendingBooking({ parent_id: "par_3", student_id: "stu_7", trial_class_id: "cls_available" });
    await assert(!("error" in p1), "p1 should succeed");
    const c1 = await store.confirmBooking({ booking_id: p1.booking.id });
    await assert(!("error" in c1), "c1 should succeed");
    const p2 = await store.createPendingBooking({ parent_id: "par_3", student_id: "stu_7", trial_class_id: "cls_available" });
    await assert("error" in p2, "p2 should be duplicate error");
    await assert(p2.code === "DUPLICATE_BOOKING", `code ${p2.code}`);
  });

  await test("Payment failure does NOT add to roster", async () => {
    await store.reset();
    const p = await store.createPendingBooking({ parent_id: "par_3", student_id: "stu_7", trial_class_id: "cls_available" });
    await assert(!("error" in p), "create should succeed");
    const fail = await store.failBookingPayment({ booking_id: p.booking.id });
    await assert(!("error" in fail), `fail error ${fail.error}`);
    await assert(fail.booking.status === "payment_failed", `status ${fail.booking.status}`);
    const roster = await store.getRoster("cls_available");
    const found = roster.find((r) => r.student.id === "stu_7");
    await assert(!found, "failed booking should not be on roster");
    const c = await store.getTrialClass("cls_available");
    await assert(c.confirmed_count === 0, `confirmed should be 0 got ${c.confirmed_count}`);
  });

  await test("Overbooking beyond 4 prevented", async () => {
    await store.reset();
    const p1 = await store.createPendingBooking({ parent_id: "par_1", student_id: "stu_1", trial_class_id: "cls_almost_full" });
    const p2 = await store.createPendingBooking({ parent_id: "par_1", student_id: "stu_2", trial_class_id: "cls_almost_full" });
    await assert(!("error" in p1), `p1 ${p1.error}`);
    await assert(!("error" in p2), `p2 ${p2.error}`);
    const c1 = await store.confirmBooking({ booking_id: p1.booking.id });
    const c2 = await store.confirmBooking({ booking_id: p2.booking.id });
    const successes = [c1, c2].filter((r) => !("error" in r));
    const failures = [c1, c2].filter((r) => "error" in r);
    await assert(successes.length === 1, `expected 1 success got ${successes.length}`);
    await assert(failures.length === 1, `expected 1 failure`);
    await assert(failures[0].code === "CLASS_FULL", `expected CLASS_FULL got ${failures[0].code}`);
    const cls = await store.getTrialClass("cls_almost_full");
    await assert(cls.confirmed_count === 4, `should be 4 got ${cls.confirmed_count}`);
  });

  await test("Last-seat race: concurrent confirms, only one wins (cls_race)", async () => {
    await store.reset();
    const pA = await store.createPendingBooking({ parent_id: "par_3", student_id: "stu_7", trial_class_id: "cls_race" });
    const pB = await store.createPendingBooking({ parent_id: "par_4", student_id: "stu_5", trial_class_id: "cls_race" });
    let bA, bB;
    if ("error" in pA || "error" in pB) {
      const pA2 = await store.createPendingBooking({ parent_id: "par_2", student_id: "stu_6", trial_class_id: "cls_race" });
      const pB2 = await store.createPendingBooking({ parent_id: "par_3", student_id: "stu_7", trial_class_id: "cls_race" });
      await assert(!("error" in pA2), `pA2 ${pA2.error}`);
      await assert(!("error" in pB2), `pB2 ${pB2.error}`);
      bA = pA2.booking; bB = pB2.booking;
    } else {
      bA = pA.booking; bB = pB.booking;
    }
    const [rA, rB] = await Promise.all([
      store.confirmBooking({ booking_id: bA.id }),
      store.confirmBooking({ booking_id: bB.id }),
    ]);
    const successes = [rA, rB].filter((r) => !("error" in r));
    const failures = [rA, rB].filter((r) => "error" in r);
    await assert(successes.length === 1, `race: expected 1 success, got ${successes.length} — ${JSON.stringify([rA, rB], null, 2)}`);
    await assert(failures.length === 1, `race: expected 1 failure`);
    await assert(failures[0].code === "CLASS_FULL", `failure should be CLASS_FULL got ${failures[0].code}`);
    const cls = await store.getTrialClass("cls_race");
    await assert(cls.confirmed_count === 4, `cls_race should be 4 got ${cls.confirmed_count}`);
    const roster = await store.getRoster("cls_race");
    await assert(roster.length === 4, `roster length ${roster.length}`);
  });

  await test("Idempotency: confirming already confirmed returns same", async () => {
    await store.reset();
    const p = await store.createPendingBooking({ parent_id: "par_3", student_id: "stu_7", trial_class_id: "cls_available" });
    await assert(!("error" in p), "create ok");
    const c1 = await store.confirmBooking({ booking_id: p.booking.id });
    await assert(!("error" in c1), "first confirm ok");
    const c2 = await store.confirmBooking({ booking_id: p.booking.id });
    await assert(!("error" in c2) || c2.code === "INVALID_STATUS", "second confirm should be idempotent or invalid");
  });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
