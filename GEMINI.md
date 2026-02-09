## Specs & Docs Convention

This project uses the **specs-vs-docs** convention from [team-skills](https://github.com/Biji-Biji-Initiative/team-skills).

### Quick Reference
- **Specs** (testable contracts): `specs/` — define WHAT MUST BE TRUE
- **Docs** (explanations): `docs/` — explain what IS and HOW TO USE IT
- **Config**: `specdocs.config.yml`

### Rules
- Before implementing any feature, check if a spec exists in `specs/`
- Specs use normative language: MUST, SHOULD, MAY (RFC 2119)
- Acceptance Criteria use stable IDs: `AC-001`, `AC-002`, etc.
- Each AC maps to a verification method (automated/monitoring/manual)

### Key Tools
| Tool | Purpose |
|------|---------|
| `spec_lint.py specs/` | Lint specs for structure compliance |
| `spec_verify.py specs/` | Verify AC-IDs + testmap coverage |
| `spec_fix.py specs/ --add-ac-ids` | Bulk-add AC-IDs to checkboxes |

### Spec Template
New specs should follow `specs/_TEMPLATE.md`. Required sections: Scope, Non-goals, Requirements, Acceptance Criteria, Edge Cases, Observability, Rollout & Rollback, Open Questions.
