# Changelog

This is a fork of [GitNexus](https://github.com/abhigyanpatwari/GitNexus) with Delphi/Pascal language support added.

For the upstream changelog see: https://github.com/abhigyanpatwari/GitNexus/blob/main/CHANGELOG.md

## Fork changes

### Delphi/Pascal support (Steps 1–10)
- Added `tree-sitter-pascal` language provider
- Symbol extraction: classes, interfaces, methods, functions, procedures, constructors, destructors
- Import resolution (`uses` clause → unit file mapping)
- Cross-file CALLS edges (with defProc/declProc deduplication)
- Heritage (EXTENDS) edges
- DFM file pass-through (skipped — not analyzed)
- CLI binary renamed to `gitnexus-delphi`
