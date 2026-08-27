import { describe, expect, it } from "vitest";
import { toPlainMarkdown, toPortableMarkdown } from "~/utils/export";

describe("toPortableMarkdown", () => {
  it("turns an app-internal link into a real one", () => {
    expect(toPortableMarkdown("A claim.[1](hn:49350799)")).toBe(
      "A claim.[1](https://news.ycombinator.com/item?id=49350799)",
    );
  });

  it("uses the first source when a marker carries several", () => {
    expect(toPortableMarkdown("A claim.[src](hn:11,22)")).toBe(
      "A claim.[src](https://news.ycombinator.com/item?id=11)",
    );
  });

  it("rewrites a digest attribution", () => {
    expect(toPortableMarkdown("— [@alice](hn:77)")).toBe(
      "— [@alice](https://news.ycombinator.com/item?id=77)",
    );
  });

  it("leaves ordinary links alone", () => {
    const input = "See [the docs](https://example.com).";
    expect(toPortableMarkdown(input)).toBe(input);
  });
});

describe("toPlainMarkdown", () => {
  it("removes a marker and the space holding it", () => {
    expect(toPlainMarkdown("A claim.[1](hn:11) Next.")).toBe("A claim. Next.");
  });

  it("removes a merged marker", () => {
    expect(toPlainMarkdown("A claim.[src](hn:11,22)")).toBe("A claim.");
  });

  it("keeps the author but drops the link", () => {
    expect(toPlainMarkdown("— [@alice](hn:77)")).toBe("— @alice");
  });

  it("leaves ordinary links alone", () => {
    const input = "See [the docs](https://example.com).";
    expect(toPlainMarkdown(input)).toBe(input);
  });
});
