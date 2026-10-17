import "../../test/registerDom";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mount, setTestEnv } from "../testHelpers.fixture";

let SsrLink: typeof import("./Anchor").SsrLink;
let CsrLink: typeof import("./Anchor").CsrLink;
let Link: typeof import("./index").Link;
let router: typeof import("akanjs/client").router;

const pushes: string[] = [];
const opens: Array<[string, string | undefined, string | undefined]> = [];
let originalOpen: typeof window.open;
const fakeRouter = {
  push: (href: string) => {
    pushes.push(href);
  },
  replace: (href: string) => {
    pushes.push(`replace ${href}`);
  },
  back: () => undefined,
  refresh: () => undefined,
};
const externalHrefs = [
  "HTTPS://example.com/x",
  "//example.com/x",
  "MAILTO:a@b.co",
  "sms:+82101234",
  "kakaotalk://open",
];

const click = (anchor: HTMLAnchorElement | null) => {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
  anchor?.dispatchEvent(event);
  return event;
};

beforeAll(async () => {
  setTestEnv("linktest");
  const { registerClientRuntime } = await import("akanjs/client");
  registerClientRuntime({ usePage: () => ({ path: "/", lang: "en", l: (key: string) => key }) } as never);
  ({ router } = await import("akanjs/client"));
  ({ SsrLink, CsrLink } = await import("./Anchor"));
  ({ Link } = await import("./index"));
  globalThis.__AKAN_RSC_NAVIGATE__ = () => Promise.resolve();
  router.init({ type: "ssr", side: "client", lang: "en", router: fakeRouter });
});

afterAll(() => {
  globalThis.__AKAN_RSC_NAVIGATE__ = undefined;
});

describe("SsrLink", () => {
  test("keeps the caller's anchor props on a #hash href", () => {
    const onClick = mock(() => undefined);
    const { container, unmount } = mount(
      <SsrLink href="#usage" target="_self" aria-label="Usage" onClick={onClick}>
        Usage
      </SsrLink>,
    );
    const anchor = container.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe("#usage");
    expect(anchor?.getAttribute("target")).toBe("_self");
    expect(anchor?.getAttribute("aria-label")).toBe("Usage");
    anchor?.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    unmount();
  });

  for (const href of externalHrefs) {
    test(`renders ${JSON.stringify(href)} unchanged and leaves the click to the browser`, () => {
      pushes.length = 0;
      const { container, unmount } = mount(<SsrLink href={href}>{href}</SsrLink>);
      const anchor = container.querySelector("a");
      expect(anchor?.getAttribute("href")).toBe(href);
      const event = click(anchor);
      expect(event.defaultPrevented).toBe(false);
      expect(pushes).toEqual([]);
      unmount();
    });
  }

  test("renders an in-app path under /<lang> and intercepts the click", () => {
    pushes.length = 0;
    const { container, unmount } = mount(<SsrLink href="/faq">faq</SsrLink>);
    const anchor = container.querySelector("a");
    expect(anchor?.getAttribute("href")?.startsWith("/en")).toBe(true);
    const event = click(anchor);
    expect(event.defaultPrevented).toBe(true);
    expect(pushes).toEqual(["/en/faq"]);
    unmount();
  });

  for (const href of ["javascript:alert(1)", "data:text/html,hi"]) {
    test(`renders ${JSON.stringify(href)} as an inert in-app path`, () => {
      const { container, unmount } = mount(<SsrLink href={href}>{href}</SsrLink>);
      expect(container.querySelector("a")?.getAttribute("href")?.startsWith("/en")).toBe(true);
      unmount();
    });
  }
});

describe("CsrLink", () => {
  beforeAll(() => {
    router.init({ type: "csr", lang: "en", router: fakeRouter });
    originalOpen = window.open;
    window.open = (url, target, features) => {
      opens.push([String(url), target, features]);
      return null;
    };
  });
  afterAll(() => {
    window.open = originalOpen;
  });

  for (const href of ["HTTPS://example.com/x", "//example.com/x"]) {
    test(`opens ${JSON.stringify(href)} through window.open, not the router`, () => {
      opens.length = 0;
      pushes.length = 0;
      const { container, unmount } = mount(<CsrLink href={href}>{href}</CsrLink>);
      click(container.querySelector("a"));
      expect(opens).toEqual([[href, "_blank", "noopener,noreferrer"]]);
      expect(pushes).toEqual([]);
      unmount();
    });
  }

  test("routes a script href in-app instead of opening it", () => {
    opens.length = 0;
    pushes.length = 0;
    const { container, unmount } = mount(
      // biome-ignore lint/security/noScriptUrl: the assertions prove this href is never opened as a URL
      <CsrLink href="javascript:alert(1)">script</CsrLink>,
    );
    click(container.querySelector("a"));
    expect(opens).toEqual([]);
    expect(pushes).toEqual(["/enjavascript:alert(1)"]);
    unmount();
  });

  test("routes an in-app path through the router", () => {
    opens.length = 0;
    pushes.length = 0;
    const { container, unmount } = mount(<CsrLink href="/faq">faq</CsrLink>);
    click(container.querySelector("a"));
    expect(pushes).toEqual(["/en/faq"]);
    expect(opens).toEqual([]);
    unmount();
  });
});

describe("Link", () => {
  test("a disabled link renders a div that keeps the caller's attributes and none of the link-only props", () => {
    const originalError = console.error;
    const errors = mock(() => undefined);
    console.error = errors;
    try {
      const { container, unmount } = mount(
        <Link
          disabled
          href="/docs"
          className="c"
          aria-label="Docs"
          scrollToTop
          replace
          activeClassName="a"
          activeExact
          noCache
        >
          Docs
        </Link>,
      );
      const div = container.querySelector("div");
      expect(div?.getAttributeNames().sort()).toEqual(["aria-label", "class"]);
      expect(errors).not.toHaveBeenCalled();
      unmount();
    } finally {
      console.error = originalError;
    }
  });
});
