const globalJudgeState = globalThis as unknown as {
  __emojifyJudgeState?: {
    lastSuccessMs: number;
    lastFailureMs: number;
  };
};

if (!globalJudgeState.__emojifyJudgeState) {
  globalJudgeState.__emojifyJudgeState = {
    lastSuccessMs: 0,
    lastFailureMs: 0,
  };
}

const judgeState = globalJudgeState.__emojifyJudgeState;

export function markJudgeSuccess() {
  judgeState.lastSuccessMs = Date.now();
}

export function markJudgeFailure() {
  judgeState.lastFailureMs = Date.now();
}

export function isJudgeReady(maxAgeMs = 60_000) {
  if (judgeState.lastSuccessMs === 0) {
    return false;
  }
  return Date.now() - judgeState.lastSuccessMs <= maxAgeMs;
}

export function getJudgeStateSnapshot() {
  return { ...judgeState };
}
