---
"akanjs": patch
---

`Href` no longer calls `URL.canParse`, which Safari and iOS Safari only ship from 17, so `Link` renders again on iOS 16 native shells. `CsrLink` resolves an external href against `document.baseURI`, so a `<base>` element is honoured. On a native `app://` base, an authority-less URL such as `https:example.com` opens as written instead of under `https://localhost`. A network path that names no host (`//`, `//:80/x`) stays in-app instead of throwing on click.
