# AGENTS.md - Development Guide for AI Agents

This file provides context for AI coding agents working in this repository.

## Project Overview

- **Project**: Next AI Draw.io - AI-Powered Diagram Creation Tool
- **Stack**: Next.js 16, React 19, TypeScript, Tailwind CSS v4
- **AI SDK**: Vercel AI SDK with multi-provider support (OpenAI, Anthropic, Google, AWS Bedrock, etc.)
- **Diagrams**: draw.io integration via react-drawio

---

## Build, Lint & Test Commands

### Development
```bash
npm run dev              # Start dev server (port 6002)
npm run build           # Production build
npm run start           # Start production server (port 6001)
```

### Linting & Formatting
```bash
npm run lint            # Biome lint (check only)
npm run format          # Biome format (auto-fix)
npm run check           # Biome CI check (strict)
npm run lint && npm run check  # Full check
```

### Testing
```bash
npm run test                    # Run all unit tests (vitest)
npm run test -- <file>          # Run single test file
npm run test -- --run           # Run tests once (no watch)
npm run test -- tests/unit/utils.test.ts  # Run specific test
npm run test:e2e                # Run e2e tests (playwright)
```

### Electron Desktop App
```bash
npm run electron:dev     # Dev mode with electron
npm run electron:build    # Build electron app
npm run dist:win          # Build Windows installer
npm run dist:mac          # Build macOS installer
npm run dist:linux       # Build Linux installer
```

### Cloudflare Workers
```bash
npm run preview          # Preview Cloudflare build
npm run deploy            # Deploy to Cloudflare
npm run cf-typegen        # Generate Cloudflare types
```

---

## Code Style Guidelines

### General Rules

- **Linter**: Biome (biome.json)
- **Formatter**: Biome with 4-space indent, double quotes
- **TypeScript**: Strict mode enabled
- **Path Alias**: Use `@/*` for root imports (e.g., `@/lib/utils`)

### Imports

```typescript
// React - import hooks from react directly
import { useState, useEffect, useCallback } from "react"

// Next.js
import { usePathname, useRouter, useSearchParams } from "next/navigation"

// Path alias (preferred)
import { cn } from "@/lib/utils"

// Relative for sibling files
import { Button } from "./ui/button"
```

### Component Patterns

```typescript
// Client Component - must have "use client" at top
"use client"

import { useState } from "react"

export function MyComponent({ title }: { title: string }) {
  const [state, setState] = useState(false)
  
  return <div>{title}</div>
}

// Server Component - no "use client" directive
export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  return <div>Page for {lang}</div>
}
```

### Naming Conventions

- **Components**: PascalCase (`ChatPanel`, `ModelSelector`)
- **Hooks**: camelCase with `use` prefix (`useDiagram`, `useModelConfig`)
- **Types/Interfaces**: PascalCase (`ChatMessage`, `ModelConfig`)
- **Constants**: UPPER_SNAKE_CASE for compile-time constants, camelCase for others
- **Files**: kebab-case (`chat-panel.tsx`, `utils.ts`)

### TypeScript Rules

- Always define prop types explicitly
- Use `interface` for object shapes, `type` for unions/intersections
- Avoid `any` - use `unknown` when type is truly unknown
- Use `as const` for literal types that shouldn't widen

```typescript
// Good
interface Props {
  isVisible: boolean
  onToggle: () => void
  items: string[]
}

// Enum-like constant
const TOOL_STATES = {
  ERROR: "output-error",
  LOADING: "loading"
} as const
```

### Error Handling

- Use try/catch with specific error types
- Display errors via `sonner` toast: `toast.error("message")`
- Log errors appropriately (console.error for dev, proper logger in production)
- Validate inputs with Zod schemas in `lib/validation-schema.ts`

### Tailwind CSS

- Use `cn()` utility from `@/lib/utils` for conditional classes
- Tailwind v4 - uses `@theme` directive for custom values
- Avoid arbitrary values; define in theme when used frequently

```typescript
import { cn } from "@/lib/utils"

<div className={cn(
  "base-class",
  isActive && "active-class",
  className  // allow override
)} />
```

---

## Project Structure

```
├── app/                    # Next.js App Router
│   └── [lang]/            # Language routes
├── components/            # React components
│   ├── ui/               # Radix UI primitives (shadcn-style)
│   └── chat/             # Chat-related components
├── lib/                  # Utility functions
│   ├── types/            # TypeScript types
│   └── i18n/             # Internationalization
├── hooks/                # Custom React hooks
├── contexts/             # React contexts
├── tests/
│   ├── unit/             # Vitest unit tests
│   └── e2e/              # Playwright e2e tests
├── electron/             # Electron main/preload
└── public/               # Static assets
```

---

## Testing Guidelines

### Unit Tests (Vitest)

- Location: `tests/unit/*.test.ts`
- Environment: jsdom
- Pattern: Use `@vitest-environment node` comment for Node.js-only tests

```typescript
import { describe, expect, it } from "vitest"

describe("myFunction", () => {
  it("does something", () => {
    expect(myFunction(input)).toBe(expected)
  })
})
```

### E2E Tests (Playwright)

- Location: `tests/e2e/*.test.ts`
- Config: `playwright.config.ts`
- Runs against dev server (port 6002) or production (port 6001 in CI)

---

## Key Dependencies

- **AI**: `ai`, `@ai-sdk/react`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, etc.
- **UI**: Radix UI primitives, Tailwind CSS v4, Lucide icons, Motion
- **State**: React hooks + Context (no external state library)
- **Validation**: Zod
- **Storage**: IndexedDB via `idb`, sessionStorage
- **Testing**: Vitest, Playwright, Testing Library

---

## Common Patterns

### Client-Side Diagram State
```typescript
import { useDiagram } from "@/contexts/diagram-context"
const { diagram, setDiagram, ... } = useDiagram()
```

### AI Chat Integration
```typescript
import { useChat } from "@ai-sdk/react"
const { messages, input, handleSubmit } = useChat({ ... })
```

### Toast Notifications
```typescript
import { toast } from "sonner"
toast.success("Saved!")
toast.error("Failed to save")
```

---

## Notes

- UI components in `components/ui/` are excluded from Biome formatting/linting (third-party style)
- Environment variables: Copy `env.example` to `.env.local`
- Dev server runs on port 6002 to avoid conflicts
- Electron app uses separate build process with esbuild
