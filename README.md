# OpenCode TPS Counter Plugin

This plugin posts a compact generation speed line after assistant responses in OpenCode:

`▣ TPS | <value> | TTFT: <value>s`

## What the metrics mean

- `TPS`: Effective local throughput in this OpenCode session.
  - Formula: `(output tokens + reasoning tokens) / (last token time - message created time)`
  - This is measured from OpenCode message/event timestamps, not provider-native telemetry.
- `TTFT`: Time to first token.
  - Formula: `first token time - message created time`

## Important limitation

These numbers are based on OpenCode-local timing and token accounting. They are useful for relative comparisons in the same environment, but they will not always match provider dashboards (for example OpenRouter throughput) because provider-side queueing/transport internals are not exposed in plugin events.

Reliability is highest when a provider streams chunks continuously. If a provider buffers output and flushes large chunks (or nearly the full response) at once, the measured generation window becomes artificially short and the reported rate can spike.

Example: some Z.ai responses can arrive in bursts where most assistant text appears nearly at once. In that case, the displayed value is less representative of true model-side throughput. This behavior comes from provider streaming characteristics and is not fully fixable from plugin-side event timing.

## Trigger behavior

The plugin reports when an assistant message reaches `finish: "stop"` on `message.updated`. This is more reliable than waiting for `session.idle`.

## Setup

```bash
bun install
```

Optional type-check:

```bash
bun x tsc --noEmit
```

## Local plugin wiring

Example `opencode.jsonc` snippet:

```jsonc
{
  "plugin": ["file:///absolute/path/to/opencode-tps-counter/index.ts"]
}
```
