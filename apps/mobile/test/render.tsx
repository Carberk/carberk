import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react-native";
import type { ReactElement, PropsWithChildren } from "react";
import type { TestInstance } from "test-renderer";
import { afterEach } from "vitest";

import { resources } from "../src/i18n/resources";

const clients = new Set<QueryClient>();
afterEach(() => { clients.forEach((client) => client.clear()); clients.clear(); });

/**
 * Renders inside fresh i18n and Query providers. RNTL 14 renders
 * asynchronously, so await the result.
 */
export async function renderMobile(element: ReactElement, { locale = "en" }: { locale?: string } = {}) {
  const i18n = createInstance();
  void i18n.init({ lng: locale, resources, defaultNS: "common", initImmediate: false });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  clients.add(queryClient);
  function Wrapper({ children }: PropsWithChildren) {
    return <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </I18nextProvider>;
  }
  return { ...(await render(element, { wrapper: Wrapper })), queryClient, i18n };
}

export { fireEvent, act, within } from "@testing-library/react-native";
export { routerMock, routeParams, screenFocus, screenOptions } from "./native-setup";

/**
 * Host elements below `root` with the native name the adapter renders, such as
 * "Image", "Modal", "RCTScrollView" or "Icon", whose props include `props`.
 * RNTL 14 removed the UNSAFE_*ByType and UNSAFE_*ByProps queries, and
 * test-renderer keeps only host elements; prefer role, label and text queries.
 */
export function queryAllHosts(root: TestInstance, type: string, props: Record<string, unknown> = {}): TestInstance[] {
  return root.queryAll((node) => node.type === type
    && Object.entries(props).every(([key, value]) => Object.is(node.props[key], value)), { includeSelf: true });
}

/** All matching host elements; throws when there is none. */
export function getAllHosts(root: TestInstance, type: string, props?: Record<string, unknown>): TestInstance[] {
  const hosts = queryAllHosts(root, type, props);
  if (hosts.length === 0) throw new Error(`No <${type}> host element matches ${JSON.stringify(props ?? {})}`);
  return hosts;
}

/** The one matching host element, or null; throws when there are several. */
export function queryHost(root: TestInstance, type: string, props?: Record<string, unknown>): TestInstance | null {
  const hosts = queryAllHosts(root, type, props);
  if (hosts.length > 1) throw new Error(`Found ${hosts.length} <${type}> host elements matching ${JSON.stringify(props ?? {})}`);
  return hosts[0] ?? null;
}

/** The one matching host element; throws when there is none or several. */
export function getHost(root: TestInstance, type: string, props?: Record<string, unknown>): TestInstance {
  const host = queryHost(root, type, props);
  if (!host) throw new Error(`No <${type}> host element matches ${JSON.stringify(props ?? {})}`);
  return host;
}

/** The first of several matches; a query that returned none would already have thrown. */
export const first = <T,>(items: T[]): T => items[0] as T;
