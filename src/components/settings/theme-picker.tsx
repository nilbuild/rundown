import { useApp } from "~/stores/app";
import { cn } from "~/utils/classname";
import { THEMES } from "~/utils/theme";

export function ThemePicker() {
  const theme = useApp((state) => state.theme);
  const palette = useApp((state) => state.palette);
  const setTheme = useApp((state) => state.setTheme);

  return (
    <div className="flex flex-wrap gap-2 justify-self-start">
      {THEMES.map((entry) => {
        const active = theme === entry.id;
        return (
          <button
            key={entry.id}
            type="button"
            title={entry.hint}
            aria-pressed={active}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-[9px] border p-1.5",
              active ? "border-accent" : "border-line hover:border-muted",
            )}
            onClick={() => setTheme(entry.id)}
          >
            {/* The swatch carries the palette it is offering, so it paints
                itself from the same tokens the app would use. */}
            <span
              data-theme={entry.id === "system" ? palette : entry.id}
              className="flex h-9 w-14 overflow-hidden rounded-[5px] border border-line bg-panel"
            >
              <span className="h-full w-1/3 border-r border-line bg-rail" />
              <span className="flex flex-1 flex-col justify-center gap-1 px-1.5">
                <span className="h-[3px] rounded-full bg-accent" />
                <span className="h-[3px] w-3/4 rounded-full bg-line" />
              </span>
            </span>
            <span className={cn("text-[11px]", active ? "text-fg" : "text-muted")}>
              {entry.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
