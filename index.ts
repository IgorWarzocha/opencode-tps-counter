import type { Plugin } from "@opencode-ai/plugin"
import { calculateTPS } from "./utils"

export const TPSCounterPlugin: Plugin = async ({ client }) => {
  return {
    "chat.params": async () => {},

    event: async ({ event }) => {
      if (event.type === "session.idle") {
        const sid = event.properties.sessionID
        
        try {
          // Small delay to ensure all persistence is complete
          await new Promise(r => setTimeout(r, 500))

          const response = await client.session.messages({
            path: { id: sid }
          })

          if (!response.data?.length) return

          const lastMsg = response.data[response.data.length - 1]!
          const isTpsReport = lastMsg.parts.some(p => p.type === "text" && p.text.includes("▣ TPS |"))
          if (isTpsReport) return

          const tps = calculateTPS(response.data)

          if (tps) {
            await client.session.prompt({
              path: { id: sid },
              body: {
                noReply: true,
                parts: [{ type: "text", text: `▣ TPS | Average Speed: ${tps} tps`, ignored: true }],
              },
            })
          }
        } catch {}
      }
    },
  }
}

export default TPSCounterPlugin
