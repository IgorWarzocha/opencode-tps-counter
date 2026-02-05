import type { Message, AssistantMessage, Part, TextPart, ReasoningPart } from "@opencode-ai/sdk"

function isStreamingPart(part: Part): part is TextPart | ReasoningPart {
  if (part.type !== "text" && part.type !== "reasoning") return false
  return Boolean(part.time?.start && part.time.end)
}

export function calculateTPS(messages: { info: Message; parts: Part[] }[]) {
  const reversedIndex = [...messages].reverse().findIndex(m => m.info.role === "user")
  if (reversedIndex === -1) return null

  const turn = messages.slice(messages.length - 1 - reversedIndex)
  const assistant = turn.filter(m => 
    m.info.role === "assistant" && 
    !m.parts.some(p => p.type === "text" && p.text.includes("▣ TPS |"))
  ) as { info: AssistantMessage; parts: Part[] }[]

  if (!assistant.length) return null

  const latestAssistant = assistant[assistant.length - 1]
  if (!latestAssistant) return null

  let totalTokens = 0
  let totalTimeMs = 0

  totalTokens = latestAssistant.info.tokens?.output ?? 0

  const streamingParts = latestAssistant.parts.filter(isStreamingPart)
  if (streamingParts.length === 0) return null

  const firstTokenAt = Math.min(...streamingParts.map(part => part.time!.start!))
  const lastTokenAt = Math.max(...streamingParts.map(part => part.time!.end!))
  const completedAt = latestAssistant.info.time.completed
  totalTimeMs = Math.max(
    0,
    typeof completedAt === "number" ? completedAt - firstTokenAt : lastTokenAt - firstTokenAt
  )

  const createdAt = latestAssistant.info.time.created
  const timeToFirstTokenMs = typeof createdAt === "number" ? Math.max(0, firstTokenAt - createdAt) : null

  // Ensure we have a valid non-zero duration to avoid division by zero
  if (totalTimeMs <= 0 || totalTokens === 0) return null

  const tps = totalTokens / (totalTimeMs / 1000)
  return {
    tps: Number(tps.toFixed(2)),
    timeToFirstTokenMs,
  }
}
