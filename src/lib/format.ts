export function timeAgo(seconds: number) {
  if (!seconds) {
    return "";
  }
  const delta = Math.max(0, Date.now() / 1000 - seconds);
  if (delta < 60) {
    return "just now";
  }
  const minutes = Math.floor(delta / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d`;
  }
  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months}mo`;
  }
  return `${Math.floor(months / 12)}y`;
}

export function isoAgo(iso: string) {
  if (!iso) {
    return "";
  }
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return "";
  }
  return timeAgo(parsed / 1000);
}

export function readingTime(words: number) {
  if (!words) {
    return "";
  }
  const minutes = Math.max(1, Math.round(words / 230));
  return `${minutes} min read`;
}

export function compact(value: number) {
  if (value < 1000) {
    return String(value);
  }
  return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)}k`;
}

export function hnLink(id: number) {
  return `https://news.ycombinator.com/item?id=${id}`;
}

export function formatCost(value: number | null) {
  if (value === null || value === undefined) {
    return "";
  }
  if (value < 0.01) {
    return "<$0.01";
  }
  return `$${value.toFixed(2)}`;
}

export function formatDuration(ms: number) {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatDate(seconds: number) {
  if (!seconds) {
    return "";
  }
  return new Date(seconds * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
