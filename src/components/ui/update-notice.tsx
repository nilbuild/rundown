import { useUpdateCheck } from "~/hooks/use-update-check";
import { GhostButton } from "~/components/ui/ghost-button";
import { IconButton } from "~/components/ui/icon-button";
import { X } from "lucide-react";

/// Sits out of the way at the bottom until it is dealt with. An update is worth
/// mentioning, not worth interrupting a thread for.
export function UpdateNotice() {
  const { version, stage, install, dismiss } = useUpdateCheck();

  if (stage === "idle" || !version) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2.5 rounded-[10px] border border-line bg-panel px-3 py-2.5 text-xs shadow-panel">
      <span className="text-fg-soft">Version {version} is out.</span>
      <GhostButton disabled={stage === "installing"} onClick={() => install()}>
        {stage === "installing" ? "Installing…" : "Update and restart"}
      </GhostButton>
      <IconButton aria-label="Not now" onClick={() => dismiss()}>
        <X size={12} strokeWidth={2.2} />
      </IconButton>
    </div>
  );
}
