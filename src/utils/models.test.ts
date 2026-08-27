import { describe, expect, it } from "vitest";
import { matches, toItems } from "~/utils/models";

const OPTIONS = [
  { value: "", label: "Default", hint: "Whatever the CLI is set to" },
  { value: "haiku", label: "Haiku", hint: "Fastest" },
  { value: "opus", label: "Opus", hint: "Deepest" },
];

describe("toItems", () => {
  // The field's contents are passed to `--model`, so the label Base UI puts
  // there has to be the model string, not the friendly name.
  it("puts the model string in the label and the name in the title", () => {
    const [, haiku] = toItems(OPTIONS);
    expect(haiku.label).toBe("haiku");
    expect(haiku.title).toBe("Haiku");
    expect(haiku.value).toBe("haiku");
  });

  it("leaves the default entry with an empty label", () => {
    const [fallback] = toItems(OPTIONS);
    expect(fallback.label).toBe("");
    expect(fallback.title).toBe("Default");
  });

  // The rows are one line now, so a description that is not rendered must not
  // reach the item either — it would only show up as an unexplained filter hit.
  it("drops the description", () => {
    expect(toItems(OPTIONS)[2]).not.toHaveProperty("hint");
  });
});

describe("matches", () => {
  const [fallback, haiku, opus] = toItems(OPTIONS);

  it("keeps everything when nothing is typed", () => {
    expect(matches(opus, "")).toBe(true);
    expect(matches(opus, "   ")).toBe(true);
  });

  it("matches the model string", () => {
    expect(matches(opus, "op")).toBe(true);
    expect(matches(haiku, "op")).toBe(false);
  });

  it("matches the friendly name regardless of case", () => {
    expect(matches(opus, "Opus")).toBe(true);
    expect(matches(haiku, "HAIKU")).toBe(true);
  });

  it("does not match text the row never shows", () => {
    expect(matches(haiku, "fastest")).toBe(false);
  });

  // Its label is empty, which is a substring of every query — it has to be
  // matched on its title alone or it would survive every filter.
  it("does not let the default entry match everything", () => {
    expect(matches(fallback, "opus")).toBe(false);
    expect(matches(fallback, "def")).toBe(true);
  });
});
