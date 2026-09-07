import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function RosterPage() {
  const classes = store.getTrialClasses();

  return (
    <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Class Rosters (Teacher / Admin)</h1>
        <p className="text-sm text-zinc-600 mt-1">Only <code>confirmed</code> bookings appear. Capacity 4. Pending / failed excluded.</p>
      </div>

      <div className="grid gap-6">
        {classes.map((c) => {
          const roster = store.getRoster(c.id);
          const paymentsInfo = roster.length ? "" : "";
          return (
            <div key={c.id} className="bg-white border rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium">{c.title}</div>
                  <div className="text-xs text-zinc-500">
                    {c.teacher_name} • {new Date(c.starts_at).toLocaleString()} • {c.subject}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-semibold ${c.is_full ? "text-red-600" : "text-emerald-700"}`}>
                    {c.confirmed_count}/{c.capacity}
                  </div>
                  <div className="text-xs text-zinc-500">{c.available_seats} seat(s) left</div>
                  <a href={`/api/roster/${c.id}`} target="_blank" className="text-xs underline text-zinc-500">
                    JSON
                  </a>
                </div>
              </div>

              {roster.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-zinc-500">No confirmed students.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="text-left px-5 py-2 font-medium">Student</th>
                      <th className="text-left px-5 py-2 font-medium">Parent</th>
                      <th className="text-left px-5 py-2 font-medium">Booked at</th>
                      <th className="text-left px-5 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((r) => (
                      <tr key={r.booking_id} className="border-t">
                        <td className="px-5 py-3">
                          <div className="font-medium">{r.student.name}</div>
                          <div className="text-xs text-zinc-500">{r.student.age}y</div>
                        </td>
                        <td className="px-5 py-3">
                          <div>{r.parent.name}</div>
                          <div className="text-xs text-zinc-500">{r.parent.email}</div>
                        </td>
                        <td className="px-5 py-3 text-xs text-zinc-600">{new Date(r.booked_at).toLocaleString()}</td>
                        <td className="px-5 py-3">
                          <span className="text-xs px-2 py-1 rounded-full bg-emerald-600 text-white font-medium">
                            confirmed
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-white border rounded-2xl p-5">
        <h3 className="font-medium text-sm">What’s excluded from roster</h3>
        <ul className="text-xs text-zinc-600 list-disc pl-4 mt-2 space-y-1">
          <li>
            <code>pending_payment</code> — created but not yet paid (e.g., bk_dup_pending)
          </li>
          <li>
            <code>payment_failed</code> — payment failed, needs retry (e.g., bk_failed)
          </li>
          <li>
            <code>cancelled</code> — explicitly cancelled, frees seat
          </li>
        </ul>
      </div>
    </main>
  );
}
