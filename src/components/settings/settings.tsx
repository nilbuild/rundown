import { useEffect, useState } from "react";
import { Dialog } from "~/components/ui/dialog";
import { cn } from "~/utils/classname";
import { useApp } from "~/stores/app";
import { dataLocation } from "~/lib/api/settings";
import { openExternal } from "~/lib/api/shell";
import { Select } from "~/components/ui/select";
import type { ModelSlot, PrefetchMode, Provider } from "~/lib/api/settings";
import { GhostButton } from "~/components/ui/ghost-button";
import { LinkButton } from "~/components/ui/link-button";

const SLOTS: { slot: ModelSlot; label: string; hint: string }[] = [
  { slot: "rundown", label: "Briefing", hint: "The thread summary — worth the deepest model" },
  { slot: "digest", label: "Digest", hint: "The thread digest — worth the deepest model" },
  { slot: "brief", label: "Brief", hint: "The inline article summary — favour speed" },
  { slot: "chat", label: "Chat", hint: "Sidebar questions — favour responsiveness" },
];

const PREFETCH: { mode: PrefetchMode; label: string }[] = [
  { mode: "off", label: "Off" },
  { mode: "rundown", label: "Briefing" },
  { mode: "both", label: "Briefing + Digest" },
];

export function Settings() {
  const open = useApp((state) => state.settingsOpen);
  const setOpen = useApp((state) => state.setSettingsOpen);
  const provider = useApp((state) => state.provider);
  const models = useApp((state) => state.models);
  const prefetch = useApp((state) => state.prefetch);
  const status = useApp((state) => state.providerStatus);
  const rateLimit = useApp((state) => state.rateLimit);
  const setProvider = useApp((state) => state.setProvider);
  const setModelFor = useApp((state) => state.setModelFor);
  const resetModels = useApp((state) => state.resetModels);
  const modelOverrides = useApp((state) => state.modelOverrides);
  const setPrefetch = useApp((state) => state.setPrefetch);
  const setPresetsOpen = useApp((state) => state.setPresetsOpen);

  const [location, setLocation] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    dataLocation().then(setLocation).catch(() => undefined);
  }, [open]);

  const options = useApp((state) => state.modelOptions);
  const resolved = useApp((state) => state.modelResolved);
  const installed = provider === "claude" ? status?.claude : status?.codex;

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Settings"
      className="w-[600px]"
    >
        <section className="mt-[30px] first:mt-0">
          <h3 className="mb-2 text-xs font-semibold tracking-[0.05em] text-muted uppercase">Provider</h3>
          <p className="m-0 mb-3.5 max-w-[46ch] text-xs leading-[1.5] text-muted">
            Runs go through the CLI already installed on this Mac, so they use the subscription you
            are already signed in to. Nothing is sent anywhere else, and no API key is stored.
          </p>

          <div className="mt-2.5 grid min-h-7 grid-cols-[96px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 text-[13px]">
            <label className="text-muted">Use</label>
            <div className="flex justify-self-start gap-0.5 rounded-lg bg-line-soft p-0.5">
              {(["claude", "codex"] as Provider[]).map((entry) => (
                <button
                  key={entry}
                  type="button"
                  className={cn(
                    "rounded-md px-3.5 py-1 text-[12.5px] text-muted",
                    provider === entry && "bg-panel font-[550] text-fg shadow-[0_1px_2px_rgba(0,0,0,0.08)]",
                  )}
                  onClick={() => setProvider(entry)}
                >
                  {entry === "claude" ? "Claude" : "Codex"}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2.5 grid min-h-7 grid-cols-[96px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 text-[13px]">
            <label className="text-muted">Status</label>
            <span className={installed ? "text-muted" : "text-bad"}>
              {installed ? installed : `\`${provider}\` was not found on your PATH`}
            </span>
          </div>

          {rateLimit ? (
            <div className="mt-2.5 grid min-h-7 grid-cols-[96px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 text-[13px]">
              <label className="text-muted">Usage</label>
              <span className="text-muted">
                {rateLimit.status}
                {rateLimit.window ? ` · ${rateLimit.window.replace("_", " ")} window` : ""}
                {rateLimit.resetsAt
                  ? ` · resets ${new Date(rateLimit.resetsAt * 1000).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}`
                  : ""}
              </span>
            </div>
          ) : null}
        </section>

        <section className="mt-[30px] first:mt-0">
          <h3 className="mb-2 text-xs font-semibold tracking-[0.05em] text-muted uppercase">Models</h3>
          <p className="m-0 mb-3.5 max-w-[46ch] text-xs leading-[1.5] text-muted">
            Set per job rather than globally, so the digest can think hard while the chat stays
            quick.
          </p>
          {Object.keys(modelOverrides).length > 0 ? (
            <div className="mt-2.5 grid min-h-7 grid-cols-[96px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 text-[13px]">
              <label />
              <GhostButton
                className="justify-self-start"
                onClick={() => resetModels()}
              >
                Use the defaults
              </GhostButton>
            </div>
          ) : null}

          {SLOTS.map((entry) => (
            <div className="mt-2.5 grid min-h-7 grid-cols-[96px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 text-[13px]" key={entry.slot}>
              <label className="text-muted" title={entry.hint}>{entry.label}</label>
              <Select
                ariaLabel={`Model for ${entry.label}`}
                value={models[entry.slot] ?? ""}
                options={options}
                resolved={resolved}
                className="min-w-[200px] justify-self-start"
                onChange={(next) => setModelFor(entry.slot, next || null)}
              />
            </div>
          ))}
        </section>

        <section className="mt-[30px] first:mt-0">
          <h3 className="mb-2 text-xs font-semibold tracking-[0.05em] text-muted uppercase">Presets</h3>
          <p className="m-0 mb-3.5 max-w-[46ch] text-xs leading-[1.5] text-muted">
            Saved questions you can fire at any thread from the chat composer.
          </p>
          <div className="mt-2.5 grid min-h-7 grid-cols-[96px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 text-[13px]">
            <label className="text-muted">Manage</label>
            <GhostButton
              className="justify-self-start"
              onClick={() => {
                setOpen(false);
                setPresetsOpen(true);
              }}
            >
              Open presets… ⌘P
            </GhostButton>
          </div>
        </section>

        <section className="mt-[30px] first:mt-0">
          <h3 className="mb-2 text-xs font-semibold tracking-[0.05em] text-muted uppercase">Prefetch</h3>
          <p className="m-0 mb-3.5 max-w-[46ch] text-xs leading-[1.5] text-muted">
            Starts a couple of seconds after you open a thread, so it is ready or already streaming
            by the time you switch tabs. Skipped for threads you pass straight through, threads that
            already have one, and threads with almost no comments.
          </p>
          <div className="mt-2.5 grid min-h-7 grid-cols-[96px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 text-[13px]">
            <label className="text-muted">Generate early</label>
            <div className="flex justify-self-start gap-0.5 rounded-lg bg-line-soft p-0.5">
              {PREFETCH.map((entry) => (
                <button
                  key={entry.mode}
                  type="button"
                  className={cn(
                    "rounded-md px-3.5 py-1 text-[12.5px] text-muted",
                    prefetch === entry.mode && "bg-panel font-[550] text-fg shadow-[0_1px_2px_rgba(0,0,0,0.08)]",
                  )}
                  onClick={() => setPrefetch(entry.mode)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-[30px] first:mt-0">
          <h3 className="mb-2 text-xs font-semibold tracking-[0.05em] text-muted uppercase">Data</h3>
          <p className="m-0 mb-3.5 max-w-[46ch] text-xs leading-[1.5] text-muted">
            Threads, articles, generated output, and chats live in a single SQLite file. Nothing
            leaves this machine except the text sent to the model you chose.
          </p>
          <div className="mt-2.5 grid min-h-7 grid-cols-[96px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 text-[13px]">
            <label className="text-muted">Location</label>
            <code className="overflow-x-auto font-mono text-[11px] whitespace-nowrap text-muted">{location}</code>
          </div>
        </section>

        <footer className="mt-[30px] text-xs">
          <LinkButton
            onClick={() => openExternal("https://news.ycombinator.com")}
          >
            Hacker News ↗
          </LinkButton>
        </footer>
    </Dialog>
  );
}
