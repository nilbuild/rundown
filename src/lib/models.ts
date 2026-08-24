/// What the backend offers: `value` is the string handed to `--model`, `label`
/// is the friendly name, `hint` a one-line description the picker does not show.
export interface Option {
  value: string;
  label: string;
  hint?: string;
}

/// What the picker renders. Base UI reads `{ value, label }` off an item and
/// puts the *label* in the field, so the label has to be the model string
/// itself — otherwise choosing Opus would leave the word "Opus" in a field
/// whose contents get passed to `--model`. The friendly name moves to `title`,
/// which only the row renders.
export interface Item {
  value: string;
  label: string;
  title: string;
}

export function toItems(options: Option[]): Item[] {
  return options.map((option) => ({
    value: option.value,
    label: option.value,
    title: option.label,
  }));
}

/// Matches the model string and the friendly name both, so "opus" and "Opus"
/// find the same row. Nothing the row does not show is searched — a hit with no
/// visible cause reads as a bug.
export function matches(item: Item, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return [item.label, item.title].some((entry) => entry.toLowerCase().includes(needle));
}
