/**
 * TPS Counter Plugin for OpenCode
 * Displays average Tokens Per Second (TPS) from the last assistant turn when session is idle.
 */
import type { Plugin } from "@opencode-ai/plugin"
import { calculateTPS } from "./utils"

export const TPSCounterPlugin: Plugin = async ({ client }) => {
  let currentSessionID: string | null = null

  return {
    // Capture session ID when a message starts processing
    "chat.params": async (input) => {
      currentSessionID = input.sessionID
    },

    // Trigger calculation when the session turns idle
    event: async ({ event }) => {
      if (event.type === "session.idle" && currentSessionID) {
        try {
          // Add a small delay to ensure all message/part updates are processed by the server
          await new Promise(r => setTimeout(r, 200))

          // Fetch messages for the session to calculate turn stats
          const response = await client.session.messages({
            path: { id: currentSessionID }
          })

          if (response.data && response.data.length > 0) {
            const tps = calculateTPS(response.data)
            
            if (tps) {
              await client.session.prompt({
                path: { id: currentSessionID },
                body: {
                  noReply: true, // Do not trigger LLM response
                  parts: [
                    {
                      type: "text",
                      text: `▣ TPS | Average Speed: ${tps} tps`,
                      ignored: true, // Do not include in context
                    },
                  ],
                },
              })
            }
          }
        } catch {
          // Fail silently to avoid interrupting the user session
        }
      }
    },
  }
}

export default TPSCounterPlugin
