import { useEffect } from "react";
import type { RefObject } from "react";

/// Loads the next page when a sentinel at the end of the list comes into view,
/// with enough margin that the page is already there by the time it is reached.
export function useInfiniteScroll(
  sentinelRef: RefObject<HTMLElement | null>,
  rootRef: RefObject<HTMLElement | null>,
  loadMore: () => void,
  deps: unknown[],
) {
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) {
          return;
        }
        loadMore();
      },
      { root: rootRef.current, rootMargin: "300px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
