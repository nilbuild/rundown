import { cn } from "~/utils/classname";
import { readable } from "~/components/ui/readable-error";

/// Compact variant for errors that appear inside a pane that still has content.
export function InlineError(props: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  const { message, onRetry, className } = props;
  return (
    <div
      className={cn(
        "my-[10px] flex items-center gap-[10px] rounded-lg bg-[color-mix(in_srgb,var(--bad)_10%,transparent)] px-3 py-[9px] text-[12.5px] leading-[1.5] break-words text-bad",
        className,
      )}
    >
      <span>{readable(message)}</span>
      {onRetry ? (
        <button type="button" className="ml-auto whitespace-nowrap underline" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
