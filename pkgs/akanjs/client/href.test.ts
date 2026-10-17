import { describe, expect, test } from "bun:test";
import { Href } from "./href";

const externalTable: Array<[string, boolean]> = [
  ["https://example.com/x", true],
  ["HTTPS://example.com/x", true],
  ["Http://example.com/x", true],
  ["//example.com/x", true],
  ["mailto:a@b.co", true],
  ["MAILTO:a@b.co", true],
  ["tel:+82101234", true],
  ["sms:+82101234", true],
  ["blob:https://site.example/0000", true],
  ["kakaotalk://open", true],
  [" https://example.com/x", true],
  ["\\\\example.com\\x", true],
  ["/\\example.com/x", true],
  ["https://site.example/en/faq", true],
  ["javascript:alert(1)", false],
  ["JavaScript:alert(1)", false],
  [" javascript:alert(1)", false],
  ["java\tscript:alert(1)", false],
  ["vbscript:msgbox(1)", false],
  ["data:text/html,hi", false],
  ["DATA:text/html,hi", false],
  ["#top", false],
  ["?tab=a", false],
  ["/faq", false],
  ["faq", false],
  ["httpbin/x", false],
  ["/en//double", false],
  ["", false],
];

describe("Href.isExternal", () => {
  for (const [href, expected] of externalTable) {
    test(`${JSON.stringify(href)} -> ${expected}`, () => {
      expect(Href.isExternal(href)).toBe(expected);
    });
  }
});

const webSchemeTable: Array<[string, boolean]> = [
  ["https://x", true],
  ["HTTPS://x", true],
  ["Http://x", true],
  ["http:x", true],
  ["//x", false],
  ["httpbin/x", false],
  ["/faq", false],
  ["mailto:a@b.co", false],
  [" https://x", false],
];

describe("Href.hasWebScheme", () => {
  for (const [href, expected] of webSchemeTable) {
    test(`${JSON.stringify(href)} -> ${expected}`, () => {
      expect(Href.hasWebScheme(href)).toBe(expected);
    });
  }
});
