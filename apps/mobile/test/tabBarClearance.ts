import { StyleSheet } from "react-native";

import { tabBarSpace } from "../components/navigation/tabBarHeight";

/** Clearance tests for tab screens whose content runs under the floating glass tab bar. */

interface Node {
  parent: Node | null;
  props: Record<string, unknown>;
  findAll: (match: (node: Node) => boolean) => Node[];
}

const paddingBottomOf = (node: Node) =>
  (StyleSheet.flatten(node.props.style as never) as { paddingBottom?: number } | undefined)?.paddingBottom;

/** The space a tab screen keeps under its content, with no bottom inset (the specs' safe area). */
export const TAB_BAR_SPACE = tabBarSpace(0);

/** The TabScreen root: the safe-area view that keeps the top and side edges. */
export function screenRoot(root: Node): Node {
  const found = root.findAll((node) => Array.isArray(node.props.edges))[0];
  if (!found) throw new Error("No TabScreen root in the tree");
  return found;
}

/** The bottom padding of the TabScreen root; 0 when the content runs under the bar. */
export function rootPaddingBottom(root: Node): number {
  return paddingBottomOf(screenRoot(root)) ?? 0;
}

/** The bottom padding of a scrolling list's content. */
export function listContentPaddingBottom(list: Node): number | undefined {
  return (StyleSheet.flatten(list.props.contentContainerStyle as never) as { paddingBottom?: number } | undefined)
    ?.paddingBottom;
}

/** True when `node` sits inside a view that keeps the tab bar's space below it. */
export function clearsTabBar(node: Node): boolean {
  for (let current: Node | null = node; current; current = current.parent) {
    if (paddingBottomOf(current) === TAB_BAR_SPACE) return true;
  }
  return false;
}
