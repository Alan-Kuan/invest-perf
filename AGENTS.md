# Agent Guidelines for invest-perf Repository

This file provides instructions for agentic coding agents working in this repository.
It covers build/lint/test commands, code style guidelines, and development practices.

## Table of Contents

1. [Project Overview](#project-overview)
2. [Development Commands](#development-commands)
3. [Code Style Guidelines](#code-style-guidelines)
4. [Testing Practices](#testing-practices)
5. [Git Workflow](#git-workflow)
6. [Additional Notes](#additional-notes)

## Project Overview

This is a TypeScript project managed with pnpm.
The project is a Vue 3 investment performance tracking web app.

- Framework: Vue 3 (Composition API) + Vite
- UI Library: Vuetify 4
- Styling: UnoCSS (non-attributify mode)
- Database: sql.js (WASM version) with IndexedDB persistence
- Charts: Chart.js + vue-chartjs
- Routing: Vue Router
- Type Checking: vue-tsc
- Linting & Formatting: oxlint + oxfmt

### Key Composables

- `useDatabase`: Database initialization and CRUD operations
- `useTransactions`: Transaction management
- `useDividends`: Dividend record management
- `usePortfolio`: Portfolio holdings and P/L calculations
- `useStockList`: Stock search with autocomplete (loads from TWSE API)
- `useStockPrice`: Real-time stock price fetching

### Database

- Uses sql.js WASM version for SQLite in browser
- WASM file copied to dist via `vite-plugin-static-copy`
- Data persisted in IndexedDB under database name `invest_perf`

### Database Tables

- `transactions`: Buy/sell records
- `dividends`: Cash and stock dividends
- `prices`: Current stock prices
- `stocks`: Stock ticker/name mapping
- `annual_performance`: Yearly performance data
- `historical_prices`: Historical price data

### API Configuration

- Stock list: `https://openapi.twse.com.tw` via Vite proxy `/api/twse`
- Real-time prices: `https://mis.twse.com.tw` via Vite proxy `/api/mis`

### Data Conventions

- Dates stored in DB as `YYYY-MM-DD` (ISO format for sorting)
- Dates displayed as `YYYY/MM/DD` (display format)
- Input uses native date pickers (returns `YYYY-MM-DD`)

## Development Commands

### Package Management

- Install dependencies: `pnpm install`
- Update dependencies: `pnpm update`
- Add a dependency: `pnpm add <package>`
- Add a dev dependency: `pnpm add -D <package>`

### Build Commands

- Build the project: `pnpm build`
- Development server: `pnpm dev` (do not start automatically, only when explicitly requested)

### Type Checking

- Run type check: `pnpm typecheck`

### Linting & Formatting

- Lint: `pnpm lint`
- Lint & Fix: `pnpm lint:fix`
- Format: `pnpm fmt`
- Format Check: `pnpm fmt:check`

## Code Style Guidelines

### Formatting

- Use single quotes (`'`) for strings, except when escaping is needed
- Use semicolons at the end of statements
- No trailing spaces at end of lines
- Opening curly braces `{` on the same line as the statement (e.g., `if (condition) {`)
- Closing curly braces `}` on their own line
- Indentation: 2 spaces
- Line length: Maximum 100 characters (prefer 80 when possible)
- Trailing commas: Use in multi-line objects, arrays, and argument lists
- Empty lines: Use to separate logical sections (max 2 consecutive blank lines)
- Function declarations: Use `function` keyword instead of arrow functions assigned to variables
  - Exception: Vue component `computed` properties should use arrow functions for proper `this` binding

### Imports

- ES6 import syntax
- Order imports:
  1. Built-in Node.js modules (if any)
  2. External dependencies (alphabetical)
  3. Internal modules (relative paths, alphabetical by directory)
- Each import on its own line
- No wildcard imports (`*`) unless absolutely necessary
- Destructure imports when only specific exports are needed

### TypeScript

- Use `@types/sql.js` for sql.js types
- Use `SqlValue` from `sql.js/dist/sql-wasm.js` for query parameters
- Prefer interfaces for object shapes
- Use type aliases for complex types and unions/intersections
- Avoid `any` type; use `unknown` when type is uncertain
- Explicit return types for public functions
- Use `as unknown as Type` when casting from QueryResult to domain types

### Naming Conventions

- Variables: `snake_case` (e.g., `stock_yearly_data`, `annual_performance`)
- Functions: `smallCamelCase` (e.g., `loadStats`, `fetchHistoricalPrice`)
- Global constants: `SCREAMING_SNAKE_CASE` (e.g., `MIN_REQUEST_INTERVAL`)
- Classes and constructors: `PascalCase`
- Files: `kebab-case` for config files, `PascalCase` for components
- Tests: Describe behavior in `describe` blocks, use `it` or `test` for assertions
- Test files: `<name>.test.ts` or `<name>.spec.ts`

### Error Handling

- Use try/catch for asynchronous operations when appropriate
- Prefer returning promises that reject rather than throwing synchronously in async functions
- Handle errors at the appropriate level (don't ignore or swallow)
- Log errors with context using console.error for development

### Vue Specific

- Component names: `PascalCase`
- Props: `camelCase` in declaration, `kebab-case` in templates
- Custom hooks start with `use`

## Rules

- Do not revert changes that differ from previous requests, as they may be the user's later modifications

## Git Workflow

### Branching

- Main branch: `main`
- Feature branches: `feature/short-description`
- Bug fix branches: `bugfix/issue-number-description`

### Commit Messages

- Use conventional commits format:
  - `feat: add new feature`
  - `fix: resolve login issue`
  - `docs: update README`
  - `style: fix formatting`
  - `refactor: simplify user service`
  - `test: add missing tests`
  - `chore: update dependencies`
- Keep subject line under 50 characters
- Reference issue numbers when applicable

## Additional Notes

### WASM Configuration

- sql.js uses WASM version (`sql-wasm.wasm`)
- Vite plugin `vite-plugin-static-copy` copies WASM file to dist root
- In browser, locateFile returns `/sql-wasm.wasm` (public folder)

### Vuetify Styles

- Import `vuetify/styles` in `main.ts`
- Requires type declaration in `vite-env.d.ts`:
  ```ts
  declare module 'vuetify/styles' {
    const styles: string;
    export default styles;
  }
  ```

### UnoCSS

- Uses `virtual:uno.css` import (Vite virtual module)
- Non-attributify mode (no `un-` prefix for group modifiers)

---

_These guidelines are subject to evolution as the project grows.
Consult with team members when deviating from established patterns._
