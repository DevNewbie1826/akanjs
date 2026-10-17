export class Href {
  static readonly #blocked = new Set(["javascript:", "vbscript:", "data:"]);

  /** External is what the browser takes off-site: any absolute URL with a scheme, and `//`/`\\` network-path
   * forms it resolves to another host. javascript:, vbscript: and data: never count. */
  static isExternal(href: string): boolean {
    // An absolute URL with a scheme; the parser strips surrounding whitespace and tabs itself.
    if (URL.canParse(href)) return !Href.#blocked.has(new URL(href).protocol);
    // Network-path syntax: a browser reads // and \\ alike as another host.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: mirrors the URL parser, which trims leading C0 controls and spaces
    return /^[\\/]{2}/.test(href.replace(/[\t\n\r]/g, "").replace(/^[\u0000-\u0020]+/, ""));
  }

  /** An explicit http(s) scheme in any case; `//host` and `httpbin/x` do not qualify. */
  static hasWebScheme(href: string): boolean {
    return /^https?:/i.test(href);
  }

  /** Canonical absolute URL for an external href: scheme-relative and backslash hosts resolve against the page's
   * http(s) origin, or https: when the page is a native `app://` shell. */
  static toExternalUrl(href: string, base: string): string {
    const baseProtocol = URL.canParse(base) ? new URL(base).protocol : "";
    return new URL(href, /^https?:$/.test(baseProtocol) ? base : "https://localhost").href;
  }
}
