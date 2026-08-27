import { describe, expect, it } from "vitest";
import { isThemeId, resolveTheme, THEMES } from "./theme";

describe("isThemeId", () => {
  it("accepts every theme the picker offers", () => {
    for (const theme of THEMES) {
      expect(isThemeId(theme.id)).toBe(true);
    }
  });

  it("rejects anything else", () => {
    expect(isThemeId("solarized")).toBe(false);
    expect(isThemeId(null)).toBe(false);
    expect(isThemeId("")).toBe(false);
  });
});

describe("resolveTheme", () => {
  it("follows the system appearance", () => {
    expect(resolveTheme("system", true)).toBe("dusk");
    expect(resolveTheme("system", false)).toBe("paper");
  });

  it("leaves a chosen palette alone", () => {
    expect(resolveTheme("sepia", true)).toBe("sepia");
    expect(resolveTheme("midnight", false)).toBe("midnight");
  });

  it("only ever resolves to a real palette", () => {
    const palettes = THEMES.filter((theme) => theme.id !== "system").map((theme) => theme.id);
    for (const dark of [true, false]) {
      for (const theme of THEMES) {
        expect(palettes).toContain(resolveTheme(theme.id, dark));
      }
    }
  });
});
