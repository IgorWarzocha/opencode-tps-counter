import type { Plugin } from "@opencode-ai/plugin"
import { calculateTPS } from "./utils"

export const TPSCounterPlugin: Plugin = async ({ client }) => {
  const sessionIdleDelayMs = 250

  return {
    "chat.params": async () => {},

    event: async ({ event }) => {
      if (event.type === "session.idle") {
        const sid = event.properties.sessionID
        
        try {
          // Small delay to allow session persistence to settle
          await new Promise(r => setTimeout(r, sessionIdleDelayMs))

          const response = await client.session.messages({
            path: { id: sid }
          })

          if (!response.data?.length) return

          const lastMsg = response.data[response.data.length - 1]!
          const isTpsReport = lastMsg.parts.some(p => p.type === "text" && p.text.includes("▣ TPS |"))
          if (isTpsReport) return

          const metrics = calculateTPS(response.data)

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
        } catch {}
      }
    },
  }
}

export default TPSCounterPlugin
