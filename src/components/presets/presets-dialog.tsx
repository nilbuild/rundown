import { useState } from "react";
import { Dialog } from "~/components/ui/dialog";
import { useApp } from "~/stores/app";
import { Trash2 } from "lucide-react";
import { GhostButton } from "~/components/ui/ghost-button";
import { IconButton } from "~/components/ui/icon-button";
import { PrimaryButton } from "~/components/ui/primary-button";
import { cn } from "~/utils/classname";

export function PresetsDialog() {
  const open = useApp((state) => state.presetsOpen);
  const setOpen = useApp((state) => state.setPresetsOpen);
  const presets = useApp((state) => state.presets);
  const addPreset = useApp((state) => state.addPreset);
  const updatePreset = useApp((state) => state.updatePreset);
  const removePreset = useApp((state) => state.removePreset);
  const runPreset = useApp((state) => state.runPreset);
  const thread = useApp((state) => state.thread);

  const [editing, setEditing] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newPrompt, setNewPrompt] = useState("");

  const startEdit = (id: string, currentLabel: string, currentPrompt: string) => {
    setEditing(id);
    setLabel(currentLabel);
    setPrompt(currentPrompt);
  };

  const commitEdit = () => {
    if (!editing) {
      return;
    }
    updatePreset(editing, label, prompt);
    setEditing(null);
  };

  const commitNew = () => {
    if (!newLabel.trim() || !newPrompt.trim()) {
      return;
    }
    addPreset(newLabel, newPrompt);
    setNewLabel("");
    setNewPrompt("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Presets"
      subtitle="Questions you can fire at any thread. These are also the suggestions on an empty chat."
      className="flex flex-col overflow-hidden [&>header]:flex-none"
    >

          <ul className="-mr-2.5 mb-3.5 flex min-h-0 flex-1 list-none flex-col gap-0.5 overflow-y-auto p-0 pr-2.5">
            {presets.map((preset) => (
              <li
                key={preset.id}
                className={cn(
                  "group/row flex items-center gap-2.5 rounded-[9px] py-[7px] pr-2 pl-[11px]",
                  editing === preset.id
                    ? "items-stretch border border-line bg-panel-2 p-3"
                    : "hover:bg-line-soft",
                )}
              >
                {editing === preset.id ? (
                  <div className="flex w-full flex-col gap-2">
                    <input
                      className="w-full resize-y rounded-lg border border-line bg-panel px-[11px] py-2 text-[12.5px] leading-[1.5] outline-none transition-[border-color] duration-[120ms] focus:border-accent"
                      type="text"
                      autoComplete="off"
                      value={label}
                      placeholder="Short name"
                      spellCheck={false}
                      autoFocus
                      onChange={(event) => setLabel(event.target.value)}
                    />
                    <textarea
                      className="w-full resize-y rounded-lg border border-line bg-panel px-[11px] py-2 text-[12.5px] leading-[1.5] outline-none transition-[border-color] duration-[120ms] focus:border-accent"
                      value={prompt}
                      rows={2}
                      placeholder="The question to ask"
                      onChange={(event) => setPrompt(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                          event.preventDefault();
                          commitEdit();
                        }
                        if (event.key === "Escape") {
                          setEditing(null);
                        }
                      }}
                    />
                    <div className="flex items-center gap-2.5">
                      <PrimaryButton onClick={commitEdit} small>
                        Save
                      </PrimaryButton>
                      <GhostButton
                       
                       
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </GhostButton>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Name only at rest. This is the MANAGE surface — you
                        already know what your own presets ask — and the prompt
                        is right there the moment you press Edit. Showing both
                        made every row three lines tall, which is what pushed
                        "Add one" below the fold once you had a handful. The
                        full prompt stays one hover away as the title. */}
                    <div className="min-w-0 flex-1 truncate" title={preset.prompt}>
                      <span className="text-[12.5px] font-[550]">{preset.label}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-[120ms] group-hover/row:opacity-100 group-focus-within/row:opacity-100">
                      {thread ? (
                        <GhostButton
                         
                         
                          onClick={() => {
                            runPreset(preset.id);
                            setOpen(false);
                          }}
                        >
                          Run
                        </GhostButton>
                      ) : null}
                      <GhostButton
                       
                       
                        onClick={() => startEdit(preset.id, preset.label, preset.prompt)}
                      >
                        Edit
                      </GhostButton>
                      <IconButton
                       
                       
                        aria-label={`Delete ${preset.label}`}
                        onClick={() => removePreset(preset.id)}
                      >
<Trash2 size={12} strokeWidth={2} />
                      </IconButton>
                    </div>
                  </>
                )}
              </li>
            ))}
            {presets.length === 0 ? (
              <li className="text-xs text-muted">Nothing saved yet.</li>
            ) : null}
          </ul>

          <div className="mt-5 flex w-full flex-none flex-col gap-2 border-t border-line-soft pt-[18px]">
            <span className="text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">Add one</span>
            <input
              className="w-full resize-y rounded-lg border border-line bg-panel px-[11px] py-2 text-[12.5px] leading-[1.5] outline-none transition-[border-color] duration-[120ms] focus:border-accent"
              type="text"
              autoComplete="off"
              value={newLabel}
              placeholder="Short name"
              spellCheck={false}
              onChange={(event) => setNewLabel(event.target.value)}
            />
            <textarea
              className="w-full resize-y rounded-lg border border-line bg-panel px-[11px] py-2 text-[12.5px] leading-[1.5] outline-none transition-[border-color] duration-[120ms] focus:border-accent"
              value={newPrompt}
              rows={2}
              placeholder="The question to ask"
              onChange={(event) => setNewPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  commitNew();
                }
              }}
            />
            <div className="flex items-center gap-2.5">
              <PrimaryButton
               
               
                disabled={!newLabel.trim() || !newPrompt.trim()}
                onClick={commitNew} small>
                Add preset
              </PrimaryButton>
              <span className="text-xs leading-[1.5] text-muted">⌘⏎ to add</span>
            </div>
          </div>
    </Dialog>
  );
}
