import { useEffect, useRef, useState } from "react";

/// Follows a stream only while the reader is already at the bottom. Scrolling
/// up to re-read something must not be yanked back down on the next token.
export function usePinnedScroll(deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  useEffect(() => {
    if (!pinned) {
      return;
    }
    const node = ref.current;
    if (!node) {
      return;
    }
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, pinned]);

  function onScroll() {
    const node = ref.current;
    if (!node) {
      return;
    }
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    setPinned(distance < 60);
  }

  return { ref, pinned, setPinned, onScroll };
}
