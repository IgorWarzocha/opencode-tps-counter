type TpsInput = {
  outputTokens: number
  createdAt: number
  completedAt?: number
  firstTokenAt?: number
  lastTokenAt?: number
}

export function calculateTPS(input: TpsInput) {
  if (input.outputTokens <= 0) return null

  const hasPartTiming = typeof input.firstTokenAt === "number" && typeof input.lastTokenAt === "number"
  const durationMs = hasPartTiming
    ? input.lastTokenAt! - input.createdAt
    : typeof input.completedAt === "number"
      ? input.completedAt - input.createdAt
      : NaN

  if (!Number.isFinite(durationMs) || durationMs <= 0) return null

  const tps = input.outputTokens / (durationMs / 1000)
  const timeToFirstTokenMs = hasPartTiming ? Math.max(0, input.firstTokenAt! - input.createdAt) : null

  return {
    tps: Number(tps.toFixed(2)),
    timeToFirstTokenMs,
  }
}
