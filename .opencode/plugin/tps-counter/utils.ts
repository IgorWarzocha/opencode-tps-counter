/**
 * Utility functions for TPS calculation
 */
import type { Message, AssistantMessage, Part } from "@opencode-ai/sdk"

export function calculateTPS(messagesWithParts: { info: Message; parts: Part[] }[]) {
  // Find index of last user message to isolate the current turn
  const reversedIndex = [...messagesWithParts].reverse().findIndex(m => m.info.role === "user")
  if (reversedIndex === -1) return null

  const turnMessages = messagesWithParts.slice(messagesWithParts.length - 1 - reversedIndex)
  const assistantMessages = turnMessages.filter(m => m.info.role === "assistant") as { info: AssistantMessage; parts: Part[] }[]

  if (assistantMessages.length === 0) return null

  let totalTokens = 0
  let totalStreamingTimeMs = 0

  for (const msg of assistantMessages) {
    // Total tokens generated (output + reasoning)
    totalTokens += (msg.info.tokens?.output ?? 0) + (msg.info.tokens?.reasoning ?? 0)
    
    // Sum duration of streaming parts (text and reasoning)
    for (const part of msg.parts) {
      if ((part.type === "text" || part.type === "reasoning") && part.time?.start && part.time?.end) {
        // Detect if duration is in seconds or milliseconds
        // If the timestamp is > 10^11, it's likely milliseconds
        const isMs = part.time.start > 1000000000000
        
        // Ensure end is greater than start to avoid negative/zero durations
        const start = part.time.start
        const end = Math.max(part.time.end, start + 0.001) // Minimum 1ms/1s duration
        
        const duration = end - start
        totalStreamingTimeMs += isMs ? duration : duration * 1000
      }
    }
  }

  // If streaming parts don't have timestamps, fallback to message-level timing
  if (totalStreamingTimeMs === 0) {
    for (const msg of assistantMessages) {
      if (msg.info.time?.created && msg.info.time?.completed) {
        const isMs = msg.info.time.created > 1000000000000
        const duration = msg.info.time.completed - msg.info.time.created
        totalStreamingTimeMs += isMs ? duration : duration * 1000
      }
    }
  }

  if (totalStreamingTimeMs === 0 || totalTokens === 0) return null

  // Ensure we don't divide by something extremely small that produces thousands of TPS
  // if totalStreamingTimeMs is e.g. 1ms for 4 tokens, that's 4000 TPS.
  // We cap the minimum turn time to 100ms for realistic statistics.
  const finalTimeMs = Math.max(totalStreamingTimeMs, 100)
  const tps = totalTokens / (finalTimeMs / 1000)
  return Number(tps.toFixed(2))
}
