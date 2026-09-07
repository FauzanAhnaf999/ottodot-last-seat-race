import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ottodot — Trial Booking",
  description: "Trial class booking with race-condition safety (capacity 4)",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">
        <header className="border-b bg-white sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center text-white font-bold text-sm">O</div>
              <div>
                <div className="font-semibold leading-none">Ottodot</div>
                <div className="text-xs text-zinc-500">Science & Math — Trial Booking</div>
              </div>
            </div>
            <nav className="flex gap-2 text-sm">
              <a href="/" className="px-3 py-1.5 rounded-full bg-zinc-900 text-white">Book Trial</a>
              <a href="/roster" className="px-3 py-1.5 rounded-full border hover:bg-zinc-100">Roster</a>
              <a href="/api/seed" className="px-3 py-1.5 rounded-full border hover:bg-zinc-100 hidden sm:inline-flex">Seed API</a>
            </nav>
          </div>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="border-t bg-white mt-auto">
          <div className="max-w-5xl mx-auto px-6 py-4 text-xs text-zinc-500 flex justify-between">
            <span>Capacity 4 • pending_payment → confirmed only after payment + capacity check</span>
            <span>Postgres FOR UPDATE / mutex for race safety</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
