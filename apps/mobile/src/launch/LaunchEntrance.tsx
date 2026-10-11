import type { PropsWithChildren } from "react";

export function LaunchEntrance({ children }: PropsWithChildren<{ ready: boolean }>) {
  return children;
}
