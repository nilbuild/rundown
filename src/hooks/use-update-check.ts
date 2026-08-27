import { useEffect, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import type { Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

type Stage = "idle" | "ready" | "installing";

/// Checks once at launch and hands back an update if there is one. Nothing is
/// downloaded until the reader asks for it: an app that restarts itself while
/// someone is mid-thread is worse than one that waits to be told.
export function useUpdateCheck() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [stage, setStage] = useState<Stage>("idle");

  useEffect(() => {
    let live = true;
    check()
      .then((found) => {
        if (!live || !found) {
          return;
        }
        setUpdate(found);
        setStage("ready");
      })
      // Offline, or GitHub is down. Not being able to check is not an error
      // worth showing anyone.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  async function install() {
    if (!update) {
      return;
    }
    setStage("installing");
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch {
      setStage("ready");
    }
  }

  function dismiss() {
    setStage("idle");
    setUpdate(null);
  }

  return { version: update?.version ?? null, stage, install, dismiss };
}
