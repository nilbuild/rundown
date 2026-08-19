import { useEffect } from "react";
import { useApp } from "./state/app";
import { Sidebar } from "./components/Sidebar";
import { Reader } from "./components/Reader";
import { ChatPane } from "./components/ChatPane";
import { CommandPalette } from "./components/CommandPalette";
import { Settings } from "./components/Settings";
import { PresetsDialog } from "./components/PresetsDialog";
import { SelectionPopover } from "./components/SelectionPopover";

export default function App() {
  const bootstrap = useApp((state) => state.bootstrap);
  const chatOpen = useApp((state) => state.chatOpen);
  const setPaletteOpen = useApp((state) => state.setPaletteOpen);
  const setSettingsOpen = useApp((state) => state.setSettingsOpen);
  const setPresetsOpen = useApp((state) => state.setPresetsOpen);
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
  }, [setPaletteOpen, setSettingsOpen, setPresetsOpen, setTab, setChatOpen, runOutput, reloadStory]);

  return (
    <div className={`app ${chatOpen ? "with-chat" : ""}`}>
      <Sidebar />
      <Reader />
      <ChatPane />

      <CommandPalette />
      <Settings />
      <PresetsDialog />
      <SelectionPopover />
    </div>
  );
}
