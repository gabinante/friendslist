# Friendlist

Claude Code control plane for orchestrating multiple Claude Code CLI sessions.

## Dev Commands

- `npm run dev` — Start both server (port 3456) and client (port 5173)
- `npm run dev:server` — Server only
- `npm run dev:client` — Client only (Vite)
- `npx tsc --noEmit` — Type-check

## Architecture

- **Backend**: Fastify + TypeScript + SQLite (Drizzle ORM) in `src/server/`
- **Frontend**: React + Vite + TanStack Query + Tailwind in `src/client/`
- **MCP Server**: `src/server/mcp/server.ts` — stdio MCP server injected into spawned Claude sessions
- **Shared types**: `src/shared/types.ts`
- **Flows**: Declarative orchestration scripts in `flows/` — coordinate multiple sessions for complex tasks
  - DSL: `src/server/flow/dsl.ts` — fluent API for defining flows
  - Engine: `src/server/flow/engine.ts` — executes flows with loops, gates, validators, branches
  - Types: `src/server/flow/types.ts` — flow step definitions
  - See `flows/README.md` for complete documentation

## Rules

- Always test changes before considering them done. Start the server, hit the endpoint or reproduce the scenario, and verify it works. Do not leave untested code for the user to debug.
- When modifying Claude CLI spawn args, test with an actual `claude -p` invocation to verify flag compatibility.
