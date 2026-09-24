# AxWise public distribution tooling

This directory owns the explicit export boundary, deterministic wheel/npm builders and launcher templates for AxWise 0.3.0. It does not change the managed `@orqaly/axwise-local` launcher. `PUBLIC_README.md` becomes the standalone repository's root README; `pyproject.toml` becomes its root build metadata.

Run `python3 build.py --source-root /absolute/source/root --output /absolute/new/output` from this directory or use the script's full path. Output must not already exist and must be outside the source checkout. The builder never traverses or copies an entire input directory. Every original source, test and builder file is named in `manifest.py`; a missing file, symlink or changed kernel dependency pins fails the export.

Generated artifacts are `axwise_extension-0.3.0-py3-none-any.whl`, `axwise-extension-0.3.0.tgz`, and `axwise_extension-0.3.0.tar.gz`. The npm archive contains the identical wheel. A source manifest and release manifest record SHA-256 hashes. Filenames and timestamps are stable; reproducibility is measured using the same Python toolchain. Publication is a separate explicitly authorized action. Nothing here runs a registry publish, Git push, credential lookup or deployment.

Testing: `python3 -m unittest discover -s packages/axwise-distribution -p 'test_*.py'` from the source root. For fresh-cache uv/npm installation and MCP checks run `python3 packages/axwise-distribution/smoke.py --artifacts /absolute/output/artifacts --work /absolute/new/smoke-directory`; it requires Node>=22, npm, uv and network access to the configured Python package index. It calls only initialize and tools/list, not paid inference. A successful smoke is not a live provider quality benchmark.
