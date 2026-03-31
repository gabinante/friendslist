# Friendlist

A control plane for orchestrating multiple [Claude Code](https://claude.ai/code) CLI sessions. Friendlist enables complex software engineering workflows by coordinating multiple AI agents, each working in their own Claude Code session, through a web-based interface.

## Features

- 🎯 **Multi-Session Management** — Create, monitor, and control multiple Claude Code CLI sessions from a unified interface
- 🔄 **Declarative Orchestration Flows** — Script complex multi-phase tasks with loops, gates, parallel execution, and validation
- 🔌 **MCP Server Integration** — Built-in Model Context Protocol server for seamless session-to-session communication
- 🌐 **Web UI** — React-based control panel for real-time monitoring and interaction
- 📊 **Task Management** — Track tasks across sessions with priorities, tags, and status updates
- 💬 **Gossip System** — Sessions can share context and coordinate through structured messages
- ⚡ **WebSocket Updates** — Real-time notifications and status updates

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Claude Code CLI](https://claude.ai/code) installed and configured
- macOS, Linux, or Windows with WSL

## Installation

```bash
git clone https://github.com/yourusername/friendlist.git
cd friendlist
npm install
```

## Quick Start

```bash
# Start both server (port 3456) and client (port 5173)
npm run dev
```

Open http://localhost:5173 to access the web interface.

## Architecture

Friendlist consists of three main components:

### Backend (`src/server/`)
- **Fastify** server with TypeScript
- **SQLite** database via Drizzle ORM
- **WebSocket** support for real-time updates
- **MCP Server** (`src/server/mcp/server.ts`) — stdio-based Model Context Protocol server injected into Claude sessions

### Frontend (`src/client/`)
- **React** with Vite
- **TanStack Query** for data fetching
- **Tailwind CSS** for styling
- Real-time UI updates via WebSocket

### Flows (`flows/`)
Declarative orchestration scripts for coordinating multiple sessions:

```typescript
import { flow, validators } from './src/server/flow/dsl.js';

export default flow('feature-dev', (f) => {
  f.session('planner', 'Design the feature architecture')
   .parallel(
     (backend) => backend.session('backend-dev', 'Implement API'),
     (frontend) => frontend.session('frontend-dev', 'Build UI')
   )
   .loop(
     { maxIterations: 5, exitCondition: validators.testsPass('npm test') },
     (loop) => loop.session('tester', 'Run tests and fix issues')
   )
   .gate({ type: 'manual', title: 'Deployment Approval' });
});
```

See [`flows/README.md`](flows/README.md) for complete documentation.

## Development Commands

```bash
npm run dev              # Start both server and client
npm run dev:server       # Server only (port 3456)
npm run dev:client       # Client only (port 5173)
npm run build            # Build for production
npx tsc --noEmit         # Type-check
npm run db:generate      # Generate Drizzle migrations
npm run db:migrate       # Run migrations
```

## Project Structure

```
friendlist/
├── src/
│   ├── server/          # Backend (Fastify + SQLite)
│   │   ├── db/          # Database schema and migrations
│   │   ├── mcp/         # MCP server implementation
│   │   ├── flow/        # Flow execution engine
│   │   │   ├── dsl.ts   # Flow DSL API
│   │   │   ├── engine.ts # Flow executor
│   │   │   └── types.ts  # Flow type definitions
│   │   └── tags/        # Tag management
│   ├── client/          # Frontend (React + Vite)
│   │   ├── components/  # UI components
│   │   ├── hooks/       # React hooks
│   │   └── lib/         # Client utilities
│   └── shared/          # Shared types
├── flows/               # Orchestration scripts
│   └── README.md        # Flow documentation
└── CLAUDE.md           # Project conventions
```

## How It Works

1. **Session Spawning** — Friendlist spawns Claude Code CLI processes (`claude -p <prompt>`) with the MCP server injected via stdio
2. **MCP Communication** — Sessions communicate with Friendlist and each other through MCP tools (`friendlist_*`)
3. **Flow Execution** — The flow engine coordinates sessions by sending prompts and collecting outputs
4. **Task Management** — Sessions can create, pick up, and complete tasks visible across all sessions
5. **WebSocket Updates** — Real-time events keep the UI synchronized with session state

## Key Features

### Multi-Session Orchestration

Create and manage multiple Claude Code sessions, each with its own:
- Working directory
- Model selection (Opus, Sonnet, Haiku)
- Session alias for easy reference
- Independent task queue

### Flow DSL

Build complex workflows with:
- **Sessions** — Execute prompts in named sessions
- **Parallel** — Run multiple sessions concurrently
- **Loops** — Iterate until conditions are met
- **Gates** — Add approval checkpoints (manual/automatic)
- **Validators** — Check outputs and conditionally retry
- **Branches** — Conditional execution paths
- **Decompose** — Break large tasks into subtasks

### Gossip System

Sessions share context through structured messages:
```typescript
// Send gossip
friendlist_send_gossip({
  content: "API endpoints implemented in backend/routes/",
  audience: "all_sessions" // or "session:frontend-dev"
})

// Read gossip
friendlist_read_gossip({
  since: "2026-03-30T10:00:00Z",
  from_session: "backend-dev"
})
```

## Use Cases

- **Large Refactors** — Coordinate multiple sessions tackling different parts of the codebase
- **Full-Stack Development** — Parallel backend, frontend, and test development
- **Code Reviews** — One session writes code, another reviews
- **Iterative Development** — Automated code/test/fix loops
- **Documentation** — Keep docs in sync with code changes across sessions
- **Multi-Repo Projects** — Coordinate changes across multiple repositories

## Contributing

Contributions welcome! Please read [`CLAUDE.md`](CLAUDE.md) for project conventions.

### Development Rules

- Always test changes before submitting (start the server and verify behavior)
- Follow existing patterns in the codebase
- Update types in `src/shared/types.ts` when modifying APIs

## License

MIT
