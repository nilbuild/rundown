import "./select.css";

import { useEffect, useRef, useState } from "react";
import { Autocomplete } from "@base-ui-components/react/autocomplete";
import { Check, ChevronDown } from "lucide-react";
import { matches, toItems } from "~/utils/models";
import type { Item, Option } from "~/utils/models";

export type { Option };

interface Props {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  ariaLabel: string;
  size?: "sm" | "md";
  placeholder?: string;
  /// Option value -> the model it resolves to. Shown beside the name so an
  /// alias says what it will actually run.
  resolved?: Record<string, string>;
}

/// A combobox rather than a listbox: the offered models are a convenience, not
/// a ceiling. Claude's aliases and Codex's cached slugs each go out of date in
/// their own way, so any model the CLI accepts can be typed straight in. The
/// field therefore shows the model string rather than the friendly name — what
/// you read is what gets passed to `--model`.
export function Select(props: Props) {
  const { value, options, onChange, ariaLabel, size, placeholder, resolved } = props;

  const [draft, setDraft] = useState(value);
  // Commits read this rather than `draft`: blur and Enter can land in the same
  // tick as a keystroke, and state would still be a character behind.
  const latest = useRef(value);

  useEffect(() => {
    setDraft(value);
    latest.current = value;
  }, [value]);

  const items = toItems(options);

  function commit(next: string) {
    const trimmed = next.trim();
    if (trimmed === value) {
      return;
    }
    onChange(trimmed);
  }

  return (
    <Autocomplete.Root
      items={items}
      value={draft}
      openOnInputClick
      filter={matches}
      onValueChange={(next, details) => {
        latest.current = next;
        setDraft(next);
        if (details.reason !== "item-press") {
          return;
        }
        commit(next);
      }}
    >
      <div className={`ui-combo ${size === "sm" ? "sm" : ""}`}>
        <Autocomplete.Input
          className="ui-combo-input"
          aria-label={ariaLabel}
          placeholder={placeholder ?? "Default"}
          spellCheck={false}
          autoComplete="off"
          onBlur={() => commit(latest.current)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") {
              return;
            }
            commit(latest.current);
          }}
        />
        <Autocomplete.Trigger className="ui-combo-caret" aria-label="Show models">
          <ChevronDown size={12} strokeWidth={2} />
        </Autocomplete.Trigger>
      </div>

      <Autocomplete.Portal>
        <Autocomplete.Positioner className="ui-layer" sideOffset={6}>
          <Autocomplete.Popup className="ui-select-popup">
            <Autocomplete.Empty className="ui-combo-empty">
              No match — press ⏎ to use what you typed
            </Autocomplete.Empty>
            <Autocomplete.List>
              {(item: Item) => (
                <Autocomplete.Item key={item.value} value={item} className="ui-select-item">
                  <span className="ui-select-check">
                    {item.value === value ? <Check size={12} strokeWidth={2.4} /> : null}
                  </span>
                  {item.title}
                  {resolved?.[item.value] ? (
                    <span className="ui-select-resolved">{resolved[item.value]}</span>
                  ) : null}
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}
