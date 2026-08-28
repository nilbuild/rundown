import { platform } from "@tauri-apps/plugin-os";

/// Read once at startup. The platform cannot change while the app is running,
/// and the layout needs the answer before the first paint rather than after a
/// round trip.
export const isMac = platform() === "macos";

/// macOS hides the title bar and floats the traffic lights over the content, so
/// the sidebar and the headers beside it have to leave room for them. Every
/// other platform draws a real title bar above the window, and the same room
/// would just be a gap under it.
export const titleBarClearance = isMac ? "pt-9" : "pt-5";

/// Every shortcut in this app is bound to meta *or* control, so only the label
/// changes.
export function shortcut(key: string): string {
  return isMac ? `⌘${key}` : `Ctrl+${key}`;
}
