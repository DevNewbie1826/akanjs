export class Href {
  static readonly #base = "https://akan.invalid";

  /** External is what the browser resolves off-site: any-case schemes, `//host`, backslash hosts,
   * whitespace-padded values, and scheme URLs (mailto:, tel:, sms:, blob:, app schemes) whose parsed
   * origin is not the placeholder base. javascript:/vbscript:/data: are never external; they keep the
   * inert in-app rewrite instead of a live href or window.open. A scheme-without-authority value such
   * as "https:foo" resolves to the placeholder origin and so reads as in-app here, while hasWebScheme
   * passes it through; both stay on-site. */
  static isExternal(href: string): boolean {
    let url: URL;
    try {
      url = new URL(href, Href.#base);
    } catch {
      return false;
    }
    if (url.protocol === "javascript:" || url.protocol === "vbscript:" || url.protocol === "data:") return false;
    return url.origin !== Href.#base;
  }

  /** An explicit http(s) scheme in any case; `//host` and `httpbin/x` do not qualify. */
  static hasWebScheme(href: string): boolean {
    return /^https?:/i.test(href);
  }
}
