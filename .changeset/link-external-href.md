---
"akanjs": patch
---

`Link` recognizes external hrefs by parsing them as the browser does. Any-case schemes such as `HTTPS://` and `MAILTO:`, protocol-relative URLs, `sms:`, `blob:`, and app schemes render and open unchanged instead of becoming `/<lang>` routes. `javascript:`, `vbscript:`, and `data:` are never treated as external.

Router navigation and redirects pass explicit HTTP(S) URLs through in any case and keep scheme-relative paths on the site. The shared helper is public as `Href.isExternal` and `Href.hasWebScheme` from `akanjs/client`.
