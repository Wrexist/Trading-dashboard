# LEARNINGS.md

Hard-won lessons — things that broke, surprised us, or must not be repeated. Append-only; date every entry.

## 2026-07-04 — `.env` got committed to main

A `.env` was created via the GitHub UI ("Create .env", commit 6eb4c9c) and became a *tracked* file. It contained only empty values, so nothing leaked — but `.gitignore` does not protect files that are already tracked, so the first real key committed would have gone public. Fixed with `git rm --cached .env`. Rule: `.env` is edited only locally, never through the GitHub web UI, and `git status` must never show it.
