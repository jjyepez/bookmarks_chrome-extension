# Agent Directives

## Project Context
Main workspace for software development tasks.

## Conventions

### Language
- Always respond to the user in **concise neutral US Latin American Spanish** unless explicitly asked otherwise.
- Keep messages concise and direct.

### Efficiency
- Use tools only when necessary.
- Avoid repetition and unnecessary verbosity.
- Prioritize simple and maintainable solutions.
- Use concise English for specification files.
- Internal reasoning must always be in concise English.

### Code Changes
- Make minimal changes to achieve the goal.
- Follow the existing code style.
- Test after modifying code when applicable.

### Git
- Adopt **Gitflow** as the standard workflow (manual, no tool).
- **Branches**: `main` (production), `develop` (integration), `feature/*`, `hotfix/*`, `release/*`.
- Do not commit directly to `main` or `develop`; always use feature/hotfix branches.
- Feature branches branch from `develop` and merge back into `develop`.
- Hotfixes branch from `main` and merge into both `main` and `develop`.
- Do not run `commit`, `push`, `reset`, `rebase`, or similar mutations unless explicitly requested.
