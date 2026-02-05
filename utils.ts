type TpsInput = {
  outputTokens: number
  createdAt: number
  firstTokenAt?: number
  lastTokenAt?: number
}

export function calculateTPS(input: TpsInput) {
  if (input.outputTokens <= 0) return null

  if (typeof input.firstTokenAt !== "number" || typeof input.lastTokenAt !== "number") return null

  const durationMs = input.lastTokenAt - input.createdAt
  if (durationMs <= 0) return null

  const tps = input.outputTokens / (durationMs / 1000)
  const timeToFirstTokenMs = Math.max(0, input.firstTokenAt - input.createdAt)

  return {
    tps: Number(tps.toFixed(2)),
    timeToFirstTokenMs,
  }
}
