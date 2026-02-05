type TpsInput = {
  outputTokens: number
  createdAt: number
  completedAt: number
  firstTokenAt?: number
}

export function calculateTPS(input: TpsInput) {
  if (input.outputTokens <= 0) return null

  const durationMs = input.completedAt - input.createdAt
  if (durationMs <= 0) return null

  const tps = input.outputTokens / (durationMs / 1000)
  const timeToFirstTokenMs =
    typeof input.firstTokenAt === "number" ? Math.max(0, input.firstTokenAt - input.createdAt) : null

  return {
    tps: Number(tps.toFixed(2)),
    timeToFirstTokenMs,
  }
}
