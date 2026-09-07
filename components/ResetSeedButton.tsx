"use client";
export default function ResetSeedButton() {
  async function onReset() {
    const r = await fetch("/api/seed", { method: "POST" });
    if (r.ok) location.reload();
    else alert("Reset failed");
  }
  return (
    <button onClick={onReset} className="text-xs border border-zinc-300 px-3 py-1.5 rounded-full hover:bg-zinc-50">
      Reset seed
    </button>
  );
}
