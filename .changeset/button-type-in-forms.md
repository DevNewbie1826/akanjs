---
"akanjs": patch
---

Raw `<button>` elements inside `akanjs/ui` components declare `type="button"`, as `Button` already does, so they no longer submit an app's enclosing `<form>`. Clicking the `Input.Password` / `Field.Password` show/hide toggle, a `Field` list's add or remove button, a `ToggleSelect` option, a copy button or a `Model` trigger inside a form now runs only its own action.
