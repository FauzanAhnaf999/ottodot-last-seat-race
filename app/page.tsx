"use client";

import { useEffect, useState } from "react";

type TrialClass = {
  id: string;
  title: string;
  subject: string;
  starts_at: string;
  capacity: number;
  teacher_name: string;
  confirmed_count: number;
  available_seats: number;
  is_full: boolean;
};

type Parent = { id: string; name: string; email: string };
type Student = { id: string; parent_id: string; name: string; age: number };
type Booking = { id: string; status: string; student_id: string; trial_class_id: string; created_at: string };

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

export default function Home() {
  const [parents, setParents] = useState<Parent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<TrialClass[]>([]);
  const [selectedParent, setSelectedParent] = useState<string>("");
  const [selectedStudent, setSelectedStudent] = useState<string>("");
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [rosterPreview, setRosterPreview] = useState<any>(null);
  const [bookedStudentName, setBookedStudentName] = useState<string>("");
  const [bookedClassTitle, setBookedClassTitle] = useState<string>("");
  const [childBookings, setChildBookings] = useState<Booking[]>([]);
  const [classBreakdown, setClassBreakdown] = useState<Record<string, number> | null>(null);
  const [showHelper, setShowHelper] = useState(true);
  const [toast, setToast] = useState<string>("");

  async function refresh() {
    const [pRes, cRes] = await Promise.all([fetch("/api/parents"), fetch("/api/trial-classes")]);
    const pJson = await pRes.json();
    const cJson = await cRes.json();
    setParents(pJson.data);
    setClasses(cJson.data);
    if (!selectedParent && pJson.data[0]) setSelectedParent(pJson.data[0].id);
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!selectedParent) return;
    fetch(`/api/students?parentId=${selectedParent}`)
      .then((r) => r.json())
      .then((j) => {
        setStudents(j.data);
        setSelectedStudent(j.data[0]?.id ?? "");
      });
  }, [selectedParent]);

  // fetch bookings for selected child (for per-class badge + history)
  useEffect(() => {
    if (!selectedStudent) { setChildBookings([]); return; }
    fetch(`/api/bookings?studentId=${selectedStudent}`)
      .then((r) => r.json())
      .then((j) => setChildBookings(j.data?.bookings ?? []))
      .catch(() => setChildBookings([]));
  }, [selectedStudent, booking?.id]);

  // fetch breakdown for selected class (for pending hint)
  useEffect(() => {
    if (!selectedClass) { setClassBreakdown(null); setRosterPreview(null); return; }
    fetch(`/api/bookings?classId=${selectedClass}`)
      .then((r) => r.json())
      .then((j) => setClassBreakdown(j.data?.breakdown ?? null))
      .catch(() => setClassBreakdown(null));
    fetchRoster(selectedClass);
  }, [selectedClass]);

  function childStatusFor(classId: string): Booking | undefined {
    return childBookings.find((b) => b.trial_class_id === classId && (b.status === "pending_payment" || b.status === "confirmed"));
  }

  async function handleCreateBooking() {
    setErrorMsg("");
    setStatusMsg("");
    setLoading(true);
    try {
      const snapStudentName = students.find((s) => s.id === selectedStudent)?.name ?? selectedStudent;
      const snapClassTitle = classes.find((c) => c.id === selectedClass)?.title ?? selectedClass;
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parent_id: selectedParent,
          student_id: selectedStudent,
          trial_class_id: selectedClass,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.code === "DUPLICATE_BOOKING") {
          const existing = childStatusFor(selectedClass);
          const isSeededDuplicate = selectedStudent === "stu_1" && selectedClass === "cls_available";
          const hint = isSeededDuplicate
            ? " Hint: Kiko (stu_1) is the seeded duplicate for Science Explorers — try Milo Rahayu (7y) for this class instead."
            : existing
              ? ` You already have ${existing.status} ${existing.id} for this class — use Mock Pay below or pick another child/class.`
              : "";
          setErrorMsg(`DUPLICATE_BOOKING: This child already has a pending/confirmed booking for this class.${hint}`);
          if (existing) setBooking(existing as Booking);
        } else {
          setErrorMsg(`${json.code ?? "ERROR"}: ${json.error}`);
        }
        return;
      }
      setBooking(json.data);
      setBookedStudentName(snapStudentName);
      setBookedClassTitle(snapClassTitle);
      setStatusMsg(`Booking created — status: ${json.data.status}. Now simulate payment.`);
      setToast(`Pending created for ${snapStudentName} → ${snapClassTitle}`);
      setTimeout(() => setToast(""), 3000);
      refresh();
    } catch (e: any) {
      setErrorMsg(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handlePay(simulate: "success" | "failure") {
    if (!booking) return;
    setErrorMsg("");
    setStatusMsg("");
    setLoading(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simulate }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(`${json.code}: ${json.error}`);
        if (json.code === "CLASS_FULL") {
          setStatusMsg("Payment blocked — class became full. At most 1 seat was given. Try another class.");
        }
        return;
      }
      setBooking(json.data);
      const msg = simulate === "success" ? `✓ Confirmed! ${bookedStudentName || "Child"} is now on the roster for ${bookedClassTitle || selectedClass}` : `Payment failed — ${bookedStudentName || "Child"} not added to roster (you can retry with a new booking)`;
      setStatusMsg(msg);
      setToast(msg);
      setTimeout(() => setToast(""), 4000);
      refresh();
      if (selectedClass) {
        const r = await fetch(`/api/roster/${selectedClass}`).then((x) => x.json());
        setRosterPreview(r.data);
        // also refresh breakdown
        const b = await fetch(`/api/bookings?classId=${selectedClass}`).then((x) => x.json());
        setClassBreakdown(b.data?.breakdown ?? null);
      }
    } catch (e: any) {
      setErrorMsg(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function fetchRoster(cid: string) {
    const r = await fetch(`/api/roster/${cid}`).then((x) => x.json());
    setRosterPreview(r.data);
  }

  const selectedClassObj = classes.find((c) => c.id === selectedClass);
  const isSelectedFull = !!selectedClassObj?.is_full;
  const selectedChildObj = students.find((s) => s.id === selectedStudent);
  const childStatus = selectedClass ? childStatusFor(selectedClass) : undefined;

  return (
    <main className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-xs text-emerald-900">
        <span className="font-semibold">Vercel is Supabase-backed (persistent)</span> — race now uses Postgres <code>confirm_booking() FOR UPDATE</code> (<code>supabase/schema.sql</code>). 2-tab race works across lambdas. Local fallback is still in-memory: <code className="bg-white border px-1 py-0.5 rounded">pnpm dev</code> + <code className="bg-white border px-1 py-0.5 rounded">pnpm verify</code> / <code className="bg-white border px-1 py-0.5 rounded">pnpm race</code>.
      </div>
      {showHelper && (
        <div className="mb-6 bg-sky-50 border border-sky-200 rounded-2xl px-4 py-3 flex items-start gap-3">
          <div className="text-sky-700 text-sm flex-1">
            <span className="font-semibold">First time? Try this:</span> Pick <b>Siti Rahayu → Milo Rahayu (7y) → Science Explorers 0/4</b> → Create → Mock Pay Success. <span className="text-zinc-600">Kiko is the intentional duplicate example for this class — that is why Milo works.</span>
          </div>
          <button onClick={() => setShowHelper(false)} className="text-xs text-sky-700 border border-sky-300 rounded-full px-2.5 py-1 hover:bg-sky-100">Dismiss</button>
        </div>
      )}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-zinc-900 text-white text-sm px-4 py-3 rounded-xl shadow-lg border border-zinc-800 max-w-sm">
          {toast}
        </div>
      )}
      <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-8">
        {/* Left: booking form */}
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Book a trial class</h1>
            <p className="text-sm text-zinc-600 mt-1">
              Choose child → pick class → mock payment. <b>Roster only counts confirmed</b> — pending/failed never take a seat. Capacity is 4.
            </p>
          </div>

          <div className="bg-white border rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Parent</span>
                <select
                  value={selectedParent}
                  onChange={(e) => setSelectedParent(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white truncate"
                  title={parents.find((p) => p.id === selectedParent)?.email ?? ""}
                >
                  {parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <div className="text-[11px] text-zinc-500 truncate">{parents.find((p) => p.id === selectedParent)?.email ?? ""}</div>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Child</span>
                <select
                  value={selectedStudent}
                  onChange={(e) => setSelectedStudent(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                >
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.age}y)
                    </option>
                  ))}
                </select>
                {childBookings.length > 0 && (
                  <div className="text-[11px] text-zinc-500">
                    This child has {childBookings.filter((b) => b.status === "pending_payment").length} pending • {childBookings.filter((b) => b.status === "confirmed").length} confirmed
                  </div>
                )}
              </label>
            </div>

            {/* Child history mini — clarity */}
            {selectedStudent && childBookings.length > 0 && (
              <div className="bg-zinc-50 border rounded-xl px-3 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">This child's bookings</div>
                <ul className="space-y-1">
                  {childBookings.slice(0, 3).map((b) => {
                    const cls = classes.find((c) => c.id === b.trial_class_id)?.title ?? b.trial_class_id;
                    return (
                      <li key={b.id} className="flex items-center gap-2 text-xs">
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${b.status === "confirmed" ? "bg-emerald-100 text-emerald-700" : b.status === "pending_payment" ? "bg-amber-100 text-amber-700" : b.status === "payment_failed" ? "bg-red-100 text-red-700" : "bg-zinc-200"}`}>{b.status}</span>
                        <span className="truncate">{cls}</span>
                        <span className="text-zinc-400">{new Date(b.created_at).toLocaleDateString()}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Available trial classes</div>
                {classBreakdown && selectedClass && (
                  <div className="text-[11px] text-zinc-500">
                    {classBreakdown.confirmed} confirmed • {classBreakdown.pending_payment} pending • {classBreakdown.payment_failed} failed
                  </div>
                )}
              </div>
              <div className="grid gap-2">
                {classes.map((c) => {
                  const status = childStatusFor(c.id);
                  const isSelected = selectedClass === c.id;
                  return (
                    <label
                      key={c.id}
                      className={`flex items-center gap-3 border rounded-xl px-4 py-3 transition ${
                        c.is_full ? "opacity-40 cursor-not-allowed bg-zinc-50" : "cursor-pointer"
                      } ${isSelected ? "border-zinc-900 bg-zinc-900 text-white" : "bg-white hover:bg-zinc-50"}`}
                    >
                      <input
                        type="radio"
                        name="trialClass"
                        disabled={c.is_full}
                        checked={isSelected}
                        onChange={() => {
                          if (c.is_full) return;
                          setSelectedClass(c.id);
                        }}
                        className="accent-zinc-900 disabled:opacity-50"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-sm font-medium truncate">{c.title}</div>
                          {status && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${status.status === "confirmed" ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"}`}>
                              {status.status === "confirmed" ? "You’re confirmed" : "You have pending"}
                            </span>
                          )}
                        </div>
                        <div className={`text-xs ${isSelected ? "text-zinc-300" : "text-zinc-500"} flex gap-2 flex-wrap items-center`}>
                          <span>{c.teacher_name}</span>
                          <span>•</span>
                          <span>{fmtDate(c.starts_at)}</span>
                          <span>•</span>
                          <span className={c.is_full ? "text-red-500 font-semibold" : ""}>
                            {c.confirmed_count}/{c.capacity} confirmed • {c.available_seats} left {c.is_full && "— FULL"}
                          </span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
              {selectedChildObj && selectedClassObj && childStatus && (
                <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
                  ⓘ {selectedChildObj.name} already has <b>{childStatus.status}</b> for {selectedClassObj.title} ({childStatus.id}). {childStatus.status === "pending_payment" ? "Pay it below or pick another child/class." : "Pick another child or class."}
                </div>
              )}
              {selectedClassObj && classBreakdown && (
                <div className="text-[11px] text-zinc-500 bg-zinc-50 border rounded-lg px-3 py-2">
                  Roster counts <b>only confirmed</b>: {classBreakdown.confirmed} confirmed on roster • {classBreakdown.pending_payment} pending (not counted) • {classBreakdown.payment_failed} failed (can retry)
                </div>
              )}
            </div>

            <button
              onClick={handleCreateBooking}
              disabled={!selectedParent || !selectedStudent || !selectedClass || loading || isSelectedFull || !!childStatus}
              className="w-full bg-orange-600 text-white rounded-full py-2.5 text-sm font-medium hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title={isSelectedFull ? "Class is full (4/4) — pick another class" : childStatus ? `Already ${childStatus.status} for this child+class` : undefined}
            >
              {isSelectedFull ? "Class full — pick another" : childStatus ? `${childStatus.status === "confirmed" ? "Already confirmed" : "Already pending"} — pick another` : loading ? "Processing…" : "Create pending booking"}
            </button>
            {isSelectedFull && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">This class is full (4/4). Roster is at capacity — please pick another trial class.</div>
            )}

            {errorMsg && (
              <div className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2">{errorMsg}</div>
            )}
            {statusMsg && (
              <div className="text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-3 py-2">
                {statusMsg}
              </div>
            )}

            {booking && (
              <div className="border rounded-xl p-4 bg-zinc-50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Booking {booking.id}</div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      booking.status === "confirmed"
                        ? "bg-emerald-600 text-white"
                        : booking.status === "payment_failed"
                          ? "bg-red-600 text-white"
                          : booking.status === "pending_payment"
                            ? "bg-amber-500 text-white"
                            : "bg-zinc-200"
                    }`}
                  >
                    {booking.status}
                  </span>
                </div>
                <div className="text-xs text-zinc-600">
                  Child: {bookedStudentName || students.find((s) => s.id === booking.student_id)?.name || booking.student_id} • Class: {bookedClassTitle || selectedClassObj?.title || booking.trial_class_id}
                </div>
                {booking.status === "pending_payment" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handlePay("success")}
                      disabled={loading}
                      className="flex-1 bg-zinc-900 text-white rounded-full py-2 text-sm font-medium hover:bg-black disabled:opacity-50"
                    >
                      Mock Pay Success
                    </button>
                    <button
                      onClick={() => handlePay("failure")}
                      disabled={loading}
                      className="flex-1 border rounded-full py-2 text-sm font-medium hover:bg-white disabled:opacity-50"
                    >
                      Mock Pay Fail
                    </button>
                  </div>
                )}
                {booking.status === "confirmed" && (
                  <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">✓ On the roster now. Check Roster preview on the right or <a href="/roster" className="underline">View all rosters</a>.</div>
                )}
                {booking.status === "payment_failed" && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">Not on roster — you can create a new pending booking for this child+class to retry.</div>
                )}
                <a href={`/api/bookings/${booking.id}`} target="_blank" className="text-xs underline text-zinc-500">
                  View booking JSON
                </a>
              </div>
            )}
          </div>

          <div className="bg-white border rounded-2xl p-5 space-y-3">
            <h3 className="font-medium text-sm">Edge cases to try</h3>
            <ul className="text-xs text-zinc-600 list-disc pl-4 space-y-1">
              <li>
                <b>Available:</b> Science Explorers 0/4 → try <b>Milo Rahayu</b> there (Kiko is the seeded duplicate, so Milo shows the happy path).
              </li>
              <li>
                <b>3/4 full:</b> Math Masters 3/4 → only 1 seat left. Create 2 pending for 2 different kids and race their payments (see script below).
              </li>
              <li>
                <b>Duplicate:</b> Kiko (stu_1) already has pending for Science Explorers → try again → expects 409. The UI now says “try Milo”.
              </li>
              <li>
                <b>Payment fail:</b> create booking then “Mock Pay Fail” → status payment_failed, NOT on roster (check preview: pending not counted).
              </li>
              <li>
                <b>Last-seat race:</b> use Space Lab 3/4. Open two tabs or run: <code className="bg-zinc-100 px-1 py-0.5 rounded">pnpm race</code>
              </li>
            </ul>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  await fetch("/api/seed", { method: "POST" });
                  refresh();
                  setBooking(null);
                  setStatusMsg("Seed reset — back to initial state.");
                  setErrorMsg("");
                  setToast("Seed reset");
                  setTimeout(() => setToast(""), 2000);
                }}
                className="text-xs border px-3 py-1.5 rounded-full hover:bg-zinc-50"
              >
                Reset seed
              </button>
              <a
                href="/roster"
                className="text-xs bg-zinc-900 text-white px-3 py-1.5 rounded-full hover:bg-black"
              >
                View roster page →
              </a>
            </div>
          </div>
        </div>

        {/* Right: status + roster preview */}
        <div className="space-y-6">
          <div className="bg-white border rounded-2xl p-5 shadow-sm">
            <h3 className="font-medium text-sm mb-3">How last-seat race is prevented</h3>
            <div className="text-xs text-zinc-600 space-y-2 leading-relaxed">
              <p>
                <b>Postgres:</b> <code>SELECT ... FOR UPDATE</code> on trial_classes row inside a transaction serializes
                confirmations. Capacity check happens <i>inside</i> the lock.
              </p>
              <p>
                <b>This demo (in-memory):</b> per-class mutex simulates row-level lock. Same invariant: at most one
                confirm can observe &lt;4 and succeed.
              </p>
              <p>
                <b>Duplicate:</b> partial unique index <code>WHERE status=&apos;confirmed&apos;</code> + app check.
              </p>
              <p>
                <b>Payment failure:</b> booking stays pending_payment until mock payment resolves; failure →{" "}
                <code>payment_failed</code>, never counted toward capacity.
              </p>
              <div className="bg-zinc-900 text-zinc-100 rounded-lg p-3 font-mono text-[11px] leading-relaxed">
                A selects last seat → pending<br />
                B selects same seat → pending<br />
                B pays first → locks row → 3→4 confirmed ✓<br />
                A pays next → locks row → 4≥4 → 409 CLASS_FULL ✗
              </div>
            </div>
          </div>

          {rosterPreview && (
            <div className="bg-white border rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-sm">Roster preview</h3>
                <span className="text-xs px-2 py-1 bg-zinc-900 text-white rounded-full">
                  {rosterPreview.confirmed_count}/{rosterPreview.capacity} confirmed
                </span>
              </div>
              <div className="text-xs text-zinc-500 mb-2">{rosterPreview.trialClass.title} • Roster is <b>only confirmed</b></div>
              {classBreakdown && (
                <div className="text-[11px] text-zinc-500 bg-zinc-50 border rounded-lg px-2 py-1.5 mb-3">
                  Breakdown: {classBreakdown.confirmed} confirmed (on roster) • {classBreakdown.pending_payment} pending (not counted) • {classBreakdown.payment_failed} failed
                </div>
              )}
              {rosterPreview.roster.length === 0 ? (
                <div className="text-sm text-zinc-500 py-4 text-center border rounded-xl border-dashed">
                  No confirmed students yet.
                  {classBreakdown && classBreakdown.pending_payment > 0 && (
                    <div className="text-xs mt-1">There is {classBreakdown.pending_payment} pending booking not on roster yet.</div>
                  )}
                </div>
              ) : (
                <ul className="space-y-2">
                  {rosterPreview.roster.map((r: any) => (
                    <li key={r.booking_id} className="flex items-center gap-3 border rounded-xl px-3 py-2">
                      <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center text-xs font-semibold text-orange-700">
                        {r.student.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{r.student.name}</div>
                        <div className="text-xs text-zinc-500">Parent: {r.parent.name}</div>
                      </div>
                      <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                        confirmed
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <a
                href={`/api/roster/${rosterPreview.trialClass.id}`}
                target="_blank"
                className="text-xs underline text-zinc-500 mt-3 inline-block"
              >
                View roster JSON
              </a>
            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="text-xs font-semibold text-amber-900">For evaluators — quick verify</div>
            <pre className="text-[11px] bg-white border rounded-lg p-2 mt-2 overflow-auto">
              {`# 1) list classes
curl /api/trial-classes | jq

# 2) create pending
curl -X POST /api/bookings \\
  -H "Content-Type: application/json" \\
  -d '{"parent_id":"par_1","student_id":"stu_2","trial_class_id":"cls_available"}'

# 3) pay success → confirmed
curl -X POST /api/bookings/<id>/pay -d '{"simulate":"success"}'

# 4) duplicate → 409
curl -X POST /api/bookings -d '{…same…}'

# 5) roster (only confirmed)
curl /api/roster/cls_available | jq

# 6) race test (2 pays for last seat, only 1 wins)
pnpm race`}
            </pre>
          </div>
        </div>
      </div>
    </main>
  );
}
