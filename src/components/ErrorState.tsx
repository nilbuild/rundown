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
    <div className="error-state">
      <h2>{title}</h2>
      <p className="error-message">{detail}</p>
      {hint ? <p className="fine">{hint}</p> : null}
      <div className="error-actions">
        {onRetry ? (
          <button type="button" className="primary-button" onClick={onRetry}>
            {retryLabel ?? "Try again"}
          </button>
        ) : null}
        {secondary ? (
          <button type="button" className="ghost-button" onClick={secondary.onClick}>
            {secondary.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/// Compact variant for errors that appear inside a pane that still has content.
export function InlineError(props: { message: string; onRetry?: () => void }) {
  const { message, onRetry } = props;
  return (
    <div className="inline-error">
      <span>{readable(message)}</span>
      {onRetry ? (
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
