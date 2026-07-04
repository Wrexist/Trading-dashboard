/**
 * §3.2: single-column focus layout, max-width ~1100px, no sidebar, no tabs.
 * Views are reached through the command palette (⌘K), not menus.
 */

import { useEffect, useState } from "react";
import { TopStrip } from "./components/TopStrip.tsx";
import { SignalsView } from "./components/SignalsView.tsx";
import { HealthView } from "./components/HealthView.tsx";
import { CommandPalette } from "./components/CommandPalette.tsx";
import { startEventStream, startHealthPolling } from "./store.ts";
import type { View } from "./views.ts";

export function App() {
  const [view, setView] = useState<View>("signals");

  useEffect(() => {
    const stopHealth = startHealthPolling();
    const stopStream = startEventStream();
    return () => {
      stopHealth();
      stopStream();
    };
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1100px] flex-col">
      <TopStrip />
      <main className="flex-1 px-4">
        {view === "signals" ? <SignalsView /> : <HealthView />}
      </main>
      <CommandPalette setView={setView} />
    </div>
  );
}
