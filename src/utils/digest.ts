export type Verdict = "read" | "skim" | "skip";

export interface Section {
  heading: string;
  /// The one-sentence point, shown even when the section is collapsed.
  gist: string;
  /// Everything else — quotes, attribution, framing.
  body: string;
  quoteCount: number;
}

export interface ParsedDigest {
  verdict: Verdict | null;
  verdictReason: string;
  /// Anything before the first heading that was not the verdict line.
  preamble: string;
  sections: Section[];
}

const VERDICT = /^\s*(?:\*\*)?VERDICT(?:\*\*)?\s*[:—-]\s*(read|skim|skip)\b\s*(?:[—:-]\s*)?(.*)$/i;

/// Split a digest into scannable parts. Written to degrade gracefully: a model
/// that ignores the format still renders, just without the extra affordances.
export function parseDigest(markdown: string): ParsedDigest {
  const lines = markdown.split("\n");
  let verdict: Verdict | null = null;
  let verdictReason = "";
  let cursor = 0;

  while (cursor < lines.length && lines[cursor].trim() === "") {
    cursor += 1;
  }
  const match = lines[cursor]?.match(VERDICT);
  if (match) {
    verdict = match[1].toLowerCase() as Verdict;
    verdictReason = match[2].trim().replace(/^[—:-]\s*/, "");
    cursor += 1;
  }

  const preambleLines: string[] = [];
  while (cursor < lines.length && !lines[cursor].startsWith("## ")) {
    preambleLines.push(lines[cursor]);
    cursor += 1;
  }

  const sections: Section[] = [];
  while (cursor < lines.length) {
    if (!lines[cursor].startsWith("## ")) {
      cursor += 1;
      continue;
    }
    const heading = lines[cursor].slice(3).trim();
    cursor += 1;

    const bodyLines: string[] = [];
    while (cursor < lines.length && !lines[cursor].startsWith("## ")) {
      bodyLines.push(lines[cursor]);
      cursor += 1;
    }

    // The gist is the first non-empty paragraph that is not itself a quote,
    // attribution, or list — so a section that skips it still renders sanely.
    let gist = "";
    let consumed = 0;
    for (let index = 0; index < bodyLines.length; index += 1) {
      const line = bodyLines[index].trim();
      if (line === "") {
        continue;
      }
      if (line.startsWith(">") || line.startsWith("—") || line.startsWith("-") || line.startsWith("*")) {
        break;
      }
      gist = line;
      consumed = index + 1;
      break;
    }

    const body = bodyLines.slice(consumed).join("\n").trim();
    const quoteCount = (body.match(/^\s*>/gm) ?? []).length;
    sections.push({ heading, gist, body, quoteCount });
  }

  return {
    verdict,
    verdictReason,
    preamble: preambleLines.join("\n").trim(),
    sections,
  };
}

export function verdictLabel(verdict: Verdict) {
  if (verdict === "read") {
    return "Worth reading in full";
  }
  if (verdict === "skim") {
    return "Worth skimming";
  }
  return "The digest is enough";
}

export function minutes(words: number) {
  if (words <= 0) {
    return 0;
  }
  return Math.max(1, Math.round(words / 230));
}

export function countWords(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

/// Runs of adjacent source markers — `[1](hn:12)[2](hn:34)` — collapse into a
/// single marker carrying every id. Two dots side by side say nothing that one
/// dot with two sources behind it does not.
export function mergeSourceRuns(markdown: string) {
  // The markers usually arrive with no separator at all, so each id has to be
  // pulled out of the run rather than split off it.
  const marker = /\[\d+\]\(hn:(\d+)\)/g;
  // Separators are consumed only *between* markers. A trailing `[ \t]*` would
  // swallow the space after the run and glue the next word to the marker.
  const run = /\[\d+\]\(hn:\d+\)(?:[ \t]*\[\d+\]\(hn:\d+\))+/g;

  return markdown.replace(run, (matched) => {
    const ids: string[] = [];
    for (const hit of matched.matchAll(marker)) {
      if (!ids.includes(hit[1])) {
        ids.push(hit[1]);
      }
    }
    return ids.length > 0 ? `[src](hn:${ids.join(",")})` : matched;
  });
}

export type ReadLevel = "gist" | "skim" | "full";

export interface RundownSection {
  heading: string;
  lead: string;
  rest: string;
}

export interface ParsedRundown {
  lede: string;
  sections: RundownSection[];
}

/// Split a briefing into the layers a reader can choose between. Written to
/// degrade: if the model emits no headings, everything lands in the lede and
/// the full text is still what renders.
export function parseRundown(markdown: string): ParsedRundown {
  const lines = markdown.split("\n");
  const ledeLines: string[] = [];
  let cursor = 0;

  while (cursor < lines.length && !lines[cursor].startsWith("## ")) {
    ledeLines.push(lines[cursor]);
    cursor += 1;
  }

  const sections: RundownSection[] = [];
  while (cursor < lines.length) {
    if (!lines[cursor].startsWith("## ")) {
      cursor += 1;
      continue;
    }
    const heading = lines[cursor].slice(3).trim();
    cursor += 1;

    const body: string[] = [];
    while (cursor < lines.length && !lines[cursor].startsWith("## ")) {
      body.push(lines[cursor]);
      cursor += 1;
    }

    const blocks = body
      .join("\n")
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean);

    sections.push({
      heading,
      lead: blocks[0] ?? "",
      rest: blocks.slice(1).join("\n\n"),
    });
  }

  return { lede: ledeLines.join("\n").trim(), sections };
}

/// Rebuild the markdown for one reading level. Full returns the original text
/// untouched so nothing can be lost in reassembly.
export function renderLevel(markdown: string, level: ReadLevel) {
  if (level === "full") {
    return markdown;
  }
  const parsed = parseRundown(markdown);
  if (parsed.sections.length === 0) {
    return markdown;
  }

  const parts = [parsed.lede];
  for (const section of parsed.sections) {
    parts.push(`## ${section.heading}`);
    if (level === "skim" && section.lead) {
      parts.push(section.lead);
    }
  }
  return parts.filter(Boolean).join("\n\n");
}
