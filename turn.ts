import type { AssistantMessage, Part, ReasoningPart, TextPart, ToolPart } from "@opencode-ai/sdk"
import type { TpsInput } from "./utils"

type AssistantTurnMessage = {
  info: AssistantMessage
  parts: Part[]
}

type TimeRange = {
  start: number
  end: number
}

type StreamWindow = {
  firstTokenAt?: number
  lastTokenAt?: number
}

export type StreamWindowByMessageID = Map<string, StreamWindow>

function isStreamPart(part: Part): part is TextPart | ReasoningPart {
  return part.type === "text" || part.type === "reasoning"
}

function isCompletedToolPart(part: Part): part is ToolPart {
  if (part.type !== "tool") return false
  return part.state.status === "completed" || part.state.status === "error"
}

function mergeDurationMs(ranges: TimeRange[]) {
  if (!ranges.length) return 0
  const sorted = ranges.toSorted((a, b) => a.start - b.start)
  let total = 0
  let current = sorted[0]!

  for (const range of sorted.slice(1)) {
    if (range.start <= current.end) {
      current = { start: current.start, end: Math.max(current.end, range.end) }
      continue
    }

    total += current.end - current.start
    current = range
  }

  return total + (current.end - current.start)
}

function minTime(existing: number | undefined, next: number | undefined) {
  if (typeof next !== "number") return existing
  if (typeof existing !== "number") return next
  return Math.min(existing, next)
}

function maxTime(existing: number | undefined, next: number | undefined) {
  if (typeof next !== "number") return existing
  if (typeof existing !== "number") return next
  return Math.max(existing, next)
}

function getStreamTimes(part: TextPart | ReasoningPart) {
  const start = typeof part.time?.start === "number" ? part.time.start : undefined
  const end = typeof part.time?.end === "number" ? part.time.end : start
  return { start, end }
}

export function updateStreamWindowFromPart(streamWindowByMessageID: StreamWindowByMessageID, part: Part) {
  if (!isStreamPart(part)) return

  const now = Date.now()
  const start = typeof part.time?.start === "number" ? part.time.start : now
  const end = typeof part.time?.end === "number" ? part.time.end : start

  const existing = streamWindowByMessageID.get(part.messageID) ?? {}
  existing.firstTokenAt = minTime(existing.firstTokenAt, start)
  existing.lastTokenAt = maxTime(existing.lastTokenAt, end)
  streamWindowByMessageID.set(part.messageID, existing)
}

export function clearStreamWindows(streamWindowByMessageID: StreamWindowByMessageID, messageIDs: string[]) {
  for (const messageID of messageIDs) {
    streamWindowByMessageID.delete(messageID)
  }
}

export function collectTurnInput(input: {
  assistantMessages: AssistantTurnMessage[]
  completedAt: number
  streamWindowByMessageID: StreamWindowByMessageID
}): TpsInput | null {
  if (!input.assistantMessages.length) return null

  let outputTokens = 0
  let createdAt = Number.POSITIVE_INFINITY
  let firstTokenAt: number | undefined
  let lastTokenAt: number | undefined
  const toolRanges: TimeRange[] = []

  for (const message of input.assistantMessages) {
    outputTokens += (message.info.tokens?.output ?? 0) + (message.info.tokens?.reasoning ?? 0)
    createdAt = Math.min(createdAt, message.info.time.created)

    for (const part of message.parts) {
      if (isStreamPart(part)) {
        const streamTimes = getStreamTimes(part)
        firstTokenAt = minTime(firstTokenAt, streamTimes.start)
        lastTokenAt = maxTime(lastTokenAt, streamTimes.end)
      }

      if (!isCompletedToolPart(part) || !("time" in part.state)) continue
      const toolTime = part.state.time
      if (!("end" in toolTime) || typeof toolTime.end !== "number") continue
      const start = toolTime.start
      const end = toolTime.end
      if (end <= start) continue
      toolRanges.push({ start, end })
    }

    const fallback = input.streamWindowByMessageID.get(message.info.id)
    firstTokenAt = minTime(firstTokenAt, fallback?.firstTokenAt)
    lastTokenAt = maxTime(lastTokenAt, fallback?.lastTokenAt)
  }

  if (!Number.isFinite(createdAt)) return null

  return {
    outputTokens,
    createdAt,
    completedAt: input.completedAt,
    firstTokenAt,
    lastTokenAt,
    toolExecutionMs: mergeDurationMs(toolRanges),
  }
}
