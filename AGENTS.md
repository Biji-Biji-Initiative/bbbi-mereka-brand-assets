# AGENTS.md

## Repository Overview
Brand assets and guidelines for Mereka and Biji-Biji Initiative. Contains logos, color palettes, typography, and brand documentation. Used across all Biji-Biji projects.

## Project Structure
- `brands/mereka/` — Mereka brand assets
  - `logos/` — PNG and SVG logos
  - `colors/` — Color palettes
  - `fonts/` — Typography
  - `guides/` — Brand guidelines (PDF, MD, YAML, JSON)
  - `icons/favicon/` — Favicons
  - `templates/` — Design templates
- `brands/bbi/` — BBI brand assets
  - `logos/` — PNG and SVG logos (primary + legacy)
  - `guides/` — Brand guide (PDF, MD, YAML, JSON)
  - `icons/favicon/` — Favicons

## Key Files

| Asset Type | Mereka | BBI |
|------------|--------|-----|
| Brand Guide | `brands/mereka/guides/brand-guidelines.md` | `brands/bbi/guides/brand-guide-2023.md` |
| Logo (SVG) | `brands/mereka/logos/svg/` | `brands/bbi/logos/svg/primary/` |
| Logo (PNG) | `brands/mereka/logos/png/` | `brands/bbi/logos/png/primary/` |
| Favicon | `brands/mereka/icons/favicon/` | `brands/bbi/icons/favicon/` |

## Usage

**Raw GitHub URL:**
```
https://raw.githubusercontent.com/Biji-Biji-Initiative/bbbi-mereka-brand-assets/main/brands/mereka/logos/svg/mereka-logo-black.svg
```

**Git Submodule:**
```bash
git submodule add https://github.com/Biji-Biji-Initiative/bbbi-mereka-brand-assets.git brand-assets
```

## Workflow Rules
1. **Read CLAUDE.md first** — Understand asset organization
2. **Maintain structure** — Follow existing directory conventions
3. **Update guides** — Keep MD/YAML/JSON in sync with PDF
4. **URL-encode spaces** — Legacy filenames may contain spaces
5. **Commit work** — Push changes before ending session

## Naming Conventions
- Logo files: `mereka-logo-{variant}-{size}.{ext}`
- Color files: `mereka-colors-{theme}.json`
- Use lowercase with hyphens for all file names

## Specs & Docs Convention

This project uses the **specs-vs-docs** convention from [team-skills](https://github.com/Biji-Biji-Initiative/team-skills).

- **Specs** (testable contracts): `specs/` — define WHAT MUST BE TRUE
- **Docs** (explanations): `docs/` — explain what IS and HOW TO USE IT
- **Config**: `specdocs.config.yml`

## Boundaries
- ✅ Always: Use approved assets only, follow naming conventions, check guidelines before use, keep MD/YAML/JSON in sync with PDF
- ⚠️ Ask First: Any new asset additions, guideline modifications, archive operations
- 🚫 Never: Modify master logo files, delete archived assets, commit unapproved variations

## Approval Process
New assets or guideline changes require:
1. Review by brand steward
2. Approval via pull request
3. Update to changelog in `guidelines/CHANGELOG.md`

## Landing the Plane (Session Completion)

When ending a work session, complete ALL steps below. Work is NOT complete until `git push` succeeds.

**Mandatory Workflow:**
```bash
git status && git add -A && git commit -m "..."
git push
```

1. File issues for remaining work
2. Run quality gates (if code changed)
3. Update issue status
4. Push to remote:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```

**Critical Rules:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing — that leaves work stranded locally
- If push fails, resolve and retry until it succeeds

---
Last updated: 2026-03-02
