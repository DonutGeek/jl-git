import { describe, expect, it } from "vitest";

import { isPushRejectedError } from "@/utils/gitPushError";

describe("isPushRejectedError", () => {
  it("识别 fetch first / non-fast-forward 拒绝推送", () => {
    expect(
      isPushRejectedError({
        code: "GIT_FAILED",
        message: "! [rejected] gray -> gray (fetch first)",
        details:
          "error: failed to push some refs\nhint: Updates were rejected because the remote contains work that you do not",
      }),
    ).toBe(true);

    expect(
      isPushRejectedError({
        code: "GIT_FAILED",
        message: "non-fast-forward",
      }),
    ).toBe(true);
  });

  it("不误判普通 Git 失败", () => {
    expect(
      isPushRejectedError({
        code: "GIT_FAILED",
        message: "Permission denied (publickey)",
      }),
    ).toBe(false);

    expect(isPushRejectedError(new Error("network timeout"))).toBe(false);
  });
});
