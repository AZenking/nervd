# Graph Report - nervd  (2026-09-28)

## Corpus Check
- 65 files · ~6,765 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5457 file(s) not represented in the graph (top: (none) 5454, .icns 1, .ico 1)

## Summary
- 182 nodes · 167 edges · 24 communities (13 shown, 11 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- yunxiao-api.md
- package.json
- compilerOptions
- tauri.conf.json
- dependencies
- compilerOptions
- 750b9d590d1707041d53262ad95fb7c3cf977d200734c17652870af7be5b90de6dec87d6afa22c3efa71467c4b69309990c4a4ef7bf751ab85dff480cebe50-exec
- devDependencies
- default.json
- scripts
- react
- a8ecbebb45d5b46cf14a9287abcb3d65c59bd759a19d70838af785a4ddfc02b1109334d7f0b7224bf518e815eeaee9661c435caa0b5b0a63773fb4508fab84-exec
- a5948d42fda8d0e420bbcd66ccc32e1f630db93349e9ecd04001abf9919d47b6c798a439f5bc84aa85eaabed27f29d221519f1b3376f2aa6f115eb5ecd43e3-exec
- lib.rs
- Tauri + React + Typescript
- 26872cce6206f89dc0718ecf64caffef60d656a098912a1bb89ff21fb92e4226468d7592aa20b3c5f4f21454d09d06fde0cb674b2f7e5fae4b1f138bcd9cec-exec
- scaffold-tmp
- index.md
- Repository Wiki

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `compilerOptions` - 6 edges
3. `Repository Wiki` - 6 edges
4. `scripts` - 5 edges
5. `build` - 5 edges
6. `bundle` - 4 edges
7. `ADR-NNN：<决策标题>` - 4 edges
8. `react` - 3 edges
9. `app` - 3 edges
10. `App()` - 3 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (24 total, 11 thin omitted)

### Community 0 - "yunxiao-api.md"
Cohesion: 0.09
Nodes (21): CreateBranch, CreateMergeRequest, GetMergeRequest, GetPipelineRun, GetWorkitemCommentList, GetWorkItemInfo, ListMergeRequests, ListOrganizations (+13 more)

### Community 1 - "package.json"
Cohesion: 0.11
Nodes (18): name, private, type, version, @fontsource/ibm-plex-mono, @fontsource/ibm-plex-sans, lucide-react, react-dom (+10 more)

### Community 2 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+10 more)

### Community 3 - "tauri.conf.json"
Cohesion: 0.11
Nodes (17): app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl, frontendDist (+9 more)

### Community 4 - "dependencies"
Cohesion: 0.20
Nodes (10): dependencies, @fontsource/ibm-plex-mono, @fontsource/ibm-plex-sans, lucide-react, react, react-dom, @tauri-apps/api, @tauri-apps/plugin-notification (+2 more)

### Community 5 - "compilerOptions"
Cohesion: 0.25
Nodes (7): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, include

### Community 6 - "750b9d590d1707041d53262ad95fb7c3cf977d200734c17652870af7be5b90de6dec87d6afa22c3efa71467c4b69309990c4a4ef7bf751ab85dff480cebe50-exec"
Cohesion: 0.33
Nodes (5): debugIndex, filterIndex, profileIndex, start(), ../dist/node/cli.js

### Community 7 - "devDependencies"
Cohesion: 0.29
Nodes (7): devDependencies, @tauri-apps/cli, @types/react, @types/react-dom, typescript, vite, @vitejs/plugin-react

### Community 8 - "default.json"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 9 - "scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, preview, tauri

### Community 12 - "a5948d42fda8d0e420bbcd66ccc32e1f630db93349e9ecd04001abf9919d47b6c798a439f5bc84aa85eaabed27f29d221519f1b3376f2aa6f115eb5ecd43e3-exec"
Cohesion: 0.50
Nodes (3): binStem, cli, path

### Community 22 - "index.md"
Cohesion: 0.08
Nodes (14): src/ 一级结构（`src`）, 仓库总览, architecture 分区, ADR-NNN：<决策标题>, 决策, 后果, 背景, decisions 分区 (+6 more)

### Community 23 - "Repository Wiki"
Cohesion: 0.33
Nodes (6): architecture, decisions, domains, glossary, infrastructure, Repository Wiki

## Knowledge Gaps
- **116 isolated node(s):** `../dist/cli.mjs`, `name`, `private`, `version`, `type` (+111 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 138 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `package.json`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `devDependencies` to `package.json`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `scripts` connect `scripts` to `package.json`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `../dist/cli.mjs`, `name`, `private` to the rest of the system?**
  _116 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `yunxiao-api.md` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._