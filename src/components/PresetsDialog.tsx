import { useState } from "react";
import { Dialog } from "@base-ui-components/react/dialog";
import { useApp } from "../state/app";
import { Trash2, X } from "lucide-react";

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
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="ui-backdrop" />
        <Dialog.Popup className="ui-dialog presets-dialog">
          <header>
            <div>
              <Dialog.Title className="ui-dialog-title">Presets</Dialog.Title>
              <Dialog.Description className="ui-dialog-sub">
                Questions you can fire at any thread. These are also the suggestions on an empty
                chat.
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close">
<X size={13} strokeWidth={2.2} />
            </Dialog.Close>
          </header>

          <ul className="preset-list">
            {presets.map((preset) => (
              <li key={preset.id} className={editing === preset.id ? "editing" : ""}>
                {editing === preset.id ? (
                  <div className="preset-edit">
                    <input
                      type="text"
                      autoComplete="off"
                      value={label}
                      placeholder="Short name"
                      spellCheck={false}
                      autoFocus
                      onChange={(event) => setLabel(event.target.value)}
                    />
                    <textarea
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
                    <div className="preset-edit-foot">
                      <button type="button" className="primary-button small" onClick={commitEdit}>
                        Save
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="preset-body">
                      <span className="preset-label">{preset.label}</span>
                      <span className="preset-prompt">{preset.prompt}</span>
                    </div>
                    <div className="preset-actions">
                      {thread ? (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => {
                            runPreset(preset.id);
                            setOpen(false);
                          }}
                        >
                          Run
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => startEdit(preset.id, preset.label, preset.prompt)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Delete ${preset.label}`}
                        onClick={() => removePreset(preset.id)}
                      >
<Trash2 size={12} strokeWidth={2} />
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
            {presets.length === 0 ? (
              <li className="preset-empty">Nothing saved yet.</li>
            ) : null}
          </ul>

          <div className="preset-new">
            <span className="label">Add one</span>
            <input
              type="text"
              autoComplete="off"
              value={newLabel}
              placeholder="Short name"
              spellCheck={false}
              onChange={(event) => setNewLabel(event.target.value)}
            />
            <textarea
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
            <div className="preset-edit-foot">
              <button
                type="button"
                className="primary-button small"
                disabled={!newLabel.trim() || !newPrompt.trim()}
                onClick={commitNew}
              >
                Add preset
              </button>
              <span className="fine">⌘⏎ to add</span>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
