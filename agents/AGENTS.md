# Coding agent guide for Python projects

## Commands

- **Linting**: `uvx ruff check --fix src/`
- **Formatting**: `uvx ruff format src/`
- **Type checking**: `uvx ty check src/` (Do NOT use mypy)
- **Testing all**: `uv run pytest tests -v --tb=short`
- **Testing single**:
  `uv run pytest tests/path/to/test_file.py::test_function_name -v --tb=short`
- **Cleaning up**: `just clean` (removes cache directories)

## Code style

- **Python**:
  - Line length 88.
  - Use double quotes everywhere.
- **Imports**:
  - Use `from __future__ import annotations` if needed.
  - Use `TYPE_CHECKING` block for type-only imports.
- **Types**:
  - Strict typing required (`disallow_untyped_defs=true`).
  - Use `NDArray`, `Self`, type unions with `|`.
  - Do NOT use deprecated aliases like `typing.List`, `typing.Dict` etc.
  - Use an abstract collection type from `collections.abc` where possible.
  - All type hints must be complete and accurate.
- **Docstrings**:
  - Use NumPy style convention, max doc length 79 chars.
  - Use "or" instead of `|` in parameter type descriptions.
  - When writing docstrings, prioritise clarity over brevity.
  - Do NOT abbreviate words unless it would result in ridiculously long names.
  - Use British English spelling (e.g., "modelling", "optimise", "colour").
- **Logs and error messages**:
  - Use typed exception classes.
  - Begin messages with capital letter, no ending period.
  - Progress actions should end with `...`, e.g. "Loading data...".
  - In-text names should be quoted.
- **Naming**:
  - `snake_case` for functions/variables, `PascalCase` for classes, and
    `UPPER_CASE` for constants.
- **Data-Validation Models**:
  - Pydantic v2 BaseModel or SQLModel for data validation.
- **DataFrame operations**:
  - Always use `polars`. Do NOT use `pandas`.
- **Pre-commit**:
  - Runs ruff check + format.
  - No commits to main branch allowed.

## Code testing standards

- Write all Python tests using `pytest`. Do NOT use `unittest`.
- Tests should be placed in a `tests/` directory at the root of the project.
- If a module contains submodules, create a corresponding subdirectory as
  `tests/test_<module-name>/` and place tests for submodules there.
- Use descriptive function names starting with `test_`.
- Prefer fixtures over setup/teardown methods.
- Use assert statements directly, not `self.assertEqual`.

## Git commits

- ALWAYS use Conventional Commit messages (feat, fix, docs, test etc.).
- When committing multiple unrelated changes, commit them separately in
  logical groups.
- Show the plan before committing.

## High-impact actions (explicit approval required)

- Before running any high-impact command, ask for explicit approval in the
  same thread and wait.
- This confirmation template can be used:
  `I am ready to run: <exact command>. Reply with: APPROVE: <exact command>`.
- If approval is ambiguous, missing, or does not match the command, stop and
  do not run it.
- If unsure whether an action is high-impact, treat it as high-impact.

High-impact commands include:

- `git push` (any remot branch)
- `gh pr create`, `gh pr edit`, `gh pr merge`, `gh pr close`
- `git config` (local or global)
- Destructive git operations (`--force`, `reset --hard`, branch/tag deletion,
  history rewrites)

Default stop point when unclear: complete local edits only and ask before any
network or git state-changing action.

## Markdown standards

- ALWAYS run `markdownlint` on markdown files that are created or edited.
- If `markdownlint-cli` is not installed, ask user to install it.
- Fix all linting issues before completing the task.

## Notes

- ALWAYS use `uv` for Python commands. NEVER use pip or poetry.
- NEVER add any dependencies by yourself without asking. If a new dependency
  library is needed, ask user first and they will add it to the project.
- NEVER run git operations that change the git state, e.g. `git add`,
  `git commit`, `git push`. You may do ONLY read-only git operations without
  asking, e.g. `git status`, `git diff`, `git show`.
- Always prioritise code quality, readability, and maintainability.
- When in doubt, ask user for clarification.
