import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { act } from "react";
import { mount, setTestEnv } from "../testHelpers.fixture";

let List: typeof import("./Collection").List;
let ToggleSelect: typeof import("../ToggleSelect").ToggleSelect;

beforeAll(async () => {
  setTestEnv("collectiontest");
  const { registerClientRuntime } = await import("akanjs/client");
  registerClientRuntime({ usePage: () => ({ path: "/", lang: "en", l: (key: string) => key }) } as never);
  ({ List } = await import("./Collection"));
  ({ ToggleSelect } = await import("../ToggleSelect"));
});

const inForm = (onSubmit: () => void, children: React.ReactNode) => (
  <form
    onSubmit={(event) => {
      event.preventDefault();
      onSubmit();
    }}
  >
    {children}
  </form>
);

describe("buttons inside a form", () => {
  test("a list's add and remove buttons run their action without submitting", () => {
    let submits = 0;
    const added: number[] = [];
    const changed: string[][] = [];
    const { container, unmount } = mount(
      inForm(
        () => {
          submits += 1;
        },
        <List
          value={["a", "b"]}
          onAdd={() => added.push(1)}
          onChange={(next) => changed.push(next)}
          renderItem={(item) => <span>{item}</span>}
        />,
      ),
    );
    const buttons = [...container.querySelectorAll("button")];
    act(() => buttons[0]?.click());
    act(() => buttons.at(-1)?.click());
    expect(changed).toEqual([["b"]]);
    expect(added).toEqual([1]);
    expect(submits).toBe(0);
    unmount();
  });

  test("a toggle-select option changes the value without submitting", () => {
    let submits = 0;
    const picked: string[] = [];
    const { container, unmount } = mount(
      inForm(
        () => {
          submits += 1;
        },
        <ToggleSelect
          items={["one", "two"]}
          value="one"
          nullable={false}
          validate={() => true}
          onChange={(value) => picked.push(value)}
        />,
      ),
    );
    const options = [...container.querySelectorAll("button")];
    act(() => options[1]?.click());
    expect(picked).toEqual(["two"]);
    expect(submits).toBe(0);
    unmount();
  });
});
