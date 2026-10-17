---
"akanjs": patch
---

`Link` recognizes external hrefs by parsing them as the browser does. Any-case schemes such as `HTTPS://` and `MAILTO:`, protocol-relative URLs, `sms:`, `blob:`, app schemes, and authority-less http(s) values like `https:example.com` render and open unchanged instead of becoming `/<lang>` routes. `javascript:`, `vbscript:`, and `data:` are never treated as external.

Router navigation and redirects pass explicit HTTP(S) URLs through in any case and keep scheme-relative paths on the site. The shared helpers are public as `Href.isExternal`, `Href.hasWebScheme`, and `Href.toExternalUrl` from `akanjs/client`; `CsrLink` opens the canonical absolute URL, so a protocol-relative link works inside a native shell.
