import { useMemo } from "react";

/// FTS5 marks matches with <b>. Rendering that as text would show the tags, and
/// rendering it as HTML would trust the corpus, so the marked runs are split out
/// and rebuilt as elements.
export function Highlighted(props: { snippet: string }) {
  const parts = useMemo(() => props.snippet.split(/(<b>|<\/b>)/), [props.snippet]);
  let on = false;
  return (
    <>
      {parts.map((part, index) => {
        if (part === "<b>") {
          on = true;
          return null;
        }
        if (part === "</b>") {
          on = false;
          return null;
        }
        if (!part) {
          return null;
        }
        return on ? <mark key={index}>{part}</mark> : <span key={index}>{part}</span>;
      })}
    </>
  );
}
