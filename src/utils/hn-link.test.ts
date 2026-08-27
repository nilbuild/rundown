import { describe, expect, it } from "vitest";
import { parseItemRef } from "./hn-link";

describe("parseItemRef", () => {
  it("reads a story link", () => {
    expect(parseItemRef("https://news.ycombinator.com/item?id=49273478")).toBe(49273478);
  });

  // A shared Hacker News link is very often a comment permalink, and it carries
  // the same shape as a story link.
  it("reads a comment permalink the same way", () => {
    expect(parseItemRef("https://news.ycombinator.com/item?id=49280001#49280500")).toBe(49280001);
  });

  it("copes with what a paste actually looks like", () => {
    expect(parseItemRef("  news.ycombinator.com/item?id=42  ")).toBe(42);
    expect(parseItemRef("http://www.news.ycombinator.com/item?id=42")).toBe(42);
    expect(parseItemRef("https://news.ycombinator.com/item?p=2&id=42")).toBe(42);
  });

  it("takes a bare id", () => {
    expect(parseItemRef("49273478")).toBe(49273478);
  });

  // Otherwise typing a word that happens to contain digits would stop being a
  // search and start opening threads.
  it("leaves ordinary searches alone", () => {
    expect(parseItemRef("rust 1.0")).toBeNull();
    expect(parseItemRef("show hn")).toBeNull();
    expect(parseItemRef("")).toBeNull();
  });

  it("ignores an id from any other host", () => {
    expect(parseItemRef("https://example.com/item?id=49273478")).toBeNull();
    expect(parseItemRef("https://evil.news.ycombinator.com.example/item?id=1")).toBeNull();
  });

  it("rejects ids that are not usable", () => {
    expect(parseItemRef("0")).toBeNull();
    expect(parseItemRef("99999999999999999999")).toBeNull();
  });
});
