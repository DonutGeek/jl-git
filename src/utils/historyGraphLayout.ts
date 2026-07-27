/**
 * 历史提交铁路图 lane 布局（newest-first / topo 序）。
 * 算法思路对齐常见 Git GUI：每列追踪「接下来要落到的提交」，主父继承本列，次父占新列。
 * 不分配颜色：渲染侧统一用主题色。
 */

export interface HistoryGraphInput {
  hash: string;
  /** 仅应包含当前已加载列表中的 parent */
  parents: string[];
}

/** 筛选可见行时用于改写 parent 的最小提交信息 */
export interface HistoryGraphCommitRef {
  id: string;
  parentIds: string[];
}

/**
 * 客户端筛选后：把「不可见 parent」改写为已加载拓扑中最近的可见祖先，
 * 避免图谱变成一堆断开的孤点，并与可见行一一对齐。
 */
export function rewriteParentsForVisibleCommits(
  visible: HistoryGraphCommitRef[],
  topology: HistoryGraphCommitRef[],
): HistoryGraphInput[] {
  const visibleIndex = new Map(visible.map((commit, index) => [commit.id, index]));
  const byId = new Map(topology.map((commit) => [commit.id, commit]));

  function resolveParent(parentId: string, rowIndex: number, selfId: string): string | null {
    const stack = [parentId];
    const seen = new Set<string>();

    while (stack.length > 0) {
      const id = stack.pop();
      if (!id || seen.has(id) || id === selfId) {
        continue;
      }
      seen.add(id);

      const index = visibleIndex.get(id);
      // newest-first：可见祖先必须在更下方（更大行号）
      if (index !== undefined && index > rowIndex) {
        return id;
      }

      const node = byId.get(id);
      if (!node) {
        continue;
      }
      for (let i = node.parentIds.length - 1; i >= 0; i -= 1) {
        const next = node.parentIds[i];
        if (next) {
          stack.push(next);
        }
      }
    }

    return null;
  }

  return visible.map((commit, rowIndex) => {
    const parents: string[] = [];
    const seen = new Set<string>();

    for (const parentId of commit.parentIds) {
      const resolved = resolveParent(parentId, rowIndex, commit.id);
      if (!resolved || seen.has(resolved)) {
        continue;
      }
      seen.add(resolved);
      parents.push(resolved);
    }

    return { hash: commit.id, parents };
  });
}

export interface HistoryGraphLink {
  fromCol: number;
  toCol: number;
}

export interface HistoryGraphRow {
  col: number;
  topLinks: HistoryGraphLink[];
  bottomLinks: HistoryGraphLink[];
}

export interface HistoryGraphLayout {
  rows: HistoryGraphRow[];
  columns: number;
}

export function computeHistoryGraphLayout(commits: HistoryGraphInput[]): HistoryGraphLayout {
  const lanes: (string | null)[] = [];

  function firstFree(): number {
    const index = lanes.indexOf(null);
    return index === -1 ? lanes.length : index;
  }

  const rows: HistoryGraphRow[] = [];

  for (const commit of commits) {
    const { hash, parents } = commit;

    const incoming: { col: number; hash: string }[] = [];
    for (let col = 0; col < lanes.length; col += 1) {
      const laneHash = lanes[col];
      if (laneHash) {
        incoming.push({ col, hash: laneHash });
      }
    }

    let col = lanes.findIndex((laneHash) => laneHash === hash);
    if (col === -1) {
      col = firstFree();
    }

    for (let k = 0; k < lanes.length; k += 1) {
      if (lanes[k] === hash) {
        lanes[k] = null;
      }
    }
    lanes[col] = null;

    const parentCols: number[] = [];
    parents.forEach((parent, index) => {
      if (index === 0) {
        lanes[col] = parent;
        parentCols.push(col);
        return;
      }
      let parentCol = lanes.findIndex((laneHash) => laneHash === parent);
      if (parentCol === -1) {
        parentCol = firstFree();
        lanes[parentCol] = parent;
      }
      parentCols.push(parentCol);
    });

    if (parents.length === 0) {
      lanes[col] = null;
    }

    while (lanes.length > 0 && lanes[lanes.length - 1] == null) {
      lanes.pop();
    }

    const topLinks: HistoryGraphLink[] = incoming.map((lane) => ({
      fromCol: lane.col,
      toCol: lane.hash === hash ? col : lane.col,
    }));

    const bottomLinks: HistoryGraphLink[] = [];
    for (const lane of incoming) {
      if (lane.hash !== hash) {
        bottomLinks.push({ fromCol: lane.col, toCol: lane.col });
      }
    }
    for (const parentCol of parentCols) {
      bottomLinks.push({ fromCol: col, toCol: parentCol });
    }

    rows.push({ col, topLinks, bottomLinks });
  }

  let columns = 0;
  for (const row of rows) {
    columns = Math.max(columns, row.col + 1);
    for (const link of row.topLinks) {
      columns = Math.max(columns, link.fromCol + 1, link.toCol + 1);
    }
    for (const link of row.bottomLinks) {
      columns = Math.max(columns, link.fromCol + 1, link.toCol + 1);
    }
  }

  return { rows, columns: Math.max(columns, 1) };
}
