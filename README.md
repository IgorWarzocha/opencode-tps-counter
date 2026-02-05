# OpenCode TPS Counter Plugin

This plugin posts a compact generation speed line after assistant responses in OpenCode:

`▣ Lat.: <value>s | E2E TPS: <value>`

## What the metrics mean

- `E2E TPS`: Effective local throughput in this OpenCode session.
  - Formula: `(output tokens + reasoning tokens) / (effective end - turn start - merged tool execution time)`
  - `effective end` prefers the last streamed token time when available, and falls back to message completion time.
  - This is measured from OpenCode message/event timestamps, not provider-native telemetry.
- `Lat.`: Time to first token for the assistant turn.
  - Formula: `first streamed token time - turn start`
  - If streaming timing is unavailable, it shows `n/a`.

## How the plugin measures a turn

- The plugin reports only when an assistant message is finalized with `finish: "stop"`.
- It groups all assistant messages in that turn by `parentID` (tool-call steps plus the final assistant stop).
- It sums `output + reasoning` tokens across the grouped assistant messages.
- It tracks stream windows from both stored parts and live `message.part.updated` events so latency still works when part timing is incomplete.
- It merges overlapping tool runtimes and subtracts that merged tool time from the end-to-end duration.

## Important limitation

These numbers are based on OpenCode-local timing and token accounting. They are useful for relative comparisons in the same environment, but they will not always match provider dashboards (for example OpenRouter throughput) because provider-side queueing/transport internals are not exposed in plugin events.

The plugin is designed for the canonical `dev` event/model flow. It does not depend on fork-only core wiring.

Reliability is highest when a provider streams chunks continuously. If a provider buffers output and flushes large chunks (or nearly the full response) at once, the measured generation window becomes artificially short and the reported rate can spike.

Example: some Z.ai responses can arrive in bursts where most assistant text appears nearly at once. In that case, the displayed value is less representative of true model-side throughput. This behavior comes from provider streaming characteristics and is not fully fixable from plugin-side event timing.

## Trigger behavior

The plugin reports when an assistant message reaches `finish: "stop"` on `message.updated`. This is more reliable than waiting for `session.idle`.

## Notes on compatibility

This implementation is intentionally plugin-only and aligned with canonical OpenCode `dev` behavior. It does not depend on custom TUI internals or fork-specific core patches.

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
