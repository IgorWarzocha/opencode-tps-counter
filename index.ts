import type { Plugin } from "@opencode-ai/plugin"
import type { Part, ReasoningPart, TextPart } from "@opencode-ai/sdk"
import { calculateTPS } from "./utils"

function isTimedStreamPart(part: Part): part is TextPart | ReasoningPart {
  return (part.type === "text" || part.type === "reasoning") && typeof part.time?.start === "number"
}

export const TPSCounterPlugin: Plugin = async ({ client }) => {
  const streamPartTypes = new Set(["text", "reasoning"])
  const messageTimingByID = new Map<string, { first?: number; last?: number }>()
  const reportedMessageIDs = new Set<string>()

  return {
    event: async ({ event }) => {
      if (event.type === "message.part.updated") {
        const part = event.properties.part
        if (!streamPartTypes.has(part.type) || !isTimedStreamPart(part)) return

        const timing = messageTimingByID.get(part.messageID) ?? {}
        const partStart = part.time!.start
        timing.first = typeof timing.first === "number" ? Math.min(timing.first, partStart) : partStart
        const partEnd = part.time!.end ?? partStart
        timing.last = typeof timing.last === "number" ? Math.max(timing.last, partEnd) : partEnd
        messageTimingByID.set(part.messageID, timing)
      }

      if (event.type === "message.updated") {
        const info = event.properties.info
        if (info.role !== "assistant") return

        if (info.finish && info.finish !== "stop") {
          messageTimingByID.delete(info.id)
          reportedMessageIDs.delete(info.id)
          return
        }

        if (info.finish === "stop" && typeof info.time.completed === "number") {
          if (reportedMessageIDs.has(info.id)) return
          reportedMessageIDs.add(info.id)

          const timing = messageTimingByID.get(info.id)

          try {
            const metrics = calculateTPS({
              outputTokens: (info.tokens?.output ?? 0) + (info.tokens?.reasoning ?? 0),
              createdAt: info.time.created,
              completedAt: info.time.completed,
              firstTokenAt: timing?.first,
              lastTokenAt: timing?.last,
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
          } catch {
            return
          } finally {
            messageTimingByID.delete(info.id)
          }
        }
      }
    },
  }
}

export default TPSCounterPlugin
