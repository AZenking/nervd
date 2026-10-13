# Graph Report - nervd  (2026-09-28)

## Corpus Check
- 84 files · ~14,616 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5457 file(s) not represented in the graph (top: (none) 5454, .icns 1, .ico 1)

## Summary
- 388 nodes · 723 edges · 30 communities (20 shown, 10 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `46a8ee0f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- yunxiao-api.md
- package.json
- compilerOptions
- tauri.conf.json
- commands.rs
- compilerOptions
- 750b9d590d1707041d53262ad95fb7c3cf977d200734c17652870af7be5b90de6dec87d6afa22c3efa71467c4b69309990c4a4ef7bf751ab85dff480cebe50-exec
- default.json
- credentials.rs
- useApp
- a8ecbebb45d5b46cf14a9287abcb3d65c59bd759a19d70838af785a4ddfc02b1109334d7f0b7224bf518e815eeaee9661c435caa0b5b0a63773fb4508fab84-exec
- a5948d42fda8d0e420bbcd66ccc32e1f630db93349e9ecd04001abf9919d47b6c798a439f5bc84aa85eaabed27f29d221519f1b3376f2aa6f115eb5ecd43e3-exec
- YunxiaoClient
- nervd
- 26872cce6206f89dc0718ecf64caffef60d656a098912a1bb89ff21fb92e4226468d7592aa20b3c5f4f21454d09d06fde0cb674b2f7e5fae4b1f138bcd9cec-exec
- app.ts
- index.md
- AppStore
- poller.rs
- nervd IPC 契约 v1（并发任务的唯一事实源）
- WorkitemDetail.tsx
- link.ts
- verify.sh
- nervd

## God Nodes (most connected - your core abstractions)
1. `client_of()` - 25 edges
2. `useApp` - 23 edges
3. `org_of()` - 22 edges
4. `AppStore` - 19 edges
5. `compilerOptions` - 16 edges
6. `YunxiaoClient` - 13 edges
7. `list_projects()` - 11 edges
8. `list_workitems()` - 11 edges
9. `ensure_write()` - 10 edges
10. `save_settings()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `client_of()` --references--> `YunxiaoClient`  [EXTRACTED]
  src-tauri/src/commands.rs → src-tauri/src/yunxiao.rs
- `scan_once()` --references--> `YunxiaoClient`  [EXTRACTED]
  src-tauri/src/poller.rs → src-tauri/src/yunxiao.rs
- `App()` --calls--> `useApp`  [EXTRACTED]
  src/App.tsx → src/store/app.ts
- `PipelineCard()` --calls--> `useApp`  [EXTRACTED]
  src/components/PipelineCard.tsx → src/store/app.ts
- `ToastHost()` --calls--> `useApp`  [EXTRACTED]
  src/components/Shell.tsx → src/store/app.ts

## Import Cycles
- None detected.

## Communities (30 total, 10 thin omitted)

### Community 0 - "yunxiao-api.md"
Cohesion: 0.09
Nodes (21): CreateBranch, CreateMergeRequest, GetMergeRequest, GetPipelineRun, GetWorkitemCommentList, GetWorkItemInfo, ListMergeRequests, ListOrganizations (+13 more)

### Community 1 - "package.json"
Cohesion: 0.05
Nodes (40): dependencies, @fontsource/ibm-plex-mono, @fontsource/ibm-plex-sans, lucide-react, react, react-dom, @tauri-apps/api, @tauri-apps/plugin-notification (+32 more)

### Community 2 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+10 more)

### Community 3 - "tauri.conf.json"
Cohesion: 0.11
Nodes (17): app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl, frontendDist (+9 more)

### Community 4 - "commands.rs"
Cohesion: 0.24
Nodes (44): as_array(), check_connection(), chrono_ms_to_local(), civil_from_days(), client_of(), create_branch(), create_merge_request(), delete_pat() (+36 more)

### Community 5 - "compilerOptions"
Cohesion: 0.25
Nodes (7): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, include

### Community 6 - "750b9d590d1707041d53262ad95fb7c3cf977d200734c17652870af7be5b90de6dec87d6afa22c3efa71467c4b69309990c4a4ef7bf751ab85dff480cebe50-exec"
Cohesion: 0.33
Nodes (5): debugIndex, filterIndex, profileIndex, start(), ../dist/node/cli.js

### Community 8 - "default.json"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 9 - "credentials.rs"
Cohesion: 0.17
Nodes (19): Default, PathBuf, ACCOUNT, DEFAULT_LINK_PATTERN, delete_pat(), LEGACY_LINK_PATTERN, load_pat(), load_settings() (+11 more)

### Community 10 - "useApp"
Cohesion: 0.23
Nodes (12): react, LogViewer(), SettingsView(), Shell(), ToastHost(), CATS, TracePane(), BranchForm() (+4 more)

### Community 12 - "a5948d42fda8d0e420bbcd66ccc32e1f630db93349e9ecd04001abf9919d47b6c798a439f5bc84aa85eaabed27f29d221519f1b3376f2aa6f115eb5ecd43e3-exec"
Cohesion: 0.50
Nodes (3): binStem, cli, path

### Community 13 - "YunxiaoClient"
Cohesion: 0.16
Nodes (15): Client, Method, Mutex, AppStateInner, Arc, Option, Settings, BASE (+7 more)

### Community 14 - "nervd"
Cohesion: 0.25
Nodes (7): nervd, 关联规则, 它解决什么, 安全说明, 快速开始, 技术栈, 架构

### Community 18 - "app.ts"
Cohesion: 0.15
Nodes (13): Toast, BranchInfo, CommitSummary, ConnectionState, MrSummary, OrgSummary, PipelineSummary, RepoSummary (+5 more)

### Community 22 - "index.md"
Cohesion: 0.07
Nodes (20): src/ 一级结构（`src`）, 仓库总览, architecture 分区, ADR-NNN：<决策标题>, 决策, 后果, 背景, decisions 分区 (+12 more)

### Community 23 - "AppStore"
Cohesion: 0.20
Nodes (5): App(), PipelineCard(), Sidebar(), AppStore, Category

### Community 24 - "poller.rs"
Cohesion: 0.23
Nodes (12): Duration, HashMap, MAX_PIPELINES, POLL_INTERVAL, AppHandle, AppState, Arc, Result (+4 more)

### Community 25 - "nervd IPC 契约 v1（并发任务的唯一事实源）"
Cohesion: 0.17
Nodes (11): 1. 文件所有权（任务分区，严格互斥）, 2. 凭证与设置模型, 3. Rust 模块布局（rust-backend）, 4. Tauri 命令清单（camelCase 自动映射；参数均为 owned String/基本类型）, 5. TS 数据层（ts-datalayer）, 6. 组件树（ui-views）, 7. 设计系统（theme-css）, 8. 验收（mission 内各自执行，主会话终验） (+3 more)

### Community 26 - "WorkitemDetail.tsx"
Cohesion: 0.27
Nodes (6): TRIGGER, StatusDot(), StatusForm(), WriteOpButton(), PipelineRunSummary, WorkitemSummary

### Community 27 - "link.ts"
Cohesion: 0.83
Nodes (3): extractWorkItemKeys(), identifierNum(), matchesWorkitem()

## Knowledge Gaps
- **142 isolated node(s):** `../dist/cli.mjs`, `name`, `private`, `version`, `type` (+137 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 208 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `YunxiaoClient` connect `YunxiaoClient` to `poller.rs`, `commands.rs`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `react` connect `useApp` to `package.json`, `WorkitemDetail.tsx`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `zustand` connect `package.json` to `app.ts`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `../dist/cli.mjs`, `name`, `private` to the rest of the system?**
  _142 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `yunxiao-api.md` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.04878048780487805 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._