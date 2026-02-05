import type { Plugin } from "@opencode-ai/plugin"
import type { AssistantMessage, Part, ReasoningPart, TextPart, ToolPart } from "@opencode-ai/sdk"
import { calculateTPS } from "./utils"

function isTimedStreamPart(part: Part): part is TextPart | ReasoningPart {
  return (part.type === "text" || part.type === "reasoning") && typeof part.time?.start === "number"
}

function isToolPart(part: Part): part is ToolPart {
  return part.type === "tool"
}

function getToolDurationMs(intervals: Map<string, { start?: number; end?: number }> | undefined) {
  if (!intervals) return 0

  const ranges: Array<{ start: number; end: number }> = []
  for (const interval of intervals.values()) {
    if (typeof interval.start !== "number" || typeof interval.end !== "number") continue
    if (interval.end <= interval.start) continue
    ranges.push({ start: interval.start, end: interval.end })
  }

  if (!ranges.length) return 0

  ranges.sort((a, b) => a.start - b.start)
  let total = 0
  let activeStart = ranges[0]!.start
  let activeEnd = ranges[0]!.end

  for (let i = 1; i < ranges.length; i++) {
    const range = ranges[i]!
    if (range.start <= activeEnd) {
      activeEnd = Math.max(activeEnd, range.end)
      continue
    }

    total += activeEnd - activeStart
    activeStart = range.start
    activeEnd = range.end
  }

  return total + (activeEnd - activeStart)
}

export const TPSCounterPlugin: Plugin = async ({ client }) => {
  const reportedMessageIDs = new Set<string>()

  return {
    event: async ({ event }) => {
      if (event.type === "message.removed") {
        reportedMessageIDs.delete(event.properties.messageID)
      }

      if (event.type !== "message.updated") return

      const info = event.properties.info
      if (info.role !== "assistant" || info.finish !== "stop" || typeof info.time.completed !== "number") return
      if (reportedMessageIDs.has(info.id)) return

      reportedMessageIDs.add(info.id)
      let keepReported = false

      try {
        const response = await client.session.messages({
          path: { id: info.sessionID },
          query: { limit: 25 },
        })

        if (!response.data?.length) return

        const endIndex = response.data.findIndex(message => message.info.id === info.id)
        const stopIndex = endIndex === -1 ? response.data.length - 1 : endIndex

        let startIndex = 0
        for (let i = stopIndex; i >= 0; i--) {
          const message = response.data[i]
          if (!message || message.info.role !== "user") continue
          startIndex = i + 1
          break
        }

        const turnMessages = response.data.slice(startIndex, stopIndex + 1)
        const assistantMessages = turnMessages.filter(
          (message): message is { info: AssistantMessage; parts: Part[] } => message.info.role === "assistant"
        )
        if (!assistantMessages.length) return

        let outputTokens = 0
        let createdAt = Number.POSITIVE_INFINITY
        let firstTokenAt: number | undefined
        let lastTokenAt: number | undefined
        const toolIntervals = new Map<string, { start?: number; end?: number }>()

        for (const message of assistantMessages) {
          outputTokens += (message.info.tokens?.output ?? 0) + (message.info.tokens?.reasoning ?? 0)
          createdAt = Math.min(createdAt, message.info.time.created)

          for (const part of message.parts) {
            if (isTimedStreamPart(part)) {
              firstTokenAt = typeof firstTokenAt === "number" ? Math.min(firstTokenAt, part.time!.start) : part.time!.start
              const partEnd = part.time!.end ?? part.time!.start
              lastTokenAt = typeof lastTokenAt === "number" ? Math.max(lastTokenAt, partEnd) : partEnd
            }

            if (!isToolPart(part)) continue
            if (part.state.status !== "completed" && part.state.status !== "error") continue

            const toolKey = `${message.info.id}:${part.callID}`
            const existing = toolIntervals.get(toolKey) ?? {}
            const { start, end } = part.state.time
            existing.start = typeof existing.start === "number" ? Math.min(existing.start, start) : start
            existing.end = typeof existing.end === "number" ? Math.max(existing.end, end) : end
            toolIntervals.set(toolKey, existing)
          }
        }

        const metrics = calculateTPS({
          outputTokens,
          createdAt,
          completedAt: info.time.completed,
          firstTokenAt,
          lastTokenAt,
          toolExecutionMs: getToolDurationMs(toolIntervals),
        })

        if (!metrics) return

        const latencyText =
          typeof metrics.timeToFirstTokenMs === "number"
            ? `${(metrics.timeToFirstTokenMs / 1000).toFixed(2)}s`
            : "n/a"

        await client.session.prompt({
          path: { id: info.sessionID },
          body: {
            noReply: true,
            parts: [
              {
                type: "text",
                text: `▣ Lat.: ${latencyText} | E2E TPS: ${metrics.tps}`,
                ignored: true,
                metadata: { source: "opencode-tps-counter" },
              },
            ],
          },
        })

        keepReported = true
      } catch {
      } finally {
        if (!keepReported) {
          reportedMessageIDs.delete(info.id)
        }
      }
    },
  }
}

export default TPSCounterPlugin
