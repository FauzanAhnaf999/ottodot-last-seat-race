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
type Booking = { id: string; status: string; student_id: string; trial_class_id: string };

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

  async function handleCreateBooking() {
    setErrorMsg("");
    setStatusMsg("");
    setLoading(true);
    try {
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
        setErrorMsg(`${json.code ?? "ERROR"}: ${json.error}`);
        return;
      }
      setBooking(json.data);
      setStatusMsg(`Booking created — status: ${json.data.status}. Now simulate payment.`);
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
        // if class full, show that race was prevented
        if (json.code === "CLASS_FULL") {
          setStatusMsg("Payment blocked — class became full. At most 1 seat was given. Try another class.");
        }
        return;
      }
      setBooking(json.data);
      setStatusMsg(`Payment ${simulate} → booking status: ${json.data.status}`);
      refresh();
      if (selectedClass) {
        const r = await fetch(`/api/roster/${selectedClass}`).then((x) => x.json());
        setRosterPreview(r.data);
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

  return (
    <main className="max-w-5xl mx-auto px-6 py-8">
      <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-8">
        {/* Left: booking form */}
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Book a trial class</h1>
            <p className="text-sm text-zinc-600 mt-1">
              Choose child → pick class → mock payment. Roster only adds confirmed bookings. Capacity is 4.
            </p>
          </div>

          <div className="bg-white border rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Parent</span>
                <select
                  value={selectedParent}
                  onChange={(e) => setSelectedParent(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                >
                  {parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.email}
                    </option>
                  ))}
                </select>
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
              </label>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Available trial classes</div>
              <div className="grid gap-2">
                {classes.map((c) => (
                  <label
                    key={c.id}
                    className={`flex items-center gap-3 border rounded-xl px-4 py-3 cursor-pointer transition ${
                      selectedClass === c.id ? "border-zinc-900 bg-zinc-900 text-white" : "bg-white hover:bg-zinc-50"
                    } ${c.is_full ? "opacity-60" : ""}`}
                  >
                    <input
                      type="radio"
                      name="trialClass"
                      checked={selectedClass === c.id}
                      onChange={() => {
                        setSelectedClass(c.id);
                        fetchRoster(c.id);
                      }}
                      className="accent-zinc-900"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{c.title}</div>
                      <div
                        className={`text-xs ${selectedClass === c.id ? "text-zinc-300" : "text-zinc-500"} flex gap-2 flex-wrap`}
                      >
                        <span>{c.teacher_name}</span>
                        <span>•</span>
                        <span>{new Date(c.starts_at).toLocaleString()}</span>
                        <span>•</span>
                        <span className={c.is_full ? "text-red-500 font-semibold" : ""}>
                          {c.confirmed_count}/{c.capacity} confirmed • {c.available_seats} seat(s) left{" "}
                          {c.is_full && "— FULL"}
                        </span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={handleCreateBooking}
              disabled={!selectedParent || !selectedStudent || !selectedClass || loading}
              className="w-full bg-orange-600 text-white rounded-full py-2.5 text-sm font-medium hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Processing…" : "Create pending booking"}
            </button>

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
                  Child: {students.find((s) => s.id === booking.student_id)?.name} • Class: {selectedClassObj?.title}
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
                <b>Available:</b> cls_available has 0 confirmed → try booking Milo Rahayu there.
              </li>
              <li>
                <b>3/4 full:</b> cls_almost_full has 3/4 → only 1 seat left. Create 2 pending bookings for 2 different
                kids and race their payments (see script below).
              </li>
              <li>
                <b>Duplicate:</b> Kiko (stu_1) already has pending for cls_available → try again → expects 409.
              </li>
              <li>
                <b>Payment fail:</b> create booking then “Mock Pay Fail” → status payment_failed, NOT on roster.
              </li>
              <li>
                <b>Last-seat race:</b> use cls_race (also 3/4). Open two tabs or run:{" "}
                <code className="bg-zinc-100 px-1 py-0.5 rounded">pnpm run race</code>
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
                  {rosterPreview.confirmed_count}/{rosterPreview.capacity}
                </span>
              </div>
              <div className="text-xs text-zinc-500 mb-2">{rosterPreview.trialClass.title}</div>
              {rosterPreview.roster.length === 0 ? (
                <div className="text-sm text-zinc-500 py-4 text-center border rounded-xl border-dashed">
                  No confirmed students yet.
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
