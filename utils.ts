import type { Message, AssistantMessage, Part } from "@opencode-ai/sdk"

export function calculateTPS(
  messages: { info: Message; parts: Part[] }[], 
  timings: Map<string, { start?: number; end?: number }>
) {
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
    
    const t = timings.get(msg.info.id)
    if (t?.start && t.end) {
      // Beginning of the message stream to the final stream
      const duration = t.end - t.start
      totalTimeMs += duration
    }
  }

  // Ensure we have a valid non-zero duration to avoid division by zero
  if (totalTimeMs <= 0 || totalTokens === 0) return null

  const tps = totalTokens / (totalTimeMs / 1000)
  return Number(tps.toFixed(2))
}
