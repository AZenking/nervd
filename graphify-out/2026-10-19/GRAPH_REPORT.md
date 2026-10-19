# Graph Report - nervd  (2026-10-13)

## Corpus Check
- 180 files · ~72,722 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5458 file(s) not represented in the graph (top: (none) 5454, .css 2, .icns 1)

## Summary
- 1380 nodes · 3493 edges · 64 communities (55 shown, 9 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 94 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6475aac0`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- yunxiao-api.md
- package.json
- compilerOptions
- tauri.conf.json
- client_of
- compilerOptions
- 750b9d590d1707041d53262ad95fb7c3cf977d200734c17652870af7be5b90de6dec87d6afa22c3efa71467c4b69309990c4a4ef7bf751ab85dff480cebe50-exec
- api.ts
- default.json
- credentials.rs
- react
- a8ecbebb45d5b46cf14a9287abcb3d65c59bd759a19d70838af785a4ddfc02b1109334d7f0b7224bf518e815eeaee9661c435caa0b5b0a63773fb4508fab84-exec
- a5948d42fda8d0e420bbcd66ccc32e1f630db93349e9ecd04001abf9919d47b6c798a439f5bc84aa85eaabed27f29d221519f1b3376f2aa6f115eb5ecd43e3-exec
- YunxiaoClient
- nervd
- 26872cce6206f89dc0718ecf64caffef60d656a098912a1bb89ff21fb92e4226468d7592aa20b3c5f4f21454d09d06fde0cb674b2f7e5fae4b1f138bcd9cec-exec
- workitem-trace.ts
- index.md
- app.ts
- api-mock.ts
- nervd IPC 契约 v1（并发任务的唯一事实源）
- cn
- DESIGN.md
- verify.sh
- nervd
- String
- RequirementDetails.tsx
- ci.rs
- combobox.tsx
- sidebar.tsx
- 6. 改造清单（带验收标准，按优先级）
- App.tsx
- settings-draft.ts
- BranchStateDiagram.tsx
- settings.rs
- useUi
- components.json
- nav-projects.tsx
- ui.ts
- dependencies
- utils.ts
- child-detail-drawer.tsx
- richtext.ts
- descriptions.tsx
- 0. 需要调整什么(执行清单)
- lucide-react
- StatusBadge.tsx
- types.ts
- dropdown-menu.tsx
- nav-main.tsx
- nervd UI 选型调研（2026-09）
- empty-hint.tsx
- stat.tsx
- vite.config.mts
- devDependencies
- scripts
- shortcuts-dialog.tsx
- iteration-branches.ts
- preview/tsconfig.json

## God Nodes (most connected - your core abstractions)
1. `cn()` - 230 edges
2. `react` - 56 edges
3. `useApp` - 52 edges
4. `lucide-react` - 35 edges
5. `client_of()` - 35 edges
6. `useUi` - 34 edges
7. `AppStore` - 33 edges
8. `Button()` - 32 edges
9. `org_of()` - 31 edges
10. `humanizeError()` - 29 edges

## Surprising Connections (you probably didn't know these)
- `Preview()` --calls--> `useApp`  [EXTRACTED]
  preview/main.tsx → src/store/app.ts
- `map_flow_run()` --calls--> `s()`  [INFERRED]
  src-tauri/src/commands/ci.rs → src-tauri/src/commands/common.rs
- `flow_runs()` --calls--> `as_array()`  [INFERRED]
  src-tauri/src/commands/ci.rs → src-tauri/src/commands/common.rs
- `flow_runs()` --calls--> `client_of()`  [INFERRED]
  src-tauri/src/commands/ci.rs → src-tauri/src/commands/common.rs
- `flow_runs()` --calls--> `org_of()`  [INFERRED]
  src-tauri/src/commands/ci.rs → src-tauri/src/commands/common.rs

## Import Cycles
- 3-file cycle: `src/store/app.ts -> src/store/ui.ts -> src/store/settings-draft.ts -> src/store/app.ts`

## Communities (64 total, 9 thin omitted)

### Community 0 - "yunxiao-api.md"
Cohesion: 0.09
Nodes (22): CreateBranch, CreateMergeRequest, GetMergeRequest, GetPipelineRun, GetWorkitemCommentList, GetWorkItemInfo, ListMergeRequests, ListOrganizations (+14 more)

### Community 1 - "package.json"
Cohesion: 0.11
Nodes (18): name, private, type, version, clsx, @fontsource/inter, react-dom, shadcn (+10 more)

### Community 2 - "compilerOptions"
Cohesion: 0.09
Nodes (21): compilerOptions, allowImportingTsExtensions, baseUrl, ignoreDeprecations, isolatedModules, jsx, lib, module (+13 more)

### Community 3 - "tauri.conf.json"
Cohesion: 0.11
Nodes (17): app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl, frontendDist (+9 more)

### Community 4 - "client_of"
Cohesion: 0.09
Nodes (74): as_array(), client_of(), ensure_write(), names_of(), nested_s(), org_of(), rebuild(), AppHandle (+66 more)

### Community 5 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, allowSyntheticDefaultImports, baseUrl, composite, ignoreDeprecations, module, moduleResolution, paths (+2 more)

### Community 6 - "750b9d590d1707041d53262ad95fb7c3cf977d200734c17652870af7be5b90de6dec87d6afa22c3efa71467c4b69309990c4a4ef7bf751ab85dff480cebe50-exec"
Cohesion: 0.33
Nodes (5): debugIndex, filterIndex, profileIndex, start(), ../dist/node/cli.js

### Community 7 - "api.ts"
Cohesion: 0.04
Nodes (4): WorkitemChildrenResult, WorkitemRow, WorkitemTypeOption, WorkitemSummary

### Community 8 - "default.json"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 9 - "credentials.rs"
Cohesion: 0.12
Nodes (28): Default, PathBuf, ACCOUNT, BranchRuleTemplate, DEFAULT_LINK_PATTERN, delete_jenkins_token(), delete_pat(), has_jenkins_token() (+20 more)

### Community 10 - "react"
Cohesion: 0.06
Nodes (77): react, ConfirmButton(), BaselineState, BranchDivergenceCheck(), CheckState, comparisonCommits(), EMPTY_DRAFT, IterationBranches() (+69 more)

### Community 12 - "a5948d42fda8d0e420bbcd66ccc32e1f630db93349e9ecd04001abf9919d47b6c798a439f5bc84aa85eaabed27f29d221519f1b3376f2aa6f115eb5ecd43e3-exec"
Cohesion: 0.50
Nodes (3): binStem, cli, path

### Community 13 - "YunxiaoClient"
Cohesion: 0.08
Nodes (36): Duration, Method, Mutex, AppStateInner, Arc, HashMap, Option, Settings (+28 more)

### Community 14 - "nervd"
Cohesion: 0.22
Nodes (8): nervd, UI 基准与占位说明, 关联规则, 它解决什么, 安全说明, 快速开始, 技术栈, 架构

### Community 18 - "workitem-trace.ts"
Cohesion: 0.21
Nodes (20): extractWorkItemKeys(), identifierNum(), matchesWorkitem(), asArray(), asString(), collectBranches(), detailBranches(), flowPipelineCandidates() (+12 more)

### Community 22 - "index.md"
Cohesion: 0.07
Nodes (20): src/ 一级结构（`src`）, 仓库总览, architecture 分区, ADR-NNN：<决策标题>, 决策, 后果, 背景, decisions 分区 (+12 more)

### Community 23 - "app.ts"
Cohesion: 0.09
Nodes (17): TracePipelineRun, WorkitemChild, workitemRepoIds(), AppStore, childrenRequests, LogViewState, pipelineRunRequests, repoCiRequests (+9 more)

### Community 24 - "api-mock.ts"
Cohesion: 0.04
Nodes (48): checkConnection(), ciSnapshots, compareBranches(), createBranch(), createdBranches, createdMergeRequests, createMergeRequest(), createWorkitemChild() (+40 more)

### Community 25 - "nervd IPC 契约 v1（并发任务的唯一事实源）"
Cohesion: 0.15
Nodes (12): 1. 文件所有权（任务分区，严格互斥）, 2. 凭证与设置模型, 3. Rust 模块布局（rust-backend）, 4. Tauri 命令清单（camelCase 自动映射；参数均为 owned String/基本类型）, 5. TS 数据层（ts-datalayer）, 6. 组件树（ui-views）, 7. 设计系统（theme-css）, 8. 验收（mission 内各自执行，主会话终验） (+4 more)

### Community 26 - "cn"
Cohesion: 0.06
Nodes (48): PropertyItem(), Alert(), AlertAction(), AlertDescription(), AlertTitle(), alertVariants, AvatarBadge(), AvatarGroup() (+40 more)

### Community 27 - "DESIGN.md"
Cohesion: 0.04
Nodes (47): A. 三层参照体系, B. 形态分工（决策表）, Border Radius Scale, Brand & Accent, Breakpoints, Buttons, C. Descriptions 使用要点, Cards & Containers (+39 more)

### Community 30 - "String"
Cohesion: 0.16
Nodes (26): JoinHandle, Response, CiRunSummary, JenkinsClient, JenkinsJobInfo, JenkinsJobParameter, JenkinsJobSummary, JenkinsLogChunk (+18 more)

### Community 31 - "RequirementDetails.tsx"
Cohesion: 0.13
Nodes (29): CiSummaryButton(), EmptyHint(), RepositoryRow(), StatusGroup, WorkitemItem, RepositoryCiDetails(), expandBranchPattern(), IterationBaselineCheck (+21 more)

### Community 32 - "ci.rs"
Cohesion: 0.18
Nodes (36): JenkinsConnection, JenkinsLogChunk, configured_connection(), delete_jenkins_token(), flow_runs(), get_jenkins_job(), get_jenkins_job_parameters(), get_repo_ci_log_chunk() (+28 more)

### Community 33 - "combobox.tsx"
Cohesion: 0.09
Nodes (25): @base-ui/react, SearchableSelectOption, ComboboxChip(), ComboboxChips(), ComboboxChipsInput(), ComboboxClear(), ComboboxContent(), ComboboxEmpty() (+17 more)

### Community 34 - "sidebar.tsx"
Cohesion: 0.09
Nodes (25): Sheet(), SheetContent(), SheetDescription(), SheetFooter(), SheetHeader(), SheetOverlay(), SheetTitle(), Sidebar() (+17 more)

### Community 35 - "6. 改造清单（带验收标准，按优先级）"
Cohesion: 0.07
Nodes (29): 1. 用户与任务（推断画像）, 2. 启发式评分（Nielsen 10，5 分制）, 3. 核心旅程走查, 4. 值得保持的亮点, 5. 问题清单, 6. 改造清单（带验收标准，按优先级）, 7. 中期路线（超出本轮清单）, A10（P1-10）详情页信息优先级 (+21 more)

### Community 36 - "App.tsx"
Cohesion: 0.10
Nodes (19): Preview(), @tauri-apps/plugin-opener, App(), jenkinsJobUrl(), openExternal(), ToastHost(), isEditableTarget(), Shell() (+11 more)

### Community 37 - "settings-draft.ts"
Cohesion: 0.10
Nodes (7): zustand, DirtyGuardDialog(), EMPTY_SETTINGS, SettingsDraftStore, RepoCiBinding, Settings, SettingsView

### Community 38 - "BranchStateDiagram.tsx"
Cohesion: 0.09
Nodes (22): BADGE_CLASS, BranchData, BranchNodeT, BranchStateDiagram(), BranchSyncRepo, DiagramNode, ErrorResult, HIDDEN_HANDLE (+14 more)

### Community 39 - "settings.rs"
Cohesion: 0.35
Nodes (23): BranchRuleTemplate, check_connection(), delete_pat(), get_settings(), list_projects(), AppHandle, AppState, Option (+15 more)

### Community 40 - "useUi"
Cohesion: 0.14
Nodes (11): CommandMenu(), IterationView(), rowKeyOf(), AppBreadcrumb(), AppSidebar(), NavMain(), FilterMenu(), NavProjects() (+3 more)

### Community 41 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 42 - "nav-projects.tsx"
Cohesion: 0.17
Nodes (14): Breadcrumb(), BreadcrumbEllipsis(), BreadcrumbItem(), BreadcrumbLink(), BreadcrumbList(), BreadcrumbPage(), BreadcrumbSeparator(), DropdownMenuCheckboxItem() (+6 more)

### Community 43 - "ui.ts"
Cohesion: 0.14
Nodes (17): CommandEntry, CommandGroup, GROUP_ORDER, applyWorkitemFilters(), assigneeOf(), buildWorkitemFilterOptions(), FilterableRow, guardSettingsDraft() (+9 more)

### Community 44 - "dependencies"
Cohesion: 0.11
Nodes (19): dependencies, @base-ui/react, class-variance-authority, clsx, cn, @fontsource/inter, lucide-react, react (+11 more)

### Community 45 - "utils.ts"
Cohesion: 0.15
Nodes (13): class-variance-authority, Skeleton(), Switch(), Tabs(), TabsContent(), TabsList(), tabsListVariants, TabsTrigger() (+5 more)

### Community 46 - "child-detail-drawer.tsx"
Cohesion: 0.15
Nodes (14): ChildDetailDrawer(), StatusBadge(), Drawer(), DrawerClose(), DrawerContent(), DrawerContext, DrawerContextProps, DrawerDescription() (+6 more)

### Community 47 - "richtext.ts"
Cohesion: 0.25
Nodes (16): RichDescription(), collectHtmlImages(), collectJsonMLImages(), extractRichImageUrls(), fromHtml(), htmlAttr(), imagePlaceholderLine(), imgNameOf() (+8 more)

### Community 48 - "descriptions.tsx"
Cohesion: 0.15
Nodes (14): CopyButton(), copyToClipboard(), columnClasses(), ColumnCount, DEFAULT_COLUMN, DescriptionCell(), Descriptions(), DescriptionsBreakpoint (+6 more)

### Community 49 - "0. 需要调整什么(执行清单)"
Cohesion: 0.14
Nodes (13): 0. 需要调整什么(执行清单), 1. 总体结论, 2. 关键交叉验证:浅蓝按钮的真相, 3. 合规亮点(保持,不要动), 4. 修复路线图, A. P1 —— 必须修(4 项,均有用户可感知的功能/语义影响), B. P2 —— 设计令牌收口(4 项,一次小重构全解决), C. P2 —— UX 修正(6 项) (+5 more)

### Community 50 - "lucide-react"
Cohesion: 0.24
Nodes (10): lucide-react, NavUser(), SETTINGS_SECTIONS, SettingsSectionMeta, SidebarContent(), SidebarFooter(), SidebarHeader(), SidebarMenu() (+2 more)

### Community 51 - "StatusBadge.tsx"
Cohesion: 0.22
Nodes (8): groupByStatus(), STATUS_TONE_ORDER, StatusIcon(), TONE_ICON, CANONICAL, statusMeta, StatusTone, toneOfChinese()

### Community 52 - "types.ts"
Cohesion: 0.17
Nodes (11): CiRunSummary, JenkinsConnection, JenkinsConnectionView, JenkinsJobParameter, JenkinsJobSummary, JenkinsLogChunk, OrgSummary, PipelineSummary (+3 more)

### Community 53 - "dropdown-menu.tsx"
Cohesion: 0.17
Nodes (7): DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuRadioItem(), DropdownMenuSeparator(), DropdownMenuShortcut(), DropdownMenuSubContent(), DropdownMenuSubTrigger()

### Community 54 - "nav-main.tsx"
Cohesion: 0.35
Nodes (8): NavCollapsibleGroup(), NavMainItem, Collapsible(), CollapsibleContent(), CollapsibleTrigger(), SidebarGroup(), SidebarMenuAction(), WorkspaceView

### Community 55 - "nervd UI 选型调研（2026-09）"
Cohesion: 0.20
Nodes (9): 1. 现状盘点, 2. 2026-09 生态事实（npm registry 实测，ego-browser 抓取）, 3. 结合 nervd 的逐项评估, 4. 建议路线, 5. 信息来源, nervd UI 选型调研（2026-09）, 何时重新评估 antd/Mantine, 方案 A（现在就做，推荐）：Base UI 原语 + 现有 CSS (+1 more)

### Community 56 - "empty-hint.tsx"
Cohesion: 0.33
Nodes (7): cn, Empty(), EmptyDescription(), EmptyHeader(), EmptyMedia(), emptyMediaVariants, EmptyTitle()

### Community 57 - "stat.tsx"
Cohesion: 0.22
Nodes (9): columnClasses(), DEFAULT_COLUMN, RESPONSIVE_COLUMN_CLASS, Stat(), StatBand(), StatBandProps, StatBreakpoint, StatColumnCount (+1 more)

### Community 58 - "vite.config.mts"
Cohesion: 0.32
Nodes (5): previewRoot, @tailwindcss/vite, vite, @vitejs/plugin-react, __dirname

### Community 59 - "devDependencies"
Cohesion: 0.29
Nodes (7): devDependencies, @tauri-apps/cli, @types/react, @types/react-dom, typescript, vite, @vitejs/plugin-react

### Community 60 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, dev:app, preview, preview:dev, tauri

### Community 61 - "shortcuts-dialog.tsx"
Cohesion: 0.29
Nodes (4): LIST_ROWS, NAV_ROWS, ShortcutRow, ShortcutsDialog()

### Community 62 - "iteration-branches.ts"
Cohesion: 0.62
Nodes (6): asObject(), branchArray(), branchPageHasMore(), findRemoteBranch(), parseBranchList(), stringField()

### Community 63 - "preview/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, noEmit, extends, include, ../tsconfig.json

## Knowledge Gaps
- **350 isolated node(s):** `../dist/cli.mjs`, `$schema`, `style`, `rsc`, `tsx` (+345 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 531 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `combobox.tsx`, `sidebar.tsx`, `App.tsx`, `useUi`, `react`, `ui.ts`, `nav-projects.tsx`, `utils.ts`, `child-detail-drawer.tsx`, `descriptions.tsx`, `lucide-react`, `StatusBadge.tsx`, `dropdown-menu.tsx`, `nav-main.tsx`, `empty-hint.tsx`, `stat.tsx`, `RequirementDetails.tsx`?**
  _High betweenness centrality (0.085) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `package.json`, `combobox.tsx`, `sidebar.tsx`, `App.tsx`, `BranchStateDiagram.tsx`, `nav-projects.tsx`, `ui.ts`, `utils.ts`, `child-detail-drawer.tsx`, `richtext.ts`, `descriptions.tsx`, `dropdown-menu.tsx`, `nav-main.tsx`, `stat.tsx`, `cn`, `RequirementDetails.tsx`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `package.json`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Are the 28 inferred relationships involving `client_of()` (e.g. with `flow_runs()` and `get_repo_ci_logs()`) actually correct?**
  _`client_of()` has 28 INFERRED edges - model-reasoned connections that need verification._
- **What connects `../dist/cli.mjs`, `$schema`, `style` to the rest of the system?**
  _350 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `yunxiao-api.md` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._