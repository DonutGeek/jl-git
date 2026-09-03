/** 把流式 delta 收成 rAF 批次，避免每 token 都写 Store */
export function createAgentStreamBuffer(flush: (content: string, reasoning: string) => void): {
  onReasoningDelta: (delta: string) => void;
  onDelta: (delta: string) => void;
  finish: () => void;
  settleReasoningDuration: () => void;
  readonly contentBuffer: string;
  readonly reasoningBuffer: string;
  readonly reasoningDurationMs: number | undefined;
} {
  let contentBuffer = "";
  let reasoningBuffer = "";
  let animationFrameId: number | null = null;
  let reasoningStartedAt: number | null = null;
  let reasoningDurationSettled = false;
  let reasoningDurationMs: number | undefined;

  const doFlush = (): void => {
    animationFrameId = null;
    flush(contentBuffer, reasoningBuffer);
  };

  const settleReasoningDuration = (): void => {
    if (reasoningDurationSettled || reasoningStartedAt == null) {
      return;
    }
    reasoningDurationSettled = true;
    reasoningDurationMs = Date.now() - reasoningStartedAt;
  };

  return {
    get contentBuffer() {
      return contentBuffer;
    },
    get reasoningBuffer() {
      return reasoningBuffer;
    },
    get reasoningDurationMs() {
      return reasoningDurationMs;
    },
    settleReasoningDuration,
    onReasoningDelta(delta) {
      if (reasoningStartedAt == null) {
        reasoningStartedAt = Date.now();
      }
      reasoningBuffer += delta;
      if (animationFrameId == null) {
        animationFrameId = window.requestAnimationFrame(doFlush);
      }
    },
    onDelta(delta) {
      settleReasoningDuration();
      contentBuffer += delta;
      if (animationFrameId == null) {
        animationFrameId = window.requestAnimationFrame(doFlush);
      }
    },
    finish() {
      if (animationFrameId != null) {
        window.cancelAnimationFrame(animationFrameId);
        doFlush();
      }
      settleReasoningDuration();
    },
  };
}
