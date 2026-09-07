#!/usr/bin/env node
// Simulates last-seat race via HTTP (requires dev server running)
// Usage: pnpm race  (defaults to http://localhost:3000)

const base = process.env.BASE_URL || "http://localhost:3000";

async function post(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function run() {
  console.log(`\n== Last-Seat Race (HTTP) against ${base} ==\n`);

  // reset seed
  const reset = await post("/api/seed", {});
  console.log("Seed reset:", reset.json.ok ? "ok" : reset.json);

  // Show initial class states
  const classesRes = await fetch(`${base}/api/trial-classes`).then((r) => r.json());
  const raceClass = classesRes.data.find((c) => c.id === "cls_race");
  console.log(`cls_race initial: ${raceClass.confirmed_count}/${raceClass.capacity} (available ${raceClass.available_seats})`);

  // Create two pending bookings for the last seat
  // Use stu_6 (Riko) and stu_7 (Sam) — neither is confirmed in cls_race
  const bokA = await post("/api/bookings", {
    parent_id: "par_2",
    student_id: "stu_6",
    trial_class_id: "cls_race",
  });
  console.log("\nBooking A (stu_6 → cls_race):", bokA.status, bokA.json);

  const bokB = await post("/api/bookings", {
    parent_id: "par_3",
    student_id: "stu_7",
    trial_class_id: "cls_race",
  });
  console.log("Booking B (stu_7 → cls_race):", bokB.status, bokB.json);

  if (!bokA.ok || !bokB.ok) {
    console.log("\n⚠️  Could not create both bookings — maybe duplicate or class full. Reset and try again.");
    process.exit(1);
  }

  const idA = bokA.json.data.id;
  const idB = bokB.json.data.id;

  console.log(`\nBoth users now at payment step for the SAME last seat.`);
  console.log(`A = ${idA} (Riko), B = ${idB} (Sam)`);
  console.log(`\n→ B pays FIRST (simulating faster payment)`);
  const payB = await post(`/api/bookings/${idB}/pay`, { simulate: "success" });
  console.log(`B pay result: ${payB.status}`, payB.json);

  console.log(`\n→ A tries to pay AFTER (seat already taken)`);
  const payA = await post(`/api/bookings/${idA}/pay`, { simulate: "success" });
  console.log(`A pay result: ${payA.status}`, payA.json);

  // Concurrent version (fire both at once) to test mutex
  console.log(`\n--- Also testing concurrent pays (Promise.all) ---`);
  await post("/api/seed", {});
  const cA = await post("/api/bookings", { parent_id: "par_2", student_id: "stu_6", trial_class_id: "cls_race" });
  const cB = await post("/api/bookings", { parent_id: "par_3", student_id: "stu_7", trial_class_id: "cls_race" });
  const [concA, concB] = await Promise.all([
    post(`/api/bookings/${cA.json.data.id}/pay`, { simulate: "success" }),
    post(`/api/bookings/${cB.json.data.id}/pay`, { simulate: "success" }),
  ]);
  console.log("Concurrent A:", concA.status, concA.json.code || concA.json.data?.status);
  console.log("Concurrent B:", concB.status, concB.json.code || concB.json.data?.status);
  const successes = [concA, concB].filter((r) => r.ok).length;
  console.log(`\nConcurrent result: ${successes} succeeded, ${2 - successes} failed (expected 1/1)`);

  // Final roster
  const roster = await fetch(`${base}/api/roster/cls_race`).then((r) => r.json());
  console.log(`\nFinal roster cls_race: ${roster.data.confirmed_count}/${roster.data.capacity}`);
  roster.data.roster.forEach((r) => console.log(` - ${r.student.name} (${r.parent.name})`));

  if (roster.data.confirmed_count > 4) {
    console.log("\n❌ FAILED: overbooking! >4 confirmed");
    process.exit(1);
  } else if (successes === 1) {
    console.log("\n✓ PASSED: at most one user got the last seat");
  } else {
    console.log("\n⚠️  Check: expected exactly 1 success in concurrent test");
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
