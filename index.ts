import type { Plugin } from "@opencode-ai/plugin"
import type { AssistantMessage, Part } from "@opencode-ai/sdk"
import { clearStreamWindows, collectTurnInput, updateStreamWindowFromPart } from "./turn"
import type { StreamWindowByMessageID } from "./turn"
import { calculateTPS } from "./utils"

export const TPSCounterPlugin: Plugin = async ({ client }) => {
  const reportedMessageIDs = new Set<string>()
  const streamWindowByMessageID: StreamWindowByMessageID = new Map()

  return {
    event: async ({ event }) => {
      if (event.type === "message.part.updated") {
        updateStreamWindowFromPart(streamWindowByMessageID, event.properties.part)
        return
      }

      if (event.type === "message.removed") {
        reportedMessageIDs.delete(event.properties.messageID)
        streamWindowByMessageID.delete(event.properties.messageID)
        return
      }

      if (event.type !== "message.updated") return

      const info = event.properties.info
      if (info.role !== "assistant" || info.finish !== "stop" || typeof info.time.completed !== "number") return
      if (reportedMessageIDs.has(info.id)) return

      reportedMessageIDs.add(info.id)
      let keepReported = false
      let turnMessageIDs: string[] = []

      try {
        const response = await client.session.messages({
          path: { id: info.sessionID },
          query: { limit: 500 },
        })

        if (!response.data?.length) return

        const assistantMessages = response.data
          .filter((message): message is { info: AssistantMessage; parts: Part[] } => message.info.role === "assistant")
          .filter((message) => message.info.parentID === info.parentID)

        if (!assistantMessages.length) return

        turnMessageIDs = assistantMessages.map((message) => message.info.id)
        const turnInput = collectTurnInput({
          assistantMessages,
          completedAt: info.time.completed,
          streamWindowByMessageID,
        })
        if (!turnInput) return

        const metrics = calculateTPS(turnInput)

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
          return
        }

        clearStreamWindows(streamWindowByMessageID, turnMessageIDs)
      }
    },
  }
}

export default TPSCounterPlugin
