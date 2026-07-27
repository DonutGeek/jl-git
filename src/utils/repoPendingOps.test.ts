import { afterEach, describe, expect, it } from "vitest";

import {
  beginRepoPendingOp,
  clearRepoPendingOpsForTest,
  endRepoPendingOp,
  hasRepoPendingOp,
} from "./repoPendingOps";

describe("repoPendingOps", () => {
  afterEach(() => {
    clearRepoPendingOpsForTest();
  });

  it("begin 后该仓为 pending，其它仓不受影响", () => {
    beginRepoPendingOp("/repo/a");
    expect(hasRepoPendingOp("/repo/a")).toBe(true);
    expect(hasRepoPendingOp("/repo/b")).toBe(false);
  });

  it("同一仓多次 begin 需对应次数 end 才清零", () => {
    beginRepoPendingOp("/repo/a");
    beginRepoPendingOp("/repo/a");
    endRepoPendingOp("/repo/a");
    expect(hasRepoPendingOp("/repo/a")).toBe(true);
    endRepoPendingOp("/repo/a");
    expect(hasRepoPendingOp("/repo/a")).toBe(false);
  });

  it("多余 end 不会变成负数 pending", () => {
    endRepoPendingOp("/repo/a");
    expect(hasRepoPendingOp("/repo/a")).toBe(false);
    beginRepoPendingOp("/repo/a");
    endRepoPendingOp("/repo/a");
    endRepoPendingOp("/repo/a");
    expect(hasRepoPendingOp("/repo/a")).toBe(false);
  });

  it("模拟切仓：A 操作未完成时 B 结束不影响 A", () => {
    beginRepoPendingOp("/repo/a");
    beginRepoPendingOp("/repo/b");
    endRepoPendingOp("/repo/b");
    expect(hasRepoPendingOp("/repo/a")).toBe(true);
    expect(hasRepoPendingOp("/repo/b")).toBe(false);
  });
});
