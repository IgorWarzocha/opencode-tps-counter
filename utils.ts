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

  let totalTokens = 0
  let totalTimeMs = 0

  for (const msg of assistant) {
    totalTokens += (msg.info.tokens?.output ?? 0) + (msg.info.tokens?.reasoning ?? 0)
  }

  const startedAt = Math.min(
    ...assistant
      .map(msg => msg.info.time.created)
      .filter((time): time is number => typeof time === "number")
  )

  const completedAt = Math.max(
    ...assistant
      .map(msg => msg.info.time.completed)
      .filter((time): time is number => typeof time === "number")
  )

  if (Number.isFinite(startedAt) && Number.isFinite(completedAt)) {
    totalTimeMs = completedAt - startedAt
  } else {
    const streamingParts = assistant.flatMap(msg => msg.parts.filter(isStreamingPart))
    if (streamingParts.length === 0) return null
    for (const part of streamingParts) {
      totalTimeMs += part.time!.end! - part.time!.start!
    }
  }

  // Ensure we have a valid non-zero duration to avoid division by zero
  if (totalTimeMs <= 0 || totalTokens === 0) return null

  const tps = totalTokens / (totalTimeMs / 1000)
  return Number(tps.toFixed(2))
}
