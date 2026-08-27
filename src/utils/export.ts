const HN_ITEM = "https://news.ycombinator.com/item?id=";

/// `hn:` is an app-internal scheme. Pasted anywhere else it is a dead link, so
/// anything leaving the app gets real URLs.
export function toPortableMarkdown(markdown: string) {
  return markdown.replace(/\]\(hn:([\d,\s]+)\)/g, (_match, ids: string) => {
    const first = ids
      .split(",")
      .map((part) => part.trim())
      .find(Boolean);
    return first ? `](${HN_ITEM}${first})` : "]()";
  });
}

/// Prose with the source markers taken out — for pasting into a draft where the
/// citations would be noise.
export function toPlainMarkdown(markdown: string) {
  return (
    markdown
      // A numbered or `src` marker: drop it and any space it was hanging on.
      .replace(/[ \t]*\[(?:\d+|src)\]\(hn:[\d,\s]+\)/g, "")
      // An attribution line keeps the name but loses the link.
      .replace(/\[@([^\]]+)\]\(hn:[\d,\s]+\)/g, "@$1")
      .replace(/[ \t]+$/gm, "")
  );
}
