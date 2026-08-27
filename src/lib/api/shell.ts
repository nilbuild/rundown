import { openUrl } from "@tauri-apps/plugin-opener";

export function openExternal(url: string) {
  return openUrl(url);
}
