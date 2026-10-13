// RNTL registers its matchers (toHaveTextContent, toBeDisabled, ...) on the
// global `expect` when it loads, but types them only for Jest. Vitest 5 reads
// its own `Matchers` interface, not `jest.Matchers`.
import type { JestNativeMatchers } from "@testing-library/react-native/dist/matchers/types";

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> extends JestNativeMatchers<R> {}
}
