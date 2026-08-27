import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useApp } from "~/stores/app";
import { Markdown } from "~/components/markdown/markdown";
import { OutputSkeleton } from "~/components/ui/output-skeleton";
import { ErrorState } from "~/components/ui/error-state";
import { Menu } from "~/components/ui/menu";
import { ChevronDown } from "lucide-react";
import { toPlainMarkdown, toPortableMarkdown } from "~/utils/export";
import { countWords, minutes } from "~/utils/digest";
import { formatDate } from "~/utils/format";
import { GhostButton } from "~/components/ui/ghost-button";
import { IconButton } from "~/components/ui/icon-button";
import { LinkButton } from "~/components/ui/link-button";
import { PrimaryButton } from "~/components/ui/primary-button";
import { cn } from "~/utils/classname";

export function SynthesisView() {
  const text = useApp((state) => state.synthesisText);
  const busy = useApp((state) => state.synthesisBusy);
  const error = useApp((state) => state.synthesisError);
  const syntheses = useApp((state) => state.syntheses);
  const active = useApp((state) => state.activeSynthesis);
  const picked = useApp((state) => state.picked);

  const setView = useApp((state) => state.setView);
  const stopSynthesis = useApp((state) => state.stopSynthesis);
  const runSynthesis = useApp((state) => state.runSynthesis);
  const loadSyntheses = useApp((state) => state.loadSyntheses);
  const openSynthesis = useApp((state) => state.openSynthesis);
  const removeSynthesis = useApp((state) => state.removeSynthesis);
  const setLibraryOpen = useApp((state) => state.setLibraryOpen);

  const [instruction, setInstruction] = useState("");

  useEffect(() => {
    loadSyntheses();
  }, [loadSyntheses]);

  return (
    <main className="flex min-h-0 min-w-0 flex-col bg-panel">
      <header className="border-b border-line-soft px-8 pt-9" data-tauri-drag-region>
        <h1 className="mb-1.5 cursor-default text-[17px] leading-[1.35] font-semibold tracking-[-0.012em]" data-tauri-drag-region>
          Read together
        </h1>
        <div className="mb-2.5 flex flex-wrap gap-3 text-xs text-muted" data-tauri-drag-region>
          <span data-tauri-drag-region>
            What several threads add up to, rather than what each one said
          </span>
          <LinkButton onClick={() => setView("reader")}>
            Back to reading
          </LinkButton>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[720px] px-8 pb-[120px] max-w-[700px]">
          <div className="sticky top-0 z-2 flex items-center gap-2.5 bg-panel py-3 text-xs">
            {busy ? (
              <>
                <span className="size-[7px] shrink-0 rounded-full bg-accent animate-pulse-dot" />
                <span className="text-muted">Looking for the connections…</span>
                <div className="flex-1" />
                <GhostButton onClick={() => stopSynthesis()}>
                  Stop
                </GhostButton>
              </>
            ) : text ? (
              <>
                <span className="text-muted">{minutes(countWords(text))} min read</span>
                <div className="flex-1" />
                <Menu
                  ariaLabel="Copy this piece"
                  side="bottom"
                  align="end"
                  trigger={
                    <>
                      Copy
                      <ChevronDown size={11} strokeWidth={2} />
                    </>
                  }
                  entries={[
                    {
                      id: "links",
                      label: "Copy with links",
                      hint: "Markdown, with each story linked to Hacker News",
                      onSelect: () => navigator.clipboard.writeText(toPortableMarkdown(text)),
                    },
                    {
                      id: "plain",
                      label: "Copy without sources",
                      hint: "Just the prose, for pasting into a draft",
                      onSelect: () => navigator.clipboard.writeText(toPlainMarkdown(text)),
                    },
                  ]}
                />
              </>
            ) : null}
          </div>

          {error && !text ? (
            <ErrorState
              title="That run did not finish"
              message={error}
              onRetry={() => runSynthesis(instruction)}
              secondary={{ label: "Pick stories", onClick: () => setLibraryOpen(true) }}
            />
          ) : null}

          {busy && !text ? <OutputSkeleton /> : null}

          {text ? (
            <article className="max-w-[640px] pt-1.5 [&_.md]:text-[15px] [&_.md]:leading-[1.68] [&_.md]:text-fg-soft [&_.md>p:first-child]:mb-[1.4em] [&_.md>p:first-child]:text-[17px] [&_.md>p:first-child]:leading-[1.55] [&_.md>p:first-child]:text-fg [&_.md_h2]:mt-[2em] [&_.md_h2]:mb-[0.65em] [&_.md_h2]:text-[15.5px] [&_.md_h2]:font-[620] [&_.md_h2]:tracking-[-0.008em] [&_.md_h2]:text-fg [&_.md_h2:first-child]:mt-0 [&_.md_li]:mb-[0.45em]" data-selection-source="synthesis">
              <Markdown source={text} />
              {busy ? <span className="ml-0.5 inline-block h-[15px] w-[7px] bg-accent align-text-bottom animate-caret" /> : null}
            </article>
          ) : null}

          {!text && !busy && !error ? (
            <div className="mx-auto max-w-[420px] px-8 py-[90px] text-center text-balance [&_h2]:mb-2 [&_h2]:font-serif [&_h2]:text-[22px] [&_h2]:font-semibold [&_h2]:tracking-[-0.015em] [&_p]:mb-5 [&_p]:text-[13.5px] [&_p]:leading-[1.6] [&_p]:text-muted">
              <h2 className="mb-2.5 text-[11px] font-[650] tracking-[0.06em] text-muted uppercase">Read several threads at once</h2>
              <p>
                Pick two or more stories in the Library to find what they share, and where
                they contradict each other.
              </p>
              <PrimaryButton
               
               
                onClick={() => setLibraryOpen(true)}
              >
                Pick stories
              </PrimaryButton>
            </div>
          ) : null}

          {!busy && picked.size >= 2 ? (
            <div className="mt-[30px] flex gap-2 border-t border-line-soft pt-5">
              <input
              className="h-[30px] flex-1 rounded-lg border border-line bg-panel px-[11px] text-[12.5px] outline-none focus:border-accent"
                type="text"
                value={instruction}
                placeholder="Optional: an angle to look for"
                autoComplete="off"
                onChange={(event) => setInstruction(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    runSynthesis(instruction);
                  }
                }}
              />
              <GhostButton
               
               
                onClick={() => runSynthesis(instruction)}
              >
                {text ? "Try another angle" : `Read ${picked.size} together`}
              </GhostButton>
            </div>
          ) : null}

          {syntheses.length > 0 ? (
            <section className="mt-11 border-t border-line-soft pt-5">
              <h2 className="mb-2.5 text-[11px] font-[650] tracking-[0.06em] text-muted uppercase">Earlier</h2>
              <ul className="m-0 list-none p-0">
                {syntheses.map((entry) => (
                  <li
                    key={entry.id}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-1.5 py-0.5 hover:bg-line-soft",
                      active === entry.id && "bg-accent-soft",
                    )}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 flex-col gap-0.5 py-2 text-left"
                      onClick={() => openSynthesis(entry.id)}
                    >
                      <span className="truncate text-[12.5px]">{entry.title}</span>
                      <span className="text-muted">
                        {entry.storyIds.length} stories · {formatDate(entry.createdAt)}
                      </span>
                    </button>
                    <IconButton
                     
                     
                      aria-label="Delete"
                      onClick={() => removeSynthesis(entry.id)}
                    >
                      <Trash2 size={12} strokeWidth={2} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
