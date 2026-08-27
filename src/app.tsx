import { useEffect } from "react";
import { useApp } from "~/stores/app";
import { Sidebar } from "~/components/sidebar/sidebar";
import { Reader } from "~/components/reader/reader";
import { ChatPane } from "~/components/chat/chat-pane";
import { CommandPalette } from "~/components/command-palette/command-palette";
import { Settings } from "~/components/settings/settings";
import { PresetsDialog } from "~/components/presets/presets-dialog";
import { Library } from "~/components/library/library";
import { SynthesisView } from "~/components/synthesis/synthesis-view";
import { SelectionPopover } from "~/components/chat/selection-popover";

export default function App() {
  const bootstrap = useApp((state) => state.bootstrap);
  const chatOpen = useApp((state) => state.chatOpen);
  const view = useApp((state) => state.view);
  const setPaletteOpen = useApp((state) => state.setPaletteOpen);
  const setSettingsOpen = useApp((state) => state.setSettingsOpen);
  const setPresetsOpen = useApp((state) => state.setPresetsOpen);
  const setLibraryOpen = useApp((state) => state.setLibraryOpen);
  const setTab = useApp((state) => state.setTab);
  const setChatOpen = useApp((state) => state.setChatOpen);
  const runOutput = useApp((state) => state.runOutput);
  const reloadStory = useApp((state) => state.reloadStory);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) {
        return;
      }

      if (event.key === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (event.key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
        return;
      }
      if (event.key === "l") {
        event.preventDefault();
        setLibraryOpen(true);
        return;
      }
      if (event.key === "p") {
        event.preventDefault();
        setPresetsOpen(true);
        return;
      }
      if (event.key === "d") {
        event.preventDefault();
        setTab("digest");
        runOutput("digest");
        return;
      }
      if (event.key === "r") {
        event.preventDefault();
        reloadStory();
        return;
      }
      if (event.key === "\\") {
        event.preventDefault();
        setChatOpen(!useApp.getState().chatOpen);
        return;
      }
      if (event.key >= "1" && event.key <= "4") {
        event.preventDefault();
        const tabs = ["rundown", "article", "comments", "digest"] as const;
        setTab(tabs[Number(event.key) - 1]);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setPaletteOpen, setSettingsOpen, setPresetsOpen, setLibraryOpen, setTab, setChatOpen, runOutput, reloadStory]);

  return (
    <div className={`app ${chatOpen ? "with-chat" : ""}`}>
      <Sidebar />
      {view === "synthesis" ? <SynthesisView /> : <Reader />}
      <ChatPane />

      <CommandPalette />
      <Settings />
      <PresetsDialog />
      <Library />
      <SelectionPopover />
    </div>
  );
}
