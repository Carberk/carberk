import { createRequire, Module } from "node:module";

import { describe, expect, it, vi } from "vitest";
import { TabRouter } from "@react-navigation/routers";
import type * as ExpoRouting from "expo-router/build/global-state/routing";

/** Load Expo's actual CommonJS action builder with native/store boundaries stubbed. */
function expoRouting(rootState: unknown, dispatch: ReturnType<typeof vi.fn>) {
  const require = createRequire(import.meta.url);
  const ref = { current: { getRootState: () => rootState, dispatch } };
  const store = {
    navigationRef: { ...ref, isReady: () => true },
    getRouteInfo: () => ({ segments: [], params: {} }),
    redirects: [],
    linking: {
      config: {},
      getStateFromPath: () => ({ routes: [{ name: "__root", state: { routes: [{ name: "(tabs)", state: { routes: [{ name: "chat" }] } }] } }] }),
    },
  };
  const stubs = {
    "expo/dom": {},
    "expo-linking": {},
    "expo-router/build/domComponents/emitDomEvent": { emitDomLinkEvent: () => false },
    "expo-router/build/global-state/router-store": { store },
  };
  const routingPath = require.resolve("expo-router/build/global-state/routing");
  const saved = new Map<string, NodeModule | undefined>();
  saved.set(routingPath, require.cache[routingPath]);
  Reflect.deleteProperty(require.cache, routingPath);
  for (const [name, exports] of Object.entries(stubs)) {
    const path = require.resolve(name);
    saved.set(path, require.cache[path]);
    const module = new Module(path);
    module.exports = exports;
    module.loaded = true;
    require.cache[path] = module;
  }
  try {
    const routing: typeof ExpoRouting = require(routingPath);
    return { routing, flush: () => routing.routingQueue.run(ref as unknown as Parameters<typeof routing.routingQueue.run>[0]) };
  } finally {
    for (const [path, module] of saved) {
      if (module) require.cache[path] = module;
      else Reflect.deleteProperty(require.cache, path);
    }
  }
}

describe("Expo's action target from a bare Favorites tab", () => {
  it("targets tabs with NAVIGATE, which selects Messages; POP_TO is unhandled", () => {
    const tabs = TabRouter({ initialRouteName: "favorites" });
    const options = { routeNames: ["favorites", "chat"], routeParamList: {}, routeGetIdList: {} };
    const tabState = tabs.getInitialState(options);
    const appState = { type: "stack", key: "app", index: 0, routes: [{ name: "(tabs)", state: tabState }] };
    const rootState = { type: "stack", key: "outer", index: 0, routes: [{ name: "__root", state: appState }] };
    const dispatch = vi.fn();
    const { routing, flush } = expoRouting(rootState, dispatch);
    routing.dismissTo("/(tabs)/chat");
    flush();
    const popTo = dispatch.mock.calls[0]?.[0];
    expect(popTo).toMatchObject({ type: "POP_TO", target: tabState.key, payload: { name: "chat" } });
    expect(tabs.getStateForAction(tabState, popTo, options)).toBeNull();

    routing.navigate("/(tabs)/chat");
    flush();
    const navigate = dispatch.mock.calls[1]?.[0];
    expect(navigate).toMatchObject({ type: "NAVIGATE", target: tabState.key, payload: { name: "chat" } });
    const selected = tabs.getStateForAction(tabState, navigate, options);
    expect(selected?.routes[selected.index ?? 0]?.name).toBe("chat");
  });
});
