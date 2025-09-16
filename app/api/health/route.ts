import { NextResponse } from "next/server";
import { getJudgeStateSnapshot, isJudgeReady } from "../../../lib/judgeState";

export async function GET() {
  const uptimeSeconds = Math.round(process.uptime());
  const snapshot = getJudgeStateSnapshot();

  return NextResponse.json(
    {
      status: "ok",
      uptimeSeconds,
      judgeReady: isJudgeReady(),
      lastJudgeSuccessMs: snapshot.lastSuccessMs,
      lastJudgeFailureMs: snapshot.lastFailureMs,
    },
    { status: 200 },
  );
}
