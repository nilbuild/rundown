import { describe, expect, it } from "vitest";
import { mergeSourceRuns, parseDigest, renderLevel } from "~/utils/digest";

describe("mergeSourceRuns", () => {
  it("merges markers that sit flush against each other", () => {
    // This is how the model actually emits them, and splitting on whitespace
    // silently dropped every id but the first.
    const out = mergeSourceRuns("Claim.[1](hn:11)[2](hn:22) Next.");
    expect(out).toBe("Claim.[src](hn:11,22) Next.");
  });

  it("merges markers separated by a space", () => {
    expect(mergeSourceRuns("Claim.[1](hn:11) [2](hn:22)")).toBe("Claim.[src](hn:11,22)");
  });

  it("leaves a lone marker alone", () => {
    expect(mergeSourceRuns("Claim.[1](hn:11) more")).toBe("Claim.[1](hn:11) more");
  });

  it("does not duplicate a repeated id", () => {
    expect(mergeSourceRuns("[1](hn:11)[2](hn:11)")).toBe("[src](hn:11)");
  });

  it("keeps ordinary links untouched", () => {
    const input = "See [the docs](https://example.com) for more.";
    expect(mergeSourceRuns(input)).toBe(input);
  });
});

describe("parseDigest", () => {
  it("reads the verdict line and splits sections", () => {
    const parsed = parseDigest(
      "VERDICT: skim — thin but one good correction\n\n## A heading\nThe point.\n\n> quote\n",
    );
    expect(parsed.verdict).toBe("skim");
    expect(parsed.verdictReason).toBe("thin but one good correction");
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0].heading).toBe("A heading");
    expect(parsed.sections[0].gist).toBe("The point.");
    expect(parsed.sections[0].quoteCount).toBe(1);
  });

  it("still renders when the model ignores the format", () => {
    const parsed = parseDigest("Just some prose with no headings at all.");
    expect(parsed.verdict).toBeNull();
    expect(parsed.sections).toHaveLength(0);
  });
});

describe("reading levels", () => {
  const doc = [
    "The one-line point of the whole thing.",
    "",
    "## First heading",
    "The lead sentence.",
    "",
    "Elaboration that only a full read needs.",
    "",
    "## Second heading",
    "Another lead.",
  ].join("\n");

  it("gist keeps the lede and headings only", () => {
    const out = renderLevel(doc, "gist");
    expect(out).toContain("The one-line point");
    expect(out).toContain("## First heading");
    expect(out).not.toContain("The lead sentence.");
  });

  it("skim adds each section's opening block but not the elaboration", () => {
    const out = renderLevel(doc, "skim");
    expect(out).toContain("The lead sentence.");
    expect(out).not.toContain("Elaboration that only a full read needs.");
  });

  it("full is byte-identical to the source", () => {
    expect(renderLevel(doc, "full")).toBe(doc);
  });

  it("falls back to the full text when there are no headings", () => {
    const plain = "Just prose, no structure at all.";
    expect(renderLevel(plain, "gist")).toBe(plain);
  });
});
