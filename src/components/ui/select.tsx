import { useEffect, useRef, useState } from "react";
import { Autocomplete } from "@base-ui-components/react/autocomplete";
import { Check, ChevronDown } from "lucide-react";
import { matches, toItems } from "~/utils/models";
import { cn } from "~/utils/classname";
import type { Item, Option } from "~/utils/models";

export type { Option };

interface Props {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  ariaLabel: string;
  size?: "sm" | "md";
  placeholder?: string;
  className?: string;
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
  const { className } = props;

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
      <div
        className={cn(
          "inline-flex h-7 min-w-0 items-center rounded-[7px] border border-line bg-panel pr-1 pl-[10px] transition-[border-color] duration-[120ms] hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--line))] focus-within:border-[color-mix(in_srgb,var(--accent)_65%,var(--line))]",
          // An <input> carries a ~20-character intrinsic width, so left alone
          // the combobox pushes the rest of the composer row off the end.
          size === "sm" && "h-6 w-[140px] shrink-0 bg-transparent pr-[3px] pl-[9px]",
          className,
        )}
      >
        <Autocomplete.Input
          className={cn(
            "h-full min-w-0 flex-1 border-none bg-transparent font-[inherit] text-[12.5px] text-fg outline-none placeholder:text-muted",
            size === "sm" && "text-[11.5px]",
          )}
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
        <Autocomplete.Trigger
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-[5px] text-muted hover:bg-line-soft hover:text-fg"
          aria-label="Show models"
        >
          <ChevronDown size={12} strokeWidth={2} />
        </Autocomplete.Trigger>
      </div>

      <Autocomplete.Portal>
        <Autocomplete.Positioner className="z-300" sideOffset={6}>
          <Autocomplete.Popup className="min-w-(--anchor-width) origin-(--transform-origin) rounded-[10px] border border-line bg-panel p-1 shadow-panel outline-none transition-[opacity,transform] duration-[120ms] data-[ending-style]:scale-97 data-[ending-style]:opacity-0 data-[starting-style]:scale-97 data-[starting-style]:opacity-0">
            <Autocomplete.Empty className="text-[11.5px] leading-[1.4] text-muted not-empty:px-[10px] not-empty:py-[7px]">
              No match — press ⏎ to use what you typed
            </Autocomplete.Empty>
            <Autocomplete.List>
              {(item: Item) => (
                <Autocomplete.Item key={item.value} value={item} className="flex cursor-default items-center gap-2 rounded-[7px] py-1.5 pr-[10px] pl-[7px] text-[12.5px] leading-[1.4] outline-none select-none data-[highlighted]:bg-accent-soft data-[highlighted]:text-accent">
                  <span className="inline-flex w-3 shrink-0 text-accent">
                    {item.value === value ? <Check size={12} strokeWidth={2.4} /> : null}
                  </span>
                  {item.title}
                  {resolved?.[item.value] ? (
                    <span className="ml-auto pl-[14px] font-mono text-[10.5px] text-muted">{resolved[item.value]}</span>
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
