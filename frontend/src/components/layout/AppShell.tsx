"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF9F8] text-[#323130] antialiased lg:h-screen lg:overflow-hidden">
      <TopBar onMenuClick={() => setMobileNavOpen(true)} />
      <div className="flex flex-1 min-w-0 lg:overflow-hidden">
        <Sidebar isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        <main className="flex-1 min-w-0 overflow-x-clip overflow-y-auto p-3.5 sm:p-5 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

