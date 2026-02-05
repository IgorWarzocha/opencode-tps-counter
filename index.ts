import type { Plugin } from "@opencode-ai/plugin"
import { calculateTPS } from "./utils"

export const TPSCounterPlugin: Plugin = async ({ client }) => {
  const sessionIdleDelayMs = 250
  const firstTokenAtByMessage = new Map<string, number>()
  const latestCompletedBySession = new Map<
    string,
    {
      messageID: string
      outputTokens: number
      createdAt: number
      completedAt: number
      firstTokenAt?: number
    }
  >()

  return {
    "chat.params": async () => {},

    event: async ({ event }) => {
      if (event.type === "message.part.updated") {
        const part = event.properties.part
        if ((part.type === "text" || part.type === "reasoning") && part.time?.start) {
          const current = firstTokenAtByMessage.get(part.messageID)
          const next = current ? Math.min(current, part.time.start) : part.time.start
          firstTokenAtByMessage.set(part.messageID, next)
        }
      }

      if (event.type === "message.updated") {
        const info = event.properties.info
        if (
          info.role === "assistant" &&
          info.finish === "stop" &&
          typeof info.time.completed === "number"
        ) {
          latestCompletedBySession.set(info.sessionID, {
            messageID: info.id,
            outputTokens: info.tokens?.output ?? 0,
            createdAt: info.time.created,
            completedAt: info.time.completed,
            firstTokenAt: firstTokenAtByMessage.get(info.id),
          })
        }
      }

      if (event.type === "session.idle") {
        const sid = event.properties.sessionID
        
        try {
          // Small delay to allow session persistence to settle
          await new Promise(r => setTimeout(r, sessionIdleDelayMs))

          const completed = latestCompletedBySession.get(sid)
          if (!completed) return

          const response = await client.session.messages({
            path: { id: sid }
          })

          if (!response.data?.length) return

          const lastMsg = response.data[response.data.length - 1]!
          const isTpsReport = lastMsg.parts.some(p => p.type === "text" && p.text.includes("▣ TPS |"))
          if (isTpsReport) return

          const metrics = calculateTPS(completed)

          if (metrics) {
            const ttfbText =
              typeof metrics.timeToFirstTokenMs === "number"
                ? ` | TTFB: ${(metrics.timeToFirstTokenMs / 1000).toFixed(2)}s`
                : ""
            await client.session.prompt({
              path: { id: sid },
              body: {
                noReply: true,
                parts: [
                  {
                    type: "text",
                    text: `▣ TPS | Average Speed: ${metrics.tps} tps${ttfbText}`,
                    ignored: true,
                  },
                ],
              },
            })
          }

          latestCompletedBySession.delete(sid)
          firstTokenAtByMessage.delete(completed.messageID)
        } catch {}
      }
    },
  }
}

export default TPSCounterPlugin
