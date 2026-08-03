default:
    @just --list

clean:
    @find . -type d -name "__pycache__" -exec rm -rf {} +
    @find . -type d -name ".pytest_cache" -exec rm -rf {} +
    @find . -type d -name ".ruff_cache" -exec rm -rf {} +

lint:
    @uv run ruff check --fix src/

format:
    @uv run ruff format src/

typecheck:
    @uv run ty check src/

test:
    @uv run --python 3.12 --with tensorflow-cpu --extra torch-cpu pytest -v --tb=short tests/
