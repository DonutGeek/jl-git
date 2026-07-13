/**
 * 回归：Zustand selector 不得在每次调用时返回新引用（尤其是 ?? []）。
 * 模拟 React useSyncExternalStore 的 checkIfSnapshotChanged：
 * 若连续两次 getSnapshot() 引用不等，会 forceStoreRerender → Maximum update depth。
 */
import assert from "node:assert/strict";

function simulateReactSnapshotLoop(getSnapshot, max = 50) {
  let prev = getSnapshot();
  for (let i = 0; i < max; i += 1) {
    const next = getSnapshot();
    if (!Object.is(prev, next)) {
      // React 会强制再渲染；此处计为一次「环」
      prev = next;
      continue;
    }
    return { looped: false, iterations: i };
  }
  return { looped: true, iterations: max };
}

const EMPTY = [];

const bad = simulateReactSnapshotLoop(() => null?.entries ?? []);
assert.equal(bad.looped, true, "坏 selector 应形成无限环");

const good = simulateReactSnapshotLoop(() => null?.entries ?? EMPTY);
assert.equal(good.looped, false, "稳定空数组不应成环");

console.log("ok: bad loops, good stable");
