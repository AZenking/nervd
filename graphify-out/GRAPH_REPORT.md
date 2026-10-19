# Graph Report - nervd  (2026-10-19)

## Corpus Check
- 278 files · ~169,185 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5458 file(s) not represented in the graph (top: (none) 5454, .css 2, .icns 1)

## Summary
- 1941 nodes · 5373 edges · 98 communities (86 shown, 12 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 109 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ed210ea7`
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
- nervd 布局与形态规范
- verify.sh
- nervd
- String
- table.tsx
- ci.rs
- searchable-select.tsx
- sidebar.tsx
- 6. 改造清单（带验收标准，按优先级）
- toast.tsx
- SettingsView.tsx
- BranchStateDiagram.tsx
- settings.rs
- useUi
- components.json
- app-breadcrumb.tsx
- ui.ts
- dependencies
- class-variance-authority
- LogViewer.tsx
- requirement-activity.tsx
- descriptions.tsx
- 0. 需要调整什么(执行清单)
- nav-user.tsx
- IterationView.tsx
- src/types.ts
- linked-repo-card.tsx
- JenkinsBuildDialog.tsx
- nervd UI 选型调研（2026-09）
- RequirementDetails.tsx
- stat.tsx
- vite.config.mts
- devDependencies
- scripts
- RepositoryCiDetails.tsx
- iteration-branches.ts
- preview/tsconfig.json
- ai.rs
- useApp
- nervd 功能测试用例与 E2E 测试指南
- AboutSection.tsx
- children-card.tsx
- fixtures.ts
- LandingView.tsx
- App.tsx
- updater.rs
- sleep
- gate
- WriteOpButton.tsx
- field.tsx
- store/updater.ts
- nervd 智能助手开发指引 (AGENTS.md)
- iteration-templates.ts
- DESIGN.md
- Layout
- error-boundary.tsx
- Components
- 2. 核心业务模块与设计逻辑
- release-local.sh
- 3. UI 参照与设计系统规范 (Deep Linear Alignment)
- 5. 安全受控写操作规范 (Write Operations Defense)
- Colors
- Typography
- vitest
- test.sh
- ai-breakdown-tags.tsx
- fuzzy.ts
- createBranch
- createMergeRequest
- listWorkitems
- vitest.config.ts

## God Nodes (most connected - your core abstractions)
1. `cn()` - 284 edges
2. `useApp` - 102 edges
3. `react` - 89 edges
4. `lucide-react` - 63 edges
5. `useUi` - 61 edges
6. `AppStore` - 49 edges
7. `Button()` - 48 edges
8. `client_of()` - 38 edges
9. `org_of()` - 33 edges
10. `humanizeError()` - 30 edges

## Surprising Connections (you probably didn't know these)
- `ToastHost()` --calls--> `useApp`  [EXTRACTED]
  preview/main.tsx → src/store/app.ts
- `Preview()` --calls--> `useUi`  [EXTRACTED]
  preview/main.tsx → src/store/ui.ts
- `LandingView()` --calls--> `useUi`  [EXTRACTED]
  preview/landing/LandingView.tsx → src/store/ui.ts
- `Preview()` --calls--> `dismissSplashScreen()`  [EXTRACTED]
  preview/main.tsx → src/lib/splash.ts
- `Preview()` --calls--> `useApp`  [EXTRACTED]
  preview/main.tsx → src/store/app.ts

## Import Cycles
- 3-file cycle: `src/store/app.ts -> src/store/ui.ts -> src/store/settings-draft.ts -> src/store/app.ts`

## Communities (98 total, 12 thin omitted)

### Community 0 - "yunxiao-api.md"
Cohesion: 0.09
Nodes (22): CreateBranch, CreateMergeRequest, GetMergeRequest, GetPipelineRun, GetWorkitemCommentList, GetWorkItemInfo, ListMergeRequests, ListOrganizations (+14 more)

### Community 1 - "package.json"
Cohesion: 0.09
Nodes (22): name, private, type, version, clsx, @fontsource/inter, jsdom, react-dom (+14 more)

### Community 2 - "compilerOptions"
Cohesion: 0.09
Nodes (21): compilerOptions, allowImportingTsExtensions, baseUrl, ignoreDeprecations, isolatedModules, jsx, lib, module (+13 more)

### Community 3 - "tauri.conf.json"
Cohesion: 0.11
Nodes (17): app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl, frontendDist (+9 more)

### Community 4 - "client_of"
Cohesion: 0.09
Nodes (83): as_array(), client_of(), ensure_write(), fetch_all_codeup_pages(), i64_of(), ids_of(), names_of(), nested_s() (+75 more)

### Community 5 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, allowSyntheticDefaultImports, baseUrl, composite, ignoreDeprecations, module, moduleResolution, paths (+2 more)

### Community 6 - "750b9d590d1707041d53262ad95fb7c3cf977d200734c17652870af7be5b90de6dec87d6afa22c3efa71467c4b69309990c4a4ef7bf751ab85dff480cebe50-exec"
Cohesion: 0.33
Nodes (5): debugIndex, filterIndex, profileIndex, start(), ../dist/node/cli.js

### Community 7 - "api.ts"
Cohesion: 0.04
Nodes (3): TracePipelineRun, WorkitemChildrenResult, PipelineRunSummary

### Community 8 - "default.json"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 9 - "credentials.rs"
Cohesion: 0.12
Nodes (28): ACCOUNT, BranchRuleTemplate, DEFAULT_LINK_PATTERN, delete_jenkins_token(), delete_pat(), has_jenkins_token(), jenkins_account(), JenkinsConnection (+20 more)

### Community 10 - "react"
Cohesion: 0.12
Nodes (29): react, EMPTY_DRAFT, AiReleaseNotesDialog(), AiReleaseNotesDialogProps, KeyboardPagination(), KeyboardPaginationProps, AiBreakdownDialogProps, AssigneeCandidate (+21 more)

### Community 12 - "a5948d42fda8d0e420bbcd66ccc32e1f630db93349e9ecd04001abf9919d47b6c798a439f5bc84aa85eaabed27f29d221519f1b3376f2aa6f115eb5ecd43e3-exec"
Cohesion: 0.50
Nodes (3): binStem, cli, path

### Community 13 - "YunxiaoClient"
Cohesion: 0.07
Nodes (40): Duration, Method, Mutex, AppStateInner, AppHandle, Arc, HashMap, Option (+32 more)

### Community 14 - "nervd"
Cohesion: 0.11
Nodes (18): 1. 迭代工作台 (Iteration View), 2. 需求详情工作台 (Master-Detail Continuous Inspection), 3. 集成分支视图 (Integration Branches View), 4. 实时构建日志与系统集成 (LogViewer & Notifications), 5. 双重受控安全防护 (Security & Keychain), nervd, 全键盘交互指南 (Keyboard-First), 在线体验 (Live Demo) (+10 more)

### Community 18 - "workitem-trace.ts"
Cohesion: 0.21
Nodes (19): extractWorkItemKeys(), identifierNum(), matchesWorkitem(), workitemRepoIds(), asArray(), asString(), collectBranches(), detailBranches() (+11 more)

### Community 22 - "index.md"
Cohesion: 0.07
Nodes (20): src/ 一级结构（`src`）, 仓库总览, architecture 分区, ADR-NNN：<决策标题>, 决策, 后果, 背景, decisions 分区 (+12 more)

### Community 23 - "app.ts"
Cohesion: 0.05
Nodes (22): OverviewView(), SettingsView(), CurrentYunxiaoUser, DEFAULT_HIGHLIGHT_SETTINGS, loadHighlightSettings(), matchWorkitemUser(), saveHighlightSettings(), WorkitemHighlightMatch (+14 more)

### Community 24 - "api-mock.ts"
Cohesion: 0.05
Nodes (26): ciSnapshots, createdBranches, createdMergeRequests, generatedRows, items, iterations, jenkinsJobs, jenkinsParameters (+18 more)

### Community 25 - "nervd IPC 契约 v1（并发任务的唯一事实源）"
Cohesion: 0.15
Nodes (12): 1. 文件所有权（任务分区，严格互斥）, 2. 凭证与设置模型, 3. Rust 模块布局（rust-backend）, 4. Tauri 命令清单（camelCase 自动映射；参数均为 owned String/基本类型）, 5. TS 数据层（ts-datalayer）, 6. 组件树（ui-views）, 7. 设计系统（theme-css）, 8. 验收（mission 内各自执行，主会话终验） (+4 more)

### Community 26 - "cn"
Cohesion: 0.09
Nodes (34): AlertDialogMedia(), AlertDialogOverlay(), Card(), CardAction(), CardContent(), CardDescription(), CardFooter(), CardHeader() (+26 more)

### Community 27 - "nervd 布局与形态规范"
Cohesion: 0.18
Nodes (11): A. 三层参照体系, B. 形态分工（决策表）, C. Descriptions 使用要点, D.1 气质基准（整体参照）, D.2 统计带组件化（Tremor 思路）, D.3 token 层参照（Tailwind / shadcn 后台）, D.4 页面形态参照（任务 / 迭代管理面板）, D. 视觉参照（Pinterest 实例链接） (+3 more)

### Community 30 - "String"
Cohesion: 0.16
Nodes (28): JoinHandle, CiRunSummary, JenkinsClient, JenkinsJobInfo, JenkinsJobParameter, JenkinsJobSummary, JenkinsLogChunk, JenkinsPipelineStage (+20 more)

### Community 31 - "table.tsx"
Cohesion: 0.22
Nodes (9): TableEmptyRow(), Table(), TableBody(), TableCaption(), TableCell(), TableFooter(), TableHead(), TableHeader() (+1 more)

### Community 32 - "ci.rs"
Cohesion: 0.20
Nodes (35): JenkinsConnection, JenkinsLogChunk, configured_connection(), delete_jenkins_token(), flow_runs(), get_jenkins_job(), get_jenkins_job_parameters(), get_repo_ci_log_chunk() (+27 more)

### Community 33 - "searchable-select.tsx"
Cohesion: 0.10
Nodes (24): @base-ui/react, AUTO_VIRTUALIZE_THRESHOLD, computeVirtualSlice(), SearchableSelectOption, VIRTUAL_CONTAINER_HEIGHT, VIRTUAL_ITEM_HEIGHT, VIRTUAL_OVERSCAN, VirtualComboboxList() (+16 more)

### Community 34 - "sidebar.tsx"
Cohesion: 0.07
Nodes (39): NavCollapsibleGroup(), NavMain(), NavMainItem, Sheet(), SheetContent(), SheetDescription(), SheetFooter(), SheetHeader() (+31 more)

### Community 35 - "6. 改造清单（带验收标准，按优先级）"
Cohesion: 0.07
Nodes (29): 1. 用户与任务（推断画像）, 2. 启发式评分（Nielsen 10，5 分制）, 3. 核心旅程走查, 4. 值得保持的亮点, 5. 问题清单, 6. 改造清单（带验收标准，按优先级）, 7. 中期路线（超出本轮清单）, A10（P1-10）详情页信息优先级 (+21 more)

### Community 36 - "toast.tsx"
Cohesion: 0.17
Nodes (7): ToastAction(), ToastClose(), ToastContent(), ToastDescription(), Toaster(), ToastTitle(), ToastViewport()

### Community 37 - "SettingsView.tsx"
Cohesion: 0.06
Nodes (36): zustand, BranchRulesSection(), CiSection(), ConnectionSection(), SecuritySection(), SETTINGS_SECTIONS, SettingsSectionMeta, DevBranchSettingRow() (+28 more)

### Community 38 - "BranchStateDiagram.tsx"
Cohesion: 0.08
Nodes (23): @xyflow/react, BADGE_CLASS, BranchData, BranchNodeT, BranchStateDiagram(), BranchSyncRepo, DiagramNode, ErrorResult (+15 more)

### Community 39 - "settings.rs"
Cohesion: 0.27
Nodes (26): BranchRuleTemplate, rebuild(), AppHandle, check_connection(), delete_pat(), get_current_user(), get_settings(), list_projects() (+18 more)

### Community 40 - "useUi"
Cohesion: 0.09
Nodes (16): LandingView(), IterationRepoTab(), FilterMenu(), AppBreadcrumb(), AppSidebar(), NavUser(), getSectionErrorCount(), LIST_ROWS (+8 more)

### Community 41 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 42 - "app-breadcrumb.tsx"
Cohesion: 0.39
Nodes (7): Breadcrumb(), BreadcrumbEllipsis(), BreadcrumbItem(), BreadcrumbLink(), BreadcrumbList(), BreadcrumbPage(), BreadcrumbSeparator()

### Community 43 - "ui.ts"
Cohesion: 0.09
Nodes (25): CommandEntry, CommandGroup, CommandMenu(), GROUP_ORDER, IterationView(), rowKeyOf(), RequirementProperties(), NavProjects() (+17 more)

### Community 44 - "dependencies"
Cohesion: 0.09
Nodes (23): dependencies, @base-ui/react, class-variance-authority, clsx, cn, @fontsource/inter, lucide-react, react (+15 more)

### Community 45 - "class-variance-authority"
Cohesion: 0.20
Nodes (11): class-variance-authority, Alert(), AlertAction(), AlertDescription(), AlertTitle(), alertVariants, ToggleGroup(), ToggleGroupContext (+3 more)

### Community 46 - "LogViewer.tsx"
Cohesion: 0.08
Nodes (27): FilterMode, LogViewer(), stageStatusBadgeClass(), Drawer(), DrawerContent(), DrawerContext, DrawerContextProps, DrawerDescription() (+19 more)

### Community 47 - "requirement-activity.tsx"
Cohesion: 0.08
Nodes (52): RequirementActivity(), RequirementActivityProps, RichDescription(), RichDescriptionProps, AiSection(), AVAILABLE_TAGS, PROVIDER_PRESETS, RichEditor() (+44 more)

### Community 48 - "descriptions.tsx"
Cohesion: 0.16
Nodes (12): columnClasses(), ColumnCount, DEFAULT_COLUMN, DescriptionCell(), Descriptions(), DescriptionsBreakpoint, DescriptionsItem, DescriptionsProps (+4 more)

### Community 49 - "0. 需要调整什么(执行清单)"
Cohesion: 0.14
Nodes (13): 0. 需要调整什么(执行清单), 1. 总体结论, 2. 关键交叉验证:浅蓝按钮的真相, 3. 合规亮点(保持,不要动), 4. 修复路线图, A. P1 —— 必须修(4 项,均有用户可感知的功能/语义影响), B. P2 —— 设计令牌收口(4 项,一次小重构全解决), C. P2 —— UX 修正(6 项) (+5 more)

### Community 50 - "nav-user.tsx"
Cohesion: 0.36
Nodes (6): Avatar(), AvatarBadge(), AvatarFallback(), AvatarGroup(), AvatarGroupCount(), AvatarImage()

### Community 51 - "IterationView.tsx"
Cohesion: 0.08
Nodes (34): lucide-react, FloatingBatchBar(), FloatingBatchBarProps, groupByStatus(), StatusGroup, WorkitemItem, SearchableAssigneePopover(), SearchableAssigneePopoverProps (+26 more)

### Community 52 - "src/types.ts"
Cohesion: 0.18
Nodes (10): ConnectionState, JenkinsConnection, JenkinsConnectionView, JenkinsLogChunk, OrgSummary, PipelineSummary, RepositoryTraceResult, RunStatus (+2 more)

### Community 53 - "linked-repo-card.tsx"
Cohesion: 0.11
Nodes (34): BranchTemplatesManagerProps, BaselineState, BranchCheckState, BranchDivergenceCheck(), comparisonCommits(), comparisonDiffs(), useBranchDivergence(), UseBranchDivergenceResult (+26 more)

### Community 54 - "JenkinsBuildDialog.tsx"
Cohesion: 0.12
Nodes (27): branchNames(), JenkinsBuildDialog(), ParameterFieldProps, Collapsible(), CollapsibleContent(), CollapsibleTrigger(), isBranchParameterName(), isEnvironmentParameterName() (+19 more)

### Community 55 - "nervd UI 选型调研（2026-09）"
Cohesion: 0.20
Nodes (9): 1. 现状盘点, 2. 2026-09 生态事实（npm registry 实测，ego-browser 抓取）, 3. 结合 nervd 的逐项评估, 4. 建议路线, 5. 信息来源, nervd UI 选型调研（2026-09）, 何时重新评估 antd/Mantine, 方案 A（现在就做，推荐）：Base UI 原语 + 现有 CSS (+1 more)

### Community 56 - "RequirementDetails.tsx"
Cohesion: 0.10
Nodes (26): cn, EmptyHint(), BranchRowState, comparisonCache, ComparisonCacheEntry, dayOf(), IntegrationView(), matchPatterns() (+18 more)

### Community 57 - "stat.tsx"
Cohesion: 0.22
Nodes (9): columnClasses(), DEFAULT_COLUMN, RESPONSIVE_COLUMN_CLASS, Stat(), StatBand(), StatBandProps, StatBreakpoint, StatColumnCount (+1 more)

### Community 58 - "vite.config.mts"
Cohesion: 0.28
Nodes (5): previewRoot, @tailwindcss/vite, vite, @vitejs/plugin-react, __dirname

### Community 59 - "devDependencies"
Cohesion: 0.20
Nodes (10): devDependencies, jsdom, @playwright/test, @tauri-apps/cli, @types/react, @types/react-dom, typescript, vite (+2 more)

### Community 60 - "scripts"
Cohesion: 0.17
Nodes (12): scripts, build, dev, dev:app, preview, preview:dev, tauri, test (+4 more)

### Community 61 - "RepositoryCiDetails.tsx"
Cohesion: 0.13
Nodes (27): CiSummaryButton(), IterationRepoCard(), IterationScopedRepo, WorkitemItem, RepositoryCiDetails(), CheckStatus, IterationDevDivergenceProps, OverflowTooltipProps (+19 more)

### Community 62 - "iteration-branches.ts"
Cohesion: 0.50
Nodes (7): IterationDevDivergence(), asObject(), branchArray(), branchPageHasMore(), findRemoteBranch(), parseBranchList(), stringField()

### Community 63 - "preview/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, noEmit, extends, include, ../tsconfig.json

### Community 64 - "ai.rs"
Cohesion: 0.18
Nodes (30): ACCOUNT_AI_KEY, ai_chat_completion(), ai_settings_path(), AiCustomPrompts, AiSettings, ChatMessage, delete_ai_api_key(), delete_ai_key() (+22 more)

### Community 65 - "useApp"
Cohesion: 0.12
Nodes (20): Preview(), ToastHost(), ChildDetailDrawer(), InlineStatusDropdown(), RequirementDetails(), isEditableTarget(), Shell(), ACTIVE_CI_INTERVAL_MS (+12 more)

### Community 66 - "nervd 功能测试用例与 E2E 测试指南"
Cohesion: 0.07
Nodes (26): 1.1 用例的源头是规约，不是代码, 1.2 按功能形态分类，决定断言方式, 1.3 快捷键功能用「按键矩阵」穷举, 1.4 用例登记模板, 1. 方法论：从「功能规约」到「测试用例」, 2. 测试分层：什么功能放在哪一层测, 3.1 为什么是 preview 模式, 3.2 把静态 mock 升级为「可控 mock」（已实现） (+18 more)

### Community 67 - "AboutSection.tsx"
Cohesion: 0.19
Nodes (19): @tauri-apps/plugin-opener, AboutDialog(), formatBytes(), AboutSection(), useAppUpdate(), APP_BUILD_CHANNEL, APP_NAME, APP_TAGLINE (+11 more)

### Community 68 - "children-card.tsx"
Cohesion: 0.16
Nodes (16): BranchTemplatesManager(), ChildDetailDrawerProps, AiBreakdownDialog(), AssigneeOption, ChildrenCard(), ChildrenCardProps, RequirementDetailsProps, PipelineCard() (+8 more)

### Community 69 - "fixtures.ts"
Cohesion: 0.18
Nodes (14): activeRow(), detailIdentifier(), LIST, mockCallsOf(), mockDelay(), mockFail(), mockReset(), rowByIdentifier() (+6 more)

### Community 70 - "LandingView.tsx"
Cohesion: 0.12
Nodes (14): BlurText(), BlurTextProps, DecryptedText(), DecryptedTextProps, Particle, Particles(), ParticlesProps, ShinyText() (+6 more)

### Community 71 - "App.tsx"
Cohesion: 0.16
Nodes (12): App(), checkHasOnboarded(), jenkinsJobUrl(), baseSettings, ToastHost(), StartupSplash(), StartupSplashProps, INTERACTIVE_SELECTOR (+4 more)

### Community 72 - "updater.rs"
Cohesion: 0.26
Nodes (14): check_for_updates(), DEFAULT_REPO, download_and_install_update(), extract_tag_from_release_url(), fetch_latest_from_redirect(), is_newer_version(), parse_semver(), AppHandle (+6 more)

### Community 73 - "sleep"
Cohesion: 0.12
Nodes (16): checkConnection(), getJenkinsJob(), getJenkinsJobParameters(), getRepoCiLogChunk(), getRepoCiLogs(), getRepoCiSnapshot(), getWorkitemWorkflowStatuses(), listIterations() (+8 more)

### Community 74 - "gate"
Cohesion: 0.12
Nodes (16): createWorkitemChild(), createWorkitemComment(), deleteJenkinsToken(), deletePat(), gate(), getSettings(), getWorkitem(), mergeMergeRequest() (+8 more)

### Community 75 - "WriteOpButton.tsx"
Cohesion: 0.29
Nodes (11): ConfirmButton(), AlertDialog(), AlertDialogAction(), AlertDialogCancel(), AlertDialogContent(), AlertDialogDescription(), AlertDialogFooter(), AlertDialogHeader() (+3 more)

### Community 76 - "field.tsx"
Cohesion: 0.15
Nodes (13): Field(), FieldContent(), FieldDescription(), FieldError(), FieldGroup(), FieldLabel(), FieldLegend(), FieldSeparator() (+5 more)

### Community 77 - "store/updater.ts"
Cohesion: 0.39
Nodes (8): checkForUpdates(), downloadAndInstallUpdate(), listenUpdateProgress(), UpdaterState, useUpdater, UpdateCheckResult, UpdateProgress, UpdateStatus

### Community 78 - "nervd 智能助手开发指引 (AGENTS.md)"
Cohesion: 0.18
Nodes (10): 1. 项目定位与核心架构, 4.1 核心键盘快捷键, 4.2 阶梯式 Esc 退回机制 (Hierarchical Dismissal), 4.3 单手前缀跳转序列 (G-Sequence Navigation), 4. 全键盘交互与操作流程规范 (Keyboard-First Workbench), 6.1 推荐 Skills 调用规范, 6.2 冻结契约保护, 6.3 每次变更必跑验证 (+2 more)

### Community 79 - "iteration-templates.ts"
Cohesion: 0.35
Nodes (8): IterationBranches(), IterationBranchesProps, getFusedBranchTemplates(), getIterationTemplates(), loadAllIterationTemplates(), saveIterationTemplates(), useFusedBranchTemplates(), useIterationBranchTemplates()

### Community 80 - "DESIGN.md"
Cohesion: 0.20
Nodes (9): Border Radius Scale, Decorative Depth, Do, Do's and Don'ts, Don't, Elevation & Depth, Overview, Photography Geometry (+1 more)

### Community 81 - "Layout"
Cohesion: 0.22
Nodes (9): Breakpoints, Collapsing Strategy, Grid & Container, Image Behavior, Layout, Responsive Strategy, Spacing System, Touch Targets (+1 more)

### Community 82 - "error-boundary.tsx"
Cohesion: 0.22
Nodes (3): ErrorBoundary, ErrorBoundaryProps, ErrorBoundaryState

### Community 83 - "Components"
Cohesion: 0.25
Nodes (8): Buttons, Cards & Containers, Components, Examples (illustrative), Inputs & Forms, Navigation, Signature Components, Statistics

### Community 84 - "2. 核心业务模块与设计逻辑"
Cohesion: 0.33
Nodes (6): 2.1 迭代工作台 (Iteration View), 2.2 需求详情工作台 (Requirement Details Workbench), 2.3 集成分支视图 (Integration Branches View), 2.4 总览仪表盘与侧边抽屉 (Overview & Peek Drawer), 2.5 系统设置与凭据安全 (Settings & Security), 2. 核心业务模块与设计逻辑

### Community 85 - "release-local.sh"
Cohesion: 0.53
Nodes (5): fail(), info(), ok(), PATH, release-local.sh script

### Community 86 - "3. UI 参照与设计系统规范 (Deep Linear Alignment)"
Cohesion: 0.40
Nodes (5): 3.1 双主题色彩系统 (Linear Light & Dark LCH-based), 3.2 排印系统与等宽字体 (Typography), 3.3 空间、容器与骨架屏规范 (Border-less & Precise Skeletons), 3.4 状态语义闭环 (`StatusIcon`), 3. UI 参照与设计系统规范 (Deep Linear Alignment)

### Community 87 - "5. 安全受控写操作规范 (Write Operations Defense)"
Cohesion: 0.40
Nodes (5): 5.1 只读门控原则 (`WriteOpButton` & `WriteOpGatedTrigger`), 5.2 确认交互分层防线, 5.3 乐观即时更新与失败回滚 (Optimistic Update), 5.4 核心层二次强制拦截, 5. 安全受控写操作规范 (Write Operations Defense)

### Community 88 - "Colors"
Cohesion: 0.40
Nodes (5): Brand & Accent, Colors, Semantic, Surface, Text

### Community 89 - "Typography"
Cohesion: 0.40
Nodes (5): Font Family, Hierarchy, Note on Font Substitutes, Principles, Typography

### Community 90 - "vitest"
Cohesion: 0.40
Nodes (3): vitest, WorkitemRow, WorkitemSummary

### Community 91 - "test.sh"
Cohesion: 0.60
Nodes (4): PATH, run_e2e(), run_unit(), test.sh script

### Community 92 - "ai-breakdown-tags.tsx"
Cohesion: 0.40
Nodes (4): AiBreakdownTags(), AiBreakdownTagsProps, DEFAULT_AVAILABLE_TAGS, TAG_COLORS

### Community 93 - "fuzzy.ts"
Cohesion: 0.90
Nodes (3): fuzzyFilter(), fuzzyScore(), isFuzzyMatch()

### Community 94 - "createBranch"
Cohesion: 0.67
Nodes (3): compareBranches(), createBranch(), listBranches()

## Knowledge Gaps
- **493 isolated node(s):** `../dist/cli.mjs`, `$schema`, `style`, `rsc`, `tsx` (+488 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 698 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `react`, `app.ts`, `table.tsx`, `searchable-select.tsx`, `sidebar.tsx`, `toast.tsx`, `SettingsView.tsx`, `useUi`, `app-breadcrumb.tsx`, `ui.ts`, `class-variance-authority`, `LogViewer.tsx`, `requirement-activity.tsx`, `descriptions.tsx`, `nav-user.tsx`, `IterationView.tsx`, `linked-repo-card.tsx`, `RequirementDetails.tsx`, `stat.tsx`, `RepositoryCiDetails.tsx`, `iteration-branches.ts`, `useApp`, `children-card.tsx`, `App.tsx`, `WriteOpButton.tsx`, `field.tsx`, `ai-breakdown-tags.tsx`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `package.json`, `cn`, `table.tsx`, `searchable-select.tsx`, `sidebar.tsx`, `toast.tsx`, `SettingsView.tsx`, `BranchStateDiagram.tsx`, `app-breadcrumb.tsx`, `ui.ts`, `class-variance-authority`, `LogViewer.tsx`, `requirement-activity.tsx`, `descriptions.tsx`, `nav-user.tsx`, `IterationView.tsx`, `linked-repo-card.tsx`, `JenkinsBuildDialog.tsx`, `RequirementDetails.tsx`, `stat.tsx`, `RepositoryCiDetails.tsx`, `useApp`, `children-card.tsx`, `LandingView.tsx`, `App.tsx`, `WriteOpButton.tsx`, `field.tsx`, `iteration-templates.ts`, `error-boundary.tsx`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Why does `lucide-react` connect `IterationView.tsx` to `package.json`, `react`, `cn`, `table.tsx`, `searchable-select.tsx`, `sidebar.tsx`, `toast.tsx`, `SettingsView.tsx`, `app-breadcrumb.tsx`, `ui.ts`, `LogViewer.tsx`, `requirement-activity.tsx`, `descriptions.tsx`, `nav-user.tsx`, `linked-repo-card.tsx`, `JenkinsBuildDialog.tsx`, `RequirementDetails.tsx`, `RepositoryCiDetails.tsx`, `useApp`, `AboutSection.tsx`, `children-card.tsx`, `LandingView.tsx`, `WriteOpButton.tsx`, `error-boundary.tsx`, `ai-breakdown-tags.tsx`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **What connects `../dist/cli.mjs`, `$schema`, `style` to the rest of the system?**
  _493 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `yunxiao-api.md` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._