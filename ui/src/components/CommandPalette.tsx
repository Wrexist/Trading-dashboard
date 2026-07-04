/**
 * Command palette skeleton (§3.2): ⌘K replaces all navigation. Phase 1 has
 * two live commands; later-phase commands are listed but disabled, labeled
 * with the phase that ships them — the palette is the roadmap's front door.
 */

import { useEffect, useState } from "react";
import { Command } from "cmdk";
import type { View } from "../views.ts";

const COMING: Array<{ label: string; phase: string }> = [
  { label: "Jump to symbol", phase: "Phase 2" },
  { label: "Run replay", phase: "Phase 2" },
  { label: "Open journal", phase: "Phase 5" },
  { label: "Acknowledge alerts", phase: "Phase 5" },
];

export function CommandPalette({ setView }: { setView: (v: View) => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (view: View) => {
    setView(view);
    setOpen(false);
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="fixed left-1/2 top-28 w-full max-w-md -translate-x-1/2 overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 shadow-none"
      overlayClassName="fixed inset-0 bg-black/60"
    >
      <Command.Input
        placeholder="Type a command…"
        className="w-full border-b border-zinc-800 bg-transparent px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
      />
      <Command.List className="max-h-72 overflow-y-auto p-1 text-sm">
        <Command.Empty className="px-3 py-6 text-center text-zinc-600">
          No matching command.
        </Command.Empty>
        <Command.Group>
          <Command.Item
            onSelect={() => go("signals")}
            className="cursor-pointer rounded px-3 py-2 text-zinc-300 data-[selected=true]:bg-zinc-900 data-[selected=true]:text-zinc-100"
          >
            Go to Signals
          </Command.Item>
          <Command.Item
            onSelect={() => go("health")}
            className="cursor-pointer rounded px-3 py-2 text-zinc-300 data-[selected=true]:bg-zinc-900 data-[selected=true]:text-zinc-100"
          >
            Go to Health
          </Command.Item>
        </Command.Group>
        <Command.Group
          heading="Coming later"
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-zinc-600"
        >
          {COMING.map((c) => (
            <Command.Item
              key={c.label}
              disabled
              className="flex justify-between rounded px-3 py-2 text-zinc-600"
            >
              <span>{c.label}</span>
              <span className="text-xs">{c.phase}</span>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
