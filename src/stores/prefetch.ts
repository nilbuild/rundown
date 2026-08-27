/// Wait before speculatively digesting, so paging through the list with j/k
/// does not fire a run per story.
const PREFETCH_DELAY = 2500;

let timer: number | undefined;

export function cancelPrefetch() {
  window.clearTimeout(timer);
}

export function startPrefetch(run: () => void) {
  timer = window.setTimeout(run, PREFETCH_DELAY);
}
