# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Code Style

Use comments sparingly. Only comment complex code.

## Project Overview

UIGen is an AI-powered React component generator with live preview. Users describe components in a chat interface, Claude generates them using a virtual file system, and changes render live in an iframe preview.

## Commands

```bash
# First-time setup (install deps + generate Prisma client + run migrations)
npm run setup

# Development server (Turbopack)
npm run dev

# Production build
npm run build

# Lint
npm run lint

# Run all tests
npm test

# Run a single test file
npx vitest run src/lib/__tests__/file-system.test.ts

# Reset database
npm run db:reset
```

> Note: Dev scripts use Windows `set NODE_OPTIONS=--require ./node-compat.cjs` for Node.js compatibility. The `node-compat.cjs` polyfill must remain at the root.

## Architecture

### Request Flow

1. User types in `ChatInterface` → `ChatProvider` (uses Vercel AI SDK `useChat`) sends `POST /api/chat` with the full message history and serialized VFS state
2. `src/app/api/chat/route.ts` reconstructs the VFS, streams Claude's response using two tools: `str_replace_editor` and `file_manager`
3. Tool calls stream back to the client; `FileSystemContext.handleToolCall` applies mutations to the in-memory VFS
4. `PreviewFrame` watches `refreshTrigger` from `FileSystemContext`, compiles changed files with `@babel/standalone`, builds an import map with blob URLs, and reloads the iframe's `srcdoc`

### Virtual File System (`src/lib/file-system.ts`)

`VirtualFileSystem` is the core data structure — an in-memory tree of `FileNode` objects. It is:
- **Serialized** to `Record<string, FileNode>` when sent to the API or saved to the database
- **Deserialized** on page load from DB project data via `FileSystemProvider`
- Manipulated by Claude through two Vercel AI SDK tools defined in `src/lib/tools/`

### AI Tools

Both tools receive a `VirtualFileSystem` instance at construction time:
- `str_replace_editor` (`src/lib/tools/str-replace.ts`) — commands: `view`, `create`, `str_replace`, `insert`
- `file_manager` (`src/lib/tools/file-manager.ts`) — commands: `rename`, `delete`

The system prompt (`src/lib/prompts/generation.tsx`) instructs Claude to always create `/App.jsx` as the entry point and use `@/` import alias for local files.

### Preview Pipeline (`src/lib/transform/jsx-transformer.ts`)

`createImportMap()` iterates all VFS files, transforms each `.jsx/.tsx` file with Babel into a blob URL, and builds a browser import map. Third-party packages are resolved via `https://esm.sh/`. React 19 is always loaded from esm.sh. The resulting HTML is injected into an iframe via `srcdoc`.

### Auth & Persistence

- JWT sessions in httpOnly cookies via `jose` (`src/lib/auth.ts`)
- Prisma + SQLite (schema at `prisma/schema.prisma`, client generated to `src/generated/prisma/`); reference the schema file whenever you need to understand the database structure
- Authenticated users get projects with persisted messages and VFS data (JSON in DB)
- Anonymous users can work freely; work is tracked in `src/lib/anon-work-tracker.ts` and prompts sign-up on the next visit
- `src/middleware.ts` protects `/api/projects` and `/api/filesystem` routes

### Provider Selection (`src/lib/provider.ts`)

`getLanguageModel()` returns `anthropic("claude-haiku-4-5")` when `ANTHROPIC_API_KEY` is set, otherwise returns `MockLanguageModel` which generates static demo components without calling the API.

### State Management

Two React contexts wrap the entire app in `MainContent`:
- `FileSystemProvider` — owns the `VirtualFileSystem` instance, exposes CRUD helpers and `handleToolCall`
- `ChatProvider` — wraps Vercel AI SDK's `useChat`, wires tool calls to `FileSystemContext`

### Testing

Tests use Vitest + jsdom + React Testing Library. Test files live alongside source under `__tests__/` subdirectories. The vitest config (`vitest.config.mts`) uses `vite-tsconfig-paths` to resolve the `@/` alias.
