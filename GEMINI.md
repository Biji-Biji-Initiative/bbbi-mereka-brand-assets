# bbbi-mereka-brand-assets — AI Coding Instructions

> **Full project context**: See `AGENTS.md` at the repository root.
> This file provides quick orientation for Gemini Code Assist. For complete conventions, read `AGENTS.md`.

## Key Conventions

- **Specs vs Docs**: Specs (`specs/`) are testable contracts. Docs (`docs/`) are explanations. Never mix them.
- **Normative language**: MUST, SHOULD, MAY (RFC 2119) in specs and requirements.
- **Acceptance Criteria**: Stable IDs (`AC-001`, `AC-002`) with verification methods.
- **Verify before commit**: Run tests, lint, and build before any commit.
- **No version downgrades**: Solve issues at current versions. Never downgrade packages.
