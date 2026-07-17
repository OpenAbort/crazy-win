export type SplitDirection = "row" | "column";

export type PaneNode =
  | { type: "leaf"; sessionId: number }
  | { type: "split"; direction: SplitDirection; ratio: number; a: PaneNode; b: PaneNode };

export function leaf(sessionId: number): PaneNode {
  return { type: "leaf", sessionId };
}

export function findFirstSessionId(node: PaneNode): number {
  return node.type === "leaf" ? node.sessionId : findFirstSessionId(node.a);
}

export function collectSessionIds(node: PaneNode): number[] {
  return node.type === "leaf" ? [node.sessionId] : [...collectSessionIds(node.a), ...collectSessionIds(node.b)];
}

/// Replaces the leaf matching `targetSessionId` with a split containing that
/// leaf and a new leaf for `newSessionId`. Returns the same tree unchanged if
/// `targetSessionId` isn't found (shouldn't happen in practice).
export function splitPane(
  node: PaneNode,
  targetSessionId: number,
  direction: SplitDirection,
  newSessionId: number,
): PaneNode {
  if (node.type === "leaf") {
    if (node.sessionId !== targetSessionId) return node;
    return { type: "split", direction, ratio: 0.5, a: node, b: leaf(newSessionId) };
  }
  return { ...node, a: splitPane(node.a, targetSessionId, direction, newSessionId), b: splitPane(node.b, targetSessionId, direction, newSessionId) };
}

/// Removes the leaf matching `targetSessionId`. When its parent is a split,
/// the split collapses into the sibling subtree. Returns `null` when
/// `targetSessionId` is the tree's only leaf (caller should close the whole
/// tab in that case) instead of returning a tree with no panes.
export function closePane(node: PaneNode, targetSessionId: number): PaneNode | null {
  if (node.type === "leaf") {
    return node.sessionId === targetSessionId ? null : node;
  }
  const aHasTarget = collectSessionIds(node.a).includes(targetSessionId);
  if (aHasTarget) {
    const nextA = closePane(node.a, targetSessionId);
    return nextA === null ? node.b : { ...node, a: nextA };
  }
  const nextB = closePane(node.b, targetSessionId);
  return nextB === null ? node.a : { ...node, b: nextB };
}

export function setRatio(node: PaneNode, targetSplitFirstSessionId: number, ratio: number): PaneNode {
  if (node.type === "leaf") return node;
  if (findFirstSessionId(node) === targetSplitFirstSessionId) {
    return { ...node, ratio: Math.min(0.9, Math.max(0.1, ratio)) };
  }
  return { ...node, a: setRatio(node.a, targetSplitFirstSessionId, ratio), b: setRatio(node.b, targetSplitFirstSessionId, ratio) };
}
