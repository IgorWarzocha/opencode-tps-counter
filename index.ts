import type { Plugin } from "@opencode-ai/plugin"
import { calculateTPS } from "./utils"

export const TPSCounterPlugin: Plugin = async ({ client }) => {
  const firstTokenAtByMessage = new Map<string, number>()
  const lastTokenAtByMessage = new Map<string, number>()

  return {
    "chat.params": async () => {},

    event: async ({ event }) => {
      if (event.type === "message.part.updated") {
        const part = event.properties.part
        if ((part.type === "text" || part.type === "reasoning") && part.time?.start) {
          const currentFirst = firstTokenAtByMessage.get(part.messageID)
          const nextFirst = currentFirst ? Math.min(currentFirst, part.time.start) : part.time.start
          firstTokenAtByMessage.set(part.messageID, nextFirst)

          const partEnd = part.time.end ?? part.time.start
          const currentLast = lastTokenAtByMessage.get(part.messageID)
          const nextLast = currentLast ? Math.max(currentLast, partEnd) : partEnd
          lastTokenAtByMessage.set(part.messageID, nextLast)
        }
      }

      if (event.type === "message.updated") {
        const info = event.properties.info
        if (
          info.role === "assistant" &&
          info.finish === "stop" &&
          typeof info.time.completed === "number"
        ) {
          try {
            const response = await client.session.messages({
              path: { id: info.sessionID }
            })

            if (!response.data?.length) return

            const lastMsg = response.data[response.data.length - 1]!
            const isTpsReport = lastMsg.parts.some(p => p.type === "text" && p.text.includes("▣ TPS |"))
            if (isTpsReport) return

            const metrics = calculateTPS({
              outputTokens: (info.tokens?.output ?? 0) + (info.tokens?.reasoning ?? 0),
              createdAt: info.time.created,
              firstTokenAt: firstTokenAtByMessage.get(info.id),
              lastTokenAt: lastTokenAtByMessage.get(info.id),
            })

            if (metrics) {
              const ttftText =
                typeof metrics.timeToFirstTokenMs === "number"
                  ? ` | TTFT: ${(metrics.timeToFirstTokenMs / 1000).toFixed(2)}s`
                  : ""
              await client.session.prompt({
                path: { id: info.sessionID },
                body: {
                  noReply: true,
                  parts: [
                    {
                      type: "text",
                      text: `▣ TPS | ${metrics.tps}${ttftText}`,
                      ignored: true,
                    },
                  ],
                },
              })
            }
          } catch {
          } finally {
            firstTokenAtByMessage.delete(info.id)
            lastTokenAtByMessage.delete(info.id)
          }
        }
      }
    },
  }
}

export default TPSCounterPlugin
