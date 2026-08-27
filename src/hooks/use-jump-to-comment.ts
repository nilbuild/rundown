import { useEffect } from "react";

/// Scrolls to a comment the reader was sent to, then lets the highlight go. A
/// search hit stays highlighted because the reader is stepping through them; a
/// one-off jump fades so the thread does not stay marked up afterwards.
export function useJumpToComment(
  jumpTarget: number | null,
  matchIds: number[],
  clearJump: () => void,
) {
  useEffect(() => {
    if (!jumpTarget) {
      return;
    }
    const node = document.getElementById(`comment-${jumpTarget}`);
    if (!node) {
      return;
    }
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    if (matchIds.includes(jumpTarget)) {
      return;
    }
    const timer = window.setTimeout(() => clearJump(), 2600);
    return () => window.clearTimeout(timer);
  }, [jumpTarget, clearJump, matchIds]);
}
