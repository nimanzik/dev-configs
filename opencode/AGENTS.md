# Agent guide for Python projects

## Commands

- **Linting**: `uv run ruff check --fix src/`
- **Formatting**: `uv run ruff format src/`
- **Type checking**: `uv run ty check src/` (DO NOT use mypy)
- **Testing all**: `uv run pytest tests -v`
- **Testing single**: `uv run pytest tests/path/to/test_file.py::test_function_name -v`
- **Cleaning up**: `just clean` (removes cache directories)

## Code style

- **Python**:
  - Line length 88.
  - Use double quotes everywhere.
- **Imports**:
  - Use `from __future__ import annotations`.
  - Use `TYPE_CHECKING` block for type-only imports.
- **Types**:
  - Strict typing required (`disallow_untyped_defs=true`).
  - Use `NDArray`, `Self`, type unions with `|`.
  - Do not use deprecated aliases like `typing.List`, `typing.Dict` etc.
  - Use an abstract collection type from `collections.abc` where possible.
- **Docstrings**:
  - Use NumPy style convention, max doc length 79 chars.
  - Use "or" instead of `|` in parameter type descriptions.
- **Logs and error messages**:
  - Custom exceptions in `aikit.exceptions`.
  - Use typed exception classes.
  - Begin messages with capital letter, no ending period.
  - Progress actions should end with `...`, e.g. "Loading data...".
  - In-text names should be quoted.
- **Naming**:
  - `snake_case` for functions/variables, `PascalCase` for classes, `UPPER_CASE` for constants.
- **Models**:
  - Pydantic v2 BaseModel or SQLModel for data validation.
- **DataFrame operations**:
  - Always use `polars`. DO NOT use `pandas`.
- **Pre-commit**:
  - Runs ruff check + format.
  - No commits to main branch allowed.

## Code testing standards

- Write all Python tests using `pytest`. DO NOT use `unittest`
- Use descriptive function names starting with `test_`
- Prefer fixtures over setup/teardown methods
- Use assert statements directly, not `self.assertEqual`

## Markdown standards

- Always run `markdownlint` on any markdown files created or edited.
- If `markdownlint-cli` is not installed, DO NOT install it by yoursef. Ask me, so I will install it.
- Fix all linting issues before completing the task.

## Notes

- Use `uv` for all Python commands (not pip/poetry).
- DO NOT add any dependencies by yoursef. Ask me, so I will install them.
- All type hints must be complete and accurate.
- Tests under `tests/` mirror `src/<project-name>/` structure.
- When you need to search docs, use `context7` tools.
- DO NOT abbreviate words unless it would result in ridiculously long names.
- Use British English spelling (e.g., "modelling", "optimise", "colour").
- When writing docstrings, prioritise clarity over brevity.
- When in doubt, ask me for clarification.
