/// Error text from a command arrives as a raw Rust/JS error string. Strip the
/// noise so the reader sees the cause, not the plumbing.
export function readable(message: string) {
  return message
    .replace(/^Error:\s*/i, "")
    .replace(/^error (sending|returned from) [^:]*:\s*/i, "")
    .replace(/^invoke\S*\s*/i, "")
    .trim();
}
