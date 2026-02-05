# AGENTS.md

## Repository Purpose
This repository implements an **OpenCode TPS (Tokens Per Second) Counter Plugin**. It tracks the arrival times of message parts to calculate and report the average generation speed of the assistant.

## Dev Flow
- **Installation**: Use `bun install` to set up dependencies.
- **Type-Check**: Use `bun x tsc --noEmit`. This is the PREFERRED verification method.
- **Run**: Use `bun run index.ts` to execute the plugin logic.
- **Missing Tooling**: SHOULD implement a `"typecheck": "tsc --noEmit"` script in `package.json` for standardized verification.

## Process Constraints
- Agents MUST NOT start long-running background processes or dev servers.
- Agents SHOULD use one-shot verification commands.

## Architecture & Patterns
- **Plugin Entry**: `index.ts` exports `TPSCounterPlugin` of type `Plugin` from `@opencode-ai/plugin`.
- **Event Handling**: The plugin listens for `message.part.updated` to capture `start` and `end` timestamps for each message ID.
- **Calculation Logic**: `utils.ts` contains `calculateTPS`, which aggregates tokens (output + reasoning) and divides by the duration captured during streaming.
- **Reporting**: TPS is reported back to the OpenCode session using `client.session.prompt` when `session.idle` is triggered.
- **Timing State**: Timings are stored in a volatile `Map<string, { start?: number; end?: number }>` and MUST be cleaned up after reporting to prevent memory leaks.

## Safety & Style
- **Verification**: Changes MUST be verified with `tsc` before submission.
- **Async Handling**: Use `async/await` for all client calls and event handlers.
- **Precision**: TPS results MUST be formatted to two decimal places.
