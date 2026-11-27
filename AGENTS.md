# Project Engineering Standards & Skills (Offline-Cpp-for-ipad)

## 1. Architecture & Offline Constraints (Fullstack Web Craftsman)
- **Stack:** Vite + React + TypeScript (static build for GitHub Pages, `base: './'`).
- **100% Offline Invariant:** Zero runtime network requests. Never add external CDN scripts, Google Fonts, cloud compilers, or online-only packages. All assets, WASM/JS interpreters, and Service Worker caches must bundle locally.
- **iPadOS Safari First:**
  - Never use `window.showDirectoryPicker` or `SharedArrayBuffer` (unsupported/restricted in iPadOS Safari PWA).
  - Keep all interactive touch targets (`Run`, `Stop`, file tabs, buttons) at least `44px × 44px`.
  - Support iPad Split View / Slide Over (`overflow-x: auto` on wide tables/consoles, responsive layout below `768px`).
  - Use `font-variant-numeric: tabular-nums` for line numbers, execution timers, and memory readouts.

## 2. Systematic Debugging & Root-Cause Protocol
- **Root-Cause Isolation Before Patching:** Before editing code to fix a bug, trace the exact failure layer:
  1. Editor / UI state synchronization (`src/` components)
  2. Virtual File System / `<fstream>` / `IndexedDB` sync layer
  3. C++ lexer, parser, preprocessor, or runtime execution engine
- **Fix the Invariant, Not Symptoms:** Never add ad-hoc hacks for single test cases when a stream, pointer, or parser rule is broken.
- **No Silent Failures:** Never swallow runtime or storage errors with empty `catch {}` blocks. Surface clear diagnostic errors in the console/UI.

## 3. Code Editing & Verification Gates
- **Minimal Diff:** Modify ONLY the files required for the current task. Do not refactor unrelated files or overwrite working UI styles.
- **Preserve Stream & Parser Edge Cases:** Never simplify or delete existing handling for `std::cin >>`, `std::ws`, `putback`, `std::flush`, `<sstream>`, `<vector>`, or pointer arithmetic.
- **Complete Output:** Always write full, valid TypeScript/React code. Never truncate files with `// ... existing code ...`.
- **Pre-Finish Self-Check:** Before finalizing any response, verify all imports, TypeScript types, offline PWA cache patterns in `vite.config.ts`, and `IndexedDB` state sync.
