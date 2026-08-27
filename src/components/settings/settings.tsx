import "./settings.css";

import { useEffect, useState } from "react";
import { Dialog } from "@base-ui-components/react/dialog";
import { useApp } from "~/stores/app";
import { dataLocation, openExternal } from "~/lib/api";
import { Select } from "~/components/ui/select";
import type { ModelSlot, PrefetchMode, Provider } from "~/types";
import { X } from "lucide-react";

const SLOTS: { slot: ModelSlot; label: string; hint: string }[] = [
  { slot: "rundown", label: "Rundown", hint: "The thread summary — worth the deepest model" },
  { slot: "digest", label: "Digest", hint: "The thread digest — worth the deepest model" },
  { slot: "brief", label: "Brief", hint: "The inline article summary — favour speed" },
  { slot: "chat", label: "Chat", hint: "Sidebar questions — favour responsiveness" },
];

const PREFETCH: { mode: PrefetchMode; label: string }[] = [
  { mode: "off", label: "Off" },
  { mode: "rundown", label: "Rundown" },
  { mode: "both", label: "Rundown + Digest" },
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
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="ui-backdrop" />
        <Dialog.Popup className="ui-dialog settings">
        <header>
          <Dialog.Title className="ui-dialog-title">Settings</Dialog.Title>
          <Dialog.Close className="icon-button" aria-label="Close">
<X size={13} strokeWidth={2.2} />
          </Dialog.Close>
        </header>

        <section>
          <h3>Provider</h3>
          <p className="fine">
            Runs go through the CLI already installed on this Mac, so they use the subscription you
            are already signed in to. Nothing is sent anywhere else, and no API key is stored.
          </p>

          <div className="row">
            <label>Use</label>
            <div className="segmented">
              {(["claude", "codex"] as Provider[]).map((entry) => (
                <button
                  key={entry}
                  type="button"
                  className={provider === entry ? "active" : ""}
                  onClick={() => setProvider(entry)}
                >
                  {entry === "claude" ? "Claude" : "Codex"}
                </button>
              ))}
            </div>
          </div>

          <div className="row">
            <label>Status</label>
            <span className={installed ? "muted" : "error"}>
              {installed ? installed : `\`${provider}\` was not found on your PATH`}
            </span>
          </div>

          {rateLimit ? (
            <div className="row">
              <label>Usage</label>
              <span className="muted">
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

        <section>
          <h3>Models</h3>
          <p className="fine">
            Set per job rather than globally, so the digest can think hard while the chat stays
            quick.
          </p>
          {Object.keys(modelOverrides).length > 0 ? (
            <div className="row">
              <label />
              <button
                type="button"
                className="ghost-button"
                style={{ justifySelf: "start" }}
                onClick={() => resetModels()}
              >
                Use the defaults
              </button>
            </div>
          ) : null}

          {SLOTS.map((entry) => (
            <div className="row" key={entry.slot}>
              <label title={entry.hint}>{entry.label}</label>
              <Select
                ariaLabel={`Model for ${entry.label}`}
                value={models[entry.slot] ?? ""}
                options={options}
                resolved={resolved}
                onChange={(next) => setModelFor(entry.slot, next || null)}
              />
            </div>
          ))}
        </section>

        <section>
          <h3>Presets</h3>
          <p className="fine">
            Saved questions you can fire at any thread from the chat composer.
          </p>
          <div className="row">
            <label>Manage</label>
            <button
              type="button"
              className="ghost-button"
              style={{ justifySelf: "start" }}
              onClick={() => {
                setOpen(false);
                setPresetsOpen(true);
              }}
            >
              Open presets… ⌘P
            </button>
          </div>
        </section>

        <section>
          <h3>Prefetch</h3>
          <p className="fine">
            Starts a couple of seconds after you open a thread, so it is ready or already streaming
            by the time you switch tabs. Skipped for threads you pass straight through, threads that
            already have one, and threads with almost no comments.
          </p>
          <div className="row">
            <label>Generate early</label>
            <div className="segmented">
              {PREFETCH.map((entry) => (
                <button
                  key={entry.mode}
                  type="button"
                  className={prefetch === entry.mode ? "active" : ""}
                  onClick={() => setPrefetch(entry.mode)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section>
          <h3>Data</h3>
          <p className="fine">
            Threads, articles, generated output, and chats live in a single SQLite file. Nothing
            leaves this machine except the text sent to the model you chose.
          </p>
          <div className="row">
            <label>Location</label>
            <code className="path">{location}</code>
          </div>
        </section>

        <footer>
          <button
            type="button"
            className="link"
            onClick={() => openExternal("https://news.ycombinator.com")}
          >
            Hacker News ↗
          </button>
        </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
