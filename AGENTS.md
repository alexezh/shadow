# Repository Guidelines

## Project Structure & Module Organization
Core TypeScript sources live in `src/`, grouped by responsibility (e.g., `openai-client.ts` for API usage, `database.ts` for SQLite access, `console-app.ts` for the interactive mode). The build output lands in `dist/` after TypeScript compilation. Runtime assets and seed documents are stored under `content/`, while `shadow.db` holds the local SQLite cache that backs embeddings and context. Keep generated or experimental utilities alongside their related modules in `src/` to preserve discoverability.

## Build, Test, and Development Commands
- `npm install` — install dependencies; rerun after adding new packages.
- `npm run dev` — launch the TypeScript entry point with `ts-node`; best for rapid iterations of the MCP service.
- `npm run dev:console` — start the console-first workflow (`src/index.ts --console`) for manual agent interactions.
- `npm run build` — compile TypeScript to `dist/`; treats compiler warnings as blockers.
- `npm start` — execute the compiled service from `dist/index.js`.
- `npm run mdid` / `npm run htmlid` — generate document identifiers for Markdown or HTML inputs; useful when adding new content assets.
Always verify that `dist/` stays in sync with `src/` before publishing artifacts.

## Coding Style & Naming Conventions
Follow the existing two-space indentation and TypeScript strictness enforced by `tsconfig.json`. Use `camelCase` for functions/variables, `PascalCase` for classes, and align filenames with exported symbols (`mcp-client.ts` exports `MCPLocalClient`). Prefer small, composable modules and reuse shared helpers (e.g., `retryWithBackoff` in `openai-client.ts`) instead of inlining similar logic. Run `npm run build` prior to commits to ensure type safety.

## Testing Guidelines
Formal automated tests are not yet established. When introducing them, place TypeScript-friendly specs in `src/__tests__/` or a dedicated `tests/` directory and wire a corresponding npm script (e.g., `npm test`). At minimum, exercise new code paths with `npm run dev` or `npm run dev:console`, documenting observed behavior in the PR. Treat `tsc` as the baseline regression gate until broader coverage exists.

## Commit & Pull Request Guidelines
Commits in this repository use short, present-tense imperatives (`fix chunking`, `add blueprint loader`). Follow that pattern and keep subject lines under 72 characters. Each PR should include: a concise summary of the change, any relevant issue links, clear validation notes (commands run or scenarios tested), and screenshots or logs when UI- or console-facing output changes. Flag migrations that modify `shadow.db` so reviewers can reset local data if needed.

## Security & Configuration Tips
The OpenAI client reads `OPENAI_API_KEY`; never hardcode secrets in source or commits. Treat `shadow.db` and files under `content/` as potentially sensitive user-derived data—exclude them from public artifacts unless scrubbed. Rotate API keys when sharing logs that include request metadata, and avoid committing large sample documents without owner consent.
