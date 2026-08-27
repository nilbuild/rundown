import { useEffect } from "react";
import type { Story } from "~/lib/api/reading";

/// j and k step through the feed the way they do on Hacker News itself. Typing
/// in a field is not navigation, and neither is a shortcut with a modifier.
export function useStoryKeys(
  stories: Story[],
  selectedId: number | null,
  selectStory: (id: number) => void,
) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key !== "j" && event.key !== "k") {
        return;
      }

      const index = stories.findIndex((story) => story.id === selectedId);
      const next = event.key === "j" ? index + 1 : index - 1;
      if (next < 0 || next >= stories.length) {
        return;
      }
      event.preventDefault();
      selectStory(stories[next].id);
      document
        .querySelector(`[data-story-id="${stories[next].id}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stories, selectedId, selectStory]);
}
