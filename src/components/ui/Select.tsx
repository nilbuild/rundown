import { Select as Base } from "@base-ui-components/react/select";
import { Check, ChevronDown } from "lucide-react";

export interface Option {
  value: string;
  label: string;
  hint?: string;
}

interface Props {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  ariaLabel: string;
  size?: "sm" | "md";
}

/// A styled listbox rather than a native `<select>`, which on macOS renders
/// with system chrome that fights the rest of the app.
export function Select(props: Props) {
  const { value, options, onChange, ariaLabel, size } = props;
  const current = options.find((option) => option.value === value);

  return (
    <Base.Root
      value={value}
      onValueChange={(next) => onChange(String(next ?? ""))}
      items={options}
    >
      <Base.Trigger className={`ui-select ${size === "sm" ? "sm" : ""}`} aria-label={ariaLabel}>
        <Base.Value>{current?.label ?? "Default"}</Base.Value>
        <Base.Icon className="ui-select-caret">
<ChevronDown size={12} strokeWidth={2} />
        </Base.Icon>
      </Base.Trigger>

      <Base.Portal>
        <Base.Positioner className="ui-layer" sideOffset={6} alignItemWithTrigger={false}>
          <Base.Popup className="ui-select-popup">
            {options.map((option) => (
              <Base.Item key={option.value} value={option.value} className="ui-select-item">
                <Base.ItemIndicator className="ui-select-check">
<Check size={12} strokeWidth={2.4} />
                </Base.ItemIndicator>
                <div className="ui-select-body">
                  <Base.ItemText>{option.label}</Base.ItemText>
                  {option.hint ? <span className="ui-select-hint">{option.hint}</span> : null}
                </div>
              </Base.Item>
            ))}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
