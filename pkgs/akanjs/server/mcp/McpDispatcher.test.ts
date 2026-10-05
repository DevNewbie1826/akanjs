import { describe, expect, spyOn, test } from "bun:test";
import { type BackendEnv, ENDPOINT_META } from "akanjs/base";
import { adapt, getDefaultInjectRegistry, getDefaultLiveRegistry } from "akanjs/service";
import type { Endpoint, EndpointCls } from "../../signal/endpoint";
import { buildEndpoint, type EndpointInfo } from "../../signal/endpointInfo";
import type { Guard } from "../../signal/guard";
import { middleware } from "../../signal/middleware";
import { SignalContext } from "../../signal/signalContext";
import { McpDispatcher } from "./McpDispatcher";
import { McpExecutionContext } from "./McpExecutionContext";

class AdminStamp extends middleware("adminStamp") {
  override async use() {
    return async (context: SignalContext, next: () => Promise<unknown>) => {
      const req = context.getHttpContext().req;
      Object.assign(req, {
        account: req.headers.get("authorization") === "Bearer admin-token" ? { id: "admin-1", roles: ["admin"] } : null,
      });
      return await next();
    };
  }
}

class AdminOnly implements Guard {
  static scope = "account" as const;
  canPass(context: SignalContext) {
    return context.get<{ roles: string[] }>("account")?.roles.includes("admin") ?? false;
  }
}

const adminEndpoint = buildEndpoint
  .query(String, { guards: [AdminOnly], middlewares: [AdminStamp] })
  .exec(() => "admin-ok");

const makeDispatcher = (endpointInfo: EndpointInfo = adminEndpoint) => {
  class TestEndpoint extends adapt("mcpDispatcherTest", () => ({})) {
    static [ENDPOINT_META] = { adminTool: endpointInfo };
  }
  const endpoint = new TestEndpoint();
  const registry = getDefaultInjectRegistry();
  registry.endpoint.set(TestEndpoint as unknown as EndpointCls, endpoint as unknown as Endpoint);
  const props = { registry, env: {} as BackendEnv, live: getDefaultLiveRegistry(), middleware: new Map() };
  return { dispatcher: new McpDispatcher(props), endpoint, props };
};

const makeIsolationDispatcher = (stamp: EndpointInfo, victim: EndpointInfo) => {
  class IsolationEndpoint extends adapt("isolationEndpoint", () => ({})) {
    static [ENDPOINT_META] = { stampTool: stamp, victimTool: victim };
  }
  const { props } = makeDispatcher();
  props.registry.endpoint.clear();
  props.registry.endpoint.set(
    IsolationEndpoint as unknown as EndpointCls,
    new IsolationEndpoint() as unknown as Endpoint,
  );
  return new McpDispatcher(props);
};

