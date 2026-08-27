import { cn } from "~/utils/classname";
import { GhostButton, PrimaryButton } from "~/components/ui/button";

interface Props {
  title: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  secondary?: { label: string; onClick: () => void };
}

/// Error text from a command arrives as a raw Rust/JS error string. Strip the
/// noise so the reader sees the cause, not the plumbing.
function readable(message: string) {
  return message
    .replace(/^Error:\s*/i, "")
    .replace(/^error (sending|returned from) [^:]*:\s*/i, "")
    .replace(/^invoke\S*\s*/i, "")
    .trim();
}

function diagnose(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("dns") || lower.includes("connect") || lower.includes("network")) {
    return "This looks like a connection problem rather than a bug.";
  }
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return "The request took too long. Hacker News or the linked site may be slow right now.";
  }
  if (lower.includes("not found on") || lower.includes("is it installed")) {
    return "Check Settings to confirm which CLI this app should use.";
  }
  if (lower.includes("rate") && lower.includes("limit")) {
    return "You may have hit a usage limit on your subscription.";
  }
  return null;
}

export function ErrorState(props: Props) {
  const { title, message, onRetry, retryLabel, secondary } = props;
  const detail = readable(message);
  const hint = diagnose(detail);

  return (
    <div className="mx-auto max-w-[460px] px-8 py-20 text-center">
      <h2 className="mb-[10px] font-serif text-[21px] font-semibold tracking-[-0.015em]">
        {title}
      </h2>
      <p className="mb-2 text-[13.5px] leading-[1.55] break-words text-bad">{detail}</p>
      {hint ? <p className="text-xs leading-[1.5] text-muted">{hint}</p> : null}
      <div className="mt-5 flex justify-center gap-2">
        {onRetry ? (
          <PrimaryButton onClick={onRetry}>
            {retryLabel ?? "Try again"}
          </PrimaryButton>
        ) : null}
        {secondary ? (
          <GhostButton onClick={secondary.onClick}>
            {secondary.label}
          </GhostButton>
        ) : null}
      </div>
    </div>
  );
}

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
