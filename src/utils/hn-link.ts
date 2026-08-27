/// Pulls an item id out of whatever someone pastes. Hacker News addresses
/// stories and comments with the same `item?id=` form, so this cannot say which
/// one it found — the backend resolves that.
export function parseItemRef(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    return asId(trimmed);
  }

  // Only the official host: an id from anywhere else means nothing here.
  if (!/^(https?:\/\/)?(www\.)?news\.ycombinator\.com\//i.test(trimmed)) {
    return null;
  }

  const match = /[?&]id=(\d+)/.exec(trimmed);
  return match ? asId(match[1]) : null;
}

function asId(digits: string): number | null {
  const id = Number(digits);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