describe("McpDispatcher account listing", () => {
  test("lists remaining items without evaluating them when a non-configurable stamp cannot be removed", async () => {
    let guardCalls = 0;
    class CountedAdmin implements Guard {
      static scope = "account" as const;
      canPass(context: SignalContext) {
        guardCalls++;
        return context.get<{ roles: string[] }>("account")?.roles.includes("admin") ?? false;
      }
    }
    class FixedStamp extends middleware("fixedStamp") {
      override async use() {
        return async (context: SignalContext, next: () => Promise<unknown>) => {
          Object.defineProperty(context.getHttpContext().req, "account", {
            value: { roles: ["admin"] },
            configurable: false,
          });
          return await next();
        };
      }
    }
    const dispatcher = makeIsolationDispatcher(
      buildEndpoint.query(String, { guards: [CountedAdmin], middlewares: [FixedStamp] }).exec(() => "stamp"),
      buildEndpoint.query(String, { guards: [CountedAdmin] }).exec(() => "victim"),
    );
    const warnings = spyOn(McpDispatcher.logger, "warn").mockImplementation(() => {});
    try {
      const req = new Request("http://localhost/mcp");
      const listed = await dispatcher.filterForAccount(
        [{ name: "victimTool" }, { name: "stampTool" }, { name: "victimTool" }],
        req,
      );

      expect({ listed, guardCalls, warnings: warnings.mock.calls.length }).toEqual({
        listed: [{ name: "stampTool" }, { name: "victimTool" }],
        guardCalls: 2,
        warnings: 1,
      });
      expect(Object.getOwnPropertyDescriptor(req, "account")?.configurable).toBe(false);
      const warning = String(warnings.mock.calls[0]?.[0]);
      expect(warning).toContain(FixedStamp.name);
      expect(warning).toContain("account");
      await dispatcher.filterForAccount(
        [{ name: "stampTool" }, { name: "victimTool" }],
        new Request("http://localhost/mcp"),
      );
      expect(guardCalls).toBe(3);
      expect(warnings).toHaveBeenCalledTimes(1);
    } finally {
      warnings.mockRestore();
    }
  });

  test("restores an overwritten pre-existing principal before evaluating the next item", async () => {
    const dispatcher = makeIsolationDispatcher(
      adminEndpoint,
      buildEndpoint.query(String, { guards: [AdminOnly] }).exec(() => "victim"),
    );
    const req = new Request("http://localhost/mcp", { headers: { authorization: "Bearer admin-token" } });
    const original = { roles: [] };
    Object.assign(req, { account: original });
    const before = Object.getOwnPropertyDescriptor(req, "account");

    const listed = await dispatcher.filterForAccount([{ name: "stampTool" }, { name: "victimTool" }], req);

    expect({ listed, descriptor: Object.getOwnPropertyDescriptor(req, "account") }).toEqual({
      listed: [{ name: "stampTool" }],
      descriptor: before,
    });
    expect(Reflect.get(req, "account")).toBe(original);
  });

  test("removes a symbol principal before evaluating the next item", async () => {
    const account = Symbol.for("account");
    const observed: unknown[] = [];
    class SymbolStamp extends middleware("symbolStamp") {
      override async use() {
        return async (context: SignalContext, next: () => Promise<unknown>) => {
          Reflect.set(context.getHttpContext().req, account, { roles: ["admin"] });
          return await next();
        };
      }
    }
    class SymbolAdmin implements Guard {
      static scope = "account" as const;
      canPass(context: SignalContext) {
        const req = context.getHttpContext().req;
        const principal = Reflect.get(req, account) as { roles: string[] } | undefined;
        observed.push({ normal: context.get("account"), symbol: principal ?? null });
        return principal?.roles.includes("admin") ?? false;
      }
    }
    const dispatcher = makeIsolationDispatcher(
      buildEndpoint.query(String, { guards: [SymbolAdmin], middlewares: [SymbolStamp] }).exec(() => "stamp"),
      buildEndpoint.query(String, { guards: [SymbolAdmin] }).exec(() => "victim"),
    );
    const req = new Request("http://localhost/mcp");

    const listed = await dispatcher.filterForAccount([{ name: "stampTool" }, { name: "victimTool" }], req);

    expect({ listed, observed, hasSymbol: Object.hasOwn(req, account) }).toEqual({
      listed: [{ name: "stampTool" }],
      observed: [
        { normal: null, symbol: { roles: ["admin"] } },
        { normal: null, symbol: null },
      ],
      hasSymbol: false,
    });
  });

  test("removes a non-enumerable principal before evaluating the next item", async () => {
    class HiddenStamp extends middleware("hiddenStamp") {
      override async use() {
        return async (context: SignalContext, next: () => Promise<unknown>) => {
          Object.defineProperty(context.getHttpContext().req, "account", {
            value: { roles: ["admin"] },
            enumerable: false,
            configurable: true,
          });
          return await next();
        };
      }
    }
    const dispatcher = makeIsolationDispatcher(
      buildEndpoint.query(String, { guards: [AdminOnly], middlewares: [HiddenStamp] }).exec(() => "stamp"),
      buildEndpoint.query(String, { guards: [AdminOnly] }).exec(() => "victim"),
    );
    const req = new Request("http://localhost/mcp");

    const listed = await dispatcher.filterForAccount([{ name: "stampTool" }, { name: "victimTool" }], req);

    expect({ listed, hasAccount: Object.hasOwn(req, "account") }).toEqual({
      listed: [{ name: "stampTool" }],
      hasAccount: false,
    });
  });

  test("lists an account-guarded tool for a caller whose credential an endpoint middleware verifies", async () => {
    const { dispatcher } = makeDispatcher();
    const req = new Request("http://localhost/mcp", { headers: { authorization: "Bearer admin-token" } });

    const listed = await dispatcher.filterForAccount([{ name: "adminTool" }], req);

    expect(listed).toEqual([{ name: "adminTool" }]);
  });

  test("hides the same tool when the credential is missing or invalid", async () => {
    const { dispatcher } = makeDispatcher();
    for (const authorization of [undefined, "Bearer invalid-token"]) {
      const req = new Request("http://localhost/mcp", { headers: authorization ? { authorization } : {} });

      const listed = await dispatcher.filterForAccount([{ name: "adminTool" }], req);

      expect(listed).toEqual([]);
    }
  });

  test("keeps a resource-scope-guarded tool listed and unfiltered", async () => {
    let guardCalls = 0;
    class ResourceOnly implements Guard {
      static scope = "resource" as const;
      canPass(context: SignalContext) {
        guardCalls++;
        return context.getArg("resourceId") !== undefined;
      }
    }
    const endpointInfo = buildEndpoint.query(String, { guards: [ResourceOnly] }).exec(() => "resource-ok");
    const { dispatcher } = makeDispatcher(endpointInfo);
    for (const authorization of [undefined, "Bearer invalid-token", "Bearer admin-token"]) {
      const req = new Request("http://localhost/mcp", { headers: authorization ? { authorization } : {} });

      const listed = await dispatcher.filterForAccount([{ name: "adminTool" }], req);

      expect(listed).toEqual([{ name: "adminTool" }]);
    }
    expect(guardCalls).toBe(0);
  });

  test("keeps the direct-call path working", async () => {
    const { endpoint, props } = makeDispatcher();
    const req = new Request("http://localhost/mcp", { headers: { authorization: "Bearer admin-token" } });
    const context = await new SignalContext("adminTool", req as Bun.BunRequest, {
      ...props,
      endpointInfo: adminEndpoint,
      adaptor: endpoint,
      ctx: new McpExecutionContext(req, {}),
      origin: "mcp",
    }).init();

    const result = await context.exec();

    expect(result as unknown).toBe("admin-ok");
  });

  test("scopes shared account-guard verdicts to each endpoint middleware chain", async () => {
    class RedStamp extends middleware("redStamp") {
      override async use() {
        return async (context: SignalContext, next: () => Promise<unknown>) => {
          const req = context.getHttpContext().req;
          Object.assign(req, {
            account: req.headers.get("authorization") === "Bearer red-token" ? { roles: ["admin"] } : null,
          });
          return await next();
        };
      }
    }
    class BlueStamp extends middleware("blueStamp") {
      override async use() {
        return async (context: SignalContext, next: () => Promise<unknown>) => {
          const req = context.getHttpContext().req;
          Object.assign(req, {
            account: req.headers.get("authorization") === "Bearer blue-token" ? { roles: ["admin"] } : null,
          });
          return await next();
        };
      }
    }
    class ColoredEndpoint extends adapt("coloredEndpoint", () => ({})) {
      static [ENDPOINT_META] = {
        redTool: buildEndpoint.query(String, { guards: [AdminOnly], middlewares: [RedStamp] }).exec(() => "red"),
        blueTool: buildEndpoint.query(String, { guards: [AdminOnly], middlewares: [BlueStamp] }).exec(() => "blue"),
      };
    }
    const { props } = makeDispatcher();
    props.registry.endpoint.clear();
    props.registry.endpoint.set(
      ColoredEndpoint as unknown as EndpointCls,
      new ColoredEndpoint() as unknown as Endpoint,
    );
    const dispatcher = new McpDispatcher(props);

    for (const [token, tool] of [
      ["red-token", "redTool"],
      ["blue-token", "blueTool"],
    ]) {
      const req = new Request("http://localhost/mcp", { headers: { authorization: `Bearer ${token}` } });
      const listed = await dispatcher.filterForAccount([{ name: "redTool" }, { name: "blueTool" }], req);

      expect(listed.map(({ name }) => name)).toEqual([tool]);
    }
  });

  test("keeps an argument-dependent middleware tool listed and callable with its argument", async () => {
    class ArgumentWork extends middleware("argumentWork") {
      override async use() {
        return async (context: SignalContext, next: () => Promise<unknown>) => {
          if (context.args.length === 0) throw new Error("Missing call argument");
          return await next();
        };
      }
    }
    const endpointInfo = buildEndpoint
      .query(String, { guards: [AdminOnly], middlewares: [ArgumentWork] })
      .param("value", String)
      .exec((value) => value);
    const { endpoint, props } = makeDispatcher(endpointInfo);
    props.middleware.set("adminStamp", AdminStamp);
    const dispatcher = new McpDispatcher(props);
    const req = new Request("http://localhost/mcp", { headers: { authorization: "Bearer admin-token" } });

    const listed = await dispatcher.filterForAccount([{ name: "adminTool" }], req);
    const context = await new SignalContext("adminTool", req as Bun.BunRequest, {
      ...props,
      endpointInfo,
      adaptor: endpoint,
      ctx: new McpExecutionContext(req, { value: "argument-ok" }),
      origin: "mcp",
    }).init();
    const result = await context.exec();

    expect(result as unknown).toBe("argument-ok");
    expect(listed).toEqual([{ name: "adminTool" }]);
  });

  test("isolates async account-guard evaluations across endpoint middleware chains in either catalogue order", async () => {
    class AsyncAdminOnly implements Guard {
      static scope = "account" as const;
      async canPass(context: SignalContext) {
        await Promise.resolve();
        return context.get<{ roles: string[] }>("account")?.roles.includes("admin") ?? false;
      }
    }
    class RedStamp extends middleware("asyncRedStamp") {
      override async use() {
        return async (context: SignalContext, next: () => Promise<unknown>) => {
          const req = context.getHttpContext().req;
          Object.assign(req, {
            account: req.headers.get("authorization") === "Bearer red-token" ? { roles: ["admin"] } : null,
          });
          return await next();
        };
      }
    }
    class BlueStamp extends middleware("asyncBlueStamp") {
      override async use() {
        return async (context: SignalContext, next: () => Promise<unknown>) => {
          const req = context.getHttpContext().req;
          Object.assign(req, {
            account: req.headers.get("authorization") === "Bearer blue-token" ? { roles: ["admin"] } : null,
          });
          return await next();
        };
      }
    }
    class ColoredEndpoint extends adapt("asyncColoredEndpoint", () => ({})) {
      static [ENDPOINT_META] = {
        aRedTool: buildEndpoint.query(String, { guards: [AsyncAdminOnly], middlewares: [RedStamp] }).exec(() => "red"),
        bBlueTool: buildEndpoint
          .query(String, { guards: [AsyncAdminOnly], middlewares: [BlueStamp] })
          .exec(() => "blue"),
      };
    }
    const { props } = makeDispatcher();
    props.registry.endpoint.clear();
    props.registry.endpoint.set(
      ColoredEndpoint as unknown as EndpointCls,
      new ColoredEndpoint() as unknown as Endpoint,
    );
    const dispatcher = new McpDispatcher(props);
    const listings = await Promise.all(
      [
        [{ name: "aRedTool" }, { name: "bBlueTool" }],
        [{ name: "bBlueTool" }, { name: "aRedTool" }],
      ].flatMap((items) =>
        ["red-token", "blue-token"].map(async (token) => {
          const req = new Request("http://localhost/mcp", { headers: { authorization: `Bearer ${token}` } });
          const listed = await dispatcher.filterForAccount(items, req);
          return listed.map(({ name }) => name);
        }),
      ),
    );

    expect(listings).toEqual([["aRedTool"], ["bBlueTool"], ["aRedTool"], ["bBlueTool"]]);
  });
});
