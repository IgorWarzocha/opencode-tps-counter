export type TpsInput = {
  outputTokens: number
  createdAt: number
  completedAt?: number
  firstTokenAt?: number
  lastTokenAt?: number
  toolExecutionMs?: number
}

export function calculateTPS(input: TpsInput) {
  if (input.outputTokens <= 0) return null

  const completedAt = typeof input.lastTokenAt === "number" ? input.lastTokenAt : input.completedAt
  if (typeof completedAt !== "number") return null

  const durationMs = completedAt - input.createdAt
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null

  const toolExecutionMs = Math.max(0, input.toolExecutionMs ?? 0)
  const effectiveDurationMs = durationMs - toolExecutionMs
  if (effectiveDurationMs <= 0) return null

  const tps = input.outputTokens / (effectiveDurationMs / 1000)
  const timeToFirstTokenMs =
    typeof input.firstTokenAt === "number" ? Math.max(0, input.firstTokenAt - input.createdAt) : null

  return {
    tps: Number(tps.toFixed(2)),
    timeToFirstTokenMs,
  }
}
