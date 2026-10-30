# Changelog

All notable changes to **nervd** will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.4.1](https://github.com/AZenking/nervd/releases/tag/v0.4.1) - 2026-10-30

### 🚀 Features

- *(quick-build)* 快速构建控制台与全局弹窗，统一入口与快捷键 ([598fed1](https://github.com/AZenking/nervd/commit/598fed156f3a46e91a09ca7d4042a4af25d3c2e7))
## [0.4.0](https://github.com/AZenking/nervd/releases/tag/v0.4.0) - 2026-10-29

### 🚀 Features

- *(ui)* 统一页头、可拖动分栏与窄窗口适配（含上轮 macOS 操作对齐） ([055e23c](https://github.com/AZenking/nervd/commit/055e23cd341e1516f41a6de19c5e272ab2af4a97))
- *(log-viewer)* Integrate shadcn trace component for pipeline stages timeline ([28f62ee](https://github.com/AZenking/nervd/commit/28f62ee7609d6865ec8158fd18269a7b97d99347))
- *(requirement)* Extract link-repo modal with AI recommendations and stabilize header action layout ([ab53bc6](https://github.com/AZenking/nervd/commit/ab53bc67e80eee51756ab7000cdb921fdb3c6303))
- *(iteration)* Move view tabs to header actions row and collapse filter rows ([a5e799b](https://github.com/AZenking/nervd/commit/a5e799b4e95d1a873546c1a16ea54b1d7c7fc3bc))
- *(requirement)* 重构仓库交付卡片并统一溢出提示 ([c222cc9](https://github.com/AZenking/nervd/commit/c222cc902c10bbbd252e84b1dc16e022f6c1ec70))
- *(ci)* 统一 CI 与 MR 状态语义并优化详情交互 ([8ad9989](https://github.com/AZenking/nervd/commit/8ad9989ca1ff2f98b19f9965ffa139b325631148))
- *(iteration)* 分支同步状态图改为全屏弹窗展示 ([b0309dd](https://github.com/AZenking/nervd/commit/b0309dd80d32d6d7fd7603a440e3a3881bfe6116))
- *(overview)* 全新线性风格总览仪表盘 ([f605eb9](https://github.com/AZenking/nervd/commit/f605eb9a6a18afa70f5ee946aa2df791e2cf5fe4))

### 🎨 UI & Styling

- *(toast)* Adopt standard shadcn styling with card and border variables for light/dark theme adaptation ([d46ec73](https://github.com/AZenking/nervd/commit/d46ec73e8dc436438a35f3fad10194439c53bb8f))
- *(theme)* Eliminate hardcoded colors and backgrounds across UI components for full token adaptation ([b374b00](https://github.com/AZenking/nervd/commit/b374b003ddf7b534dbaaaa32733f23b0fcb646b6))
## [0.3.3](https://github.com/AZenking/nervd/releases/tag/v0.3.3) - 2026-10-28

### 🚀 Features

- *(schedule)* Display action type tag and contextual badges including repo details ([4972954](https://github.com/AZenking/nervd/commit/4972954058c021f5abc4c9a954c8f91e728dbf27))

### 🐛 Bug Fixes

- *(schedule)* Filter out merged/closed MRs and fix stateFilter parameter binding ([2c19be9](https://github.com/AZenking/nervd/commit/2c19be9c0037723595280dba8c8a4ab5541242de))
## [0.3.2](https://github.com/AZenking/nervd/releases/tag/v0.3.2) - 2026-10-28

### 🐛 Bug Fixes

- *(schedule)* Extend auto-merge retry window to accommodate Yunxiao async checks ([be46598](https://github.com/AZenking/nervd/commit/be4659893c29d819ed71c0287ee22fbb8f170752))
## [0.3.1](https://github.com/AZenking/nervd/releases/tag/v0.3.1) - 2026-10-28

### 🚀 Features

- *(repo-recommend)* 两段式推荐 + 确定性信号加权 ([82bbfb9](https://github.com/AZenking/nervd/commit/82bbfb914e63cb2b0f77d410fafd0ae2e8b4b8c2))
- *(iteration)* 侧栏新增虚拟「未规划」迭代聚合无迭代工作项 ([2e72a32](https://github.com/AZenking/nervd/commit/2e72a320940e9681bf25dc6a1a892bca33e25355))
## [0.3.0](https://github.com/AZenking/nervd/releases/tag/v0.3.0) - 2026-10-28

### 🚀 Features

- *(theme)* 主题模式支持跟随系统外观自动切换与平滑流转 ([c06ee31](https://github.com/AZenking/nervd/commit/c06ee31b96ee1f7d0406f633652c0ecc32f694fc))
- 优化集成分支加载性能、窗口顶栏拖拽对齐标杆及定时任务工作台 ([b82febe](https://github.com/AZenking/nervd/commit/b82febeb89c49a89f3a2154d77c9af418e1c9325))
- 本地任务工作台与 SQLite 持久化 (解耦迭代，联动 Codeup) ([c880713](https://github.com/AZenking/nervd/commit/c88071380d6b52a2888152963fc0929e20f36400))
- 本地任务支持关联多个代码仓库与分支 (repos 数组与热迁移) ([12006a0](https://github.com/AZenking/nervd/commit/12006a024a43166705e7f96fbcf9cae3950028f0))
- 本地任务详情中支持就地向 Codeup 发起新分支 ([65d0ac5](https://github.com/AZenking/nervd/commit/65d0ac5c1c0519671cd2a9da61904f7311ad5512))
- 定时合并任务配置中的源分支与目标分支改为可搜索下拉框 ([9a3e52d](https://github.com/AZenking/nervd/commit/9a3e52d3fa85fce976e6c420007774bf28649ea2))
- *(repos)* 仓库清单默认隐藏已归档项目，新增「显示已归档」开关 ([e0ea0ca](https://github.com/AZenking/nervd/commit/e0ea0cadb417662babe04bac49316d338165e03e))
- *(schedule)* 增加循环间隔与固定时间调度选择，并收敛对齐 Linear 设计规范 ([810ad39](https://github.com/AZenking/nervd/commit/810ad399916d2913fa01f2b0a39ed7b945427695))
- *(hooks)* 参考 uidotdev/usehooks 设计吸纳常用 DOM/持久化基础原语 (useEventListener, useMeasure, useClickAway, useLocalStorage) ([b8d881e](https://github.com/AZenking/nervd/commit/b8d881e661c143c487f9db6c5b220a0b7442970c))

### 🐛 Bug Fixes

- 拉取仓库分支时取消单页限制，全量获取所有远端分支 ([e745445](https://github.com/AZenking/nervd/commit/e7454450e578340fca112c925c3a0d8ec0648db0))
- *(schedule)* 修复时间展示时区落差与过期下次时间自愈计算 ([8ea5294](https://github.com/AZenking/nervd/commit/8ea529485d43dcf7c4beb65cd30ba0a7fef38d98))

### ♻️ Refactor

- *(schedule)* 严格使用 shadcn/ui 原语替换手写原生 button 标签 ([0d954ac](https://github.com/AZenking/nervd/commit/0d954ac6cd1163411429c2946bcc28568310ce80))
- 全面落地吸纳的公共 hooks (useEventListener, useMeasure, useLocalStorage) 并优化交互细节 ([e633453](https://github.com/AZenking/nervd/commit/e6334532e18eeaf88162a9ef83d5cba18d206bcf))

### 🛠️ Build & Tooling

- 隐藏侧边栏与命令面板的本地任务入口 ([1732cd8](https://github.com/AZenking/nervd/commit/1732cd850e7ac9c4c40153ba268fcfb4c458832f))

### Ux

- 优化调度周期配置体验，提供大白话执行频率预设与中文时间预览 ([547175b](https://github.com/AZenking/nervd/commit/547175b295d5ebf224ac4c847751da3a6f8dd029))
## [0.2.9](https://github.com/AZenking/nervd/releases/tag/v0.2.9) - 2026-10-25

### 🚀 Features

- *(settings)* 默认云效仓库清单支持名称过滤与已选计数，升级版本号至 v0.2.9 ([2c8c53b](https://github.com/AZenking/nervd/commit/2c8c53b3d82dc845a9566a398d69e0845cbd5bca))
## [0.2.8](https://github.com/AZenking/nervd/releases/tag/v0.2.8) - 2026-10-25

### 🚀 Features

- *(settings)* 仓库 CI Job 绑定支持名称过滤与已绑定筛选，升级版本号至 v0.2.7 ([03c7c39](https://github.com/AZenking/nervd/commit/03c7c3969e7fdc1afdebd0d828cc757f49129ac1))

### 🐛 Bug Fixes

- *(app-info)* 动态读取 package.json 版本号，避免版本号硬编码滞后 ([d258cf7](https://github.com/AZenking/nervd/commit/d258cf71a8f3c491a6b385c9556c209dca1eebfc))

### 📚 Documentation

- *(readme)* 补充版本分支策略与主线构建推进，升级版本号至 v0.2.8 ([8c792fd](https://github.com/AZenking/nervd/commit/8c792fd3aaea49bec1e71c41353e1e09f84e1891))
## [0.2.7](https://github.com/AZenking/nervd/releases/tag/v0.2.7) - 2026-10-23

### 🚀 Features

- *(diff)* 代码变更增加树形文件列表与锚点跳转定位，升级版本号至 v0.2.7 ([e57df5f](https://github.com/AZenking/nervd/commit/e57df5f1cdfd9992b14ad76500482766891f04f3))
## [0.2.6](https://github.com/AZenking/nervd/releases/tag/v0.2.6) - 2026-10-22

### 🚀 Features

- *(workbench)* Unify state sync and build logs ([12a69cb](https://github.com/AZenking/nervd/commit/12a69cb9c5c1415a321016dd0c469de6fd5e655f))
## [0.2.5](https://github.com/AZenking/nervd/releases/tag/v0.2.5) - 2026-10-21

### 🚀 Features

- *(repo)* 优化代码区域与MR关联刷新体验，支持分支与描述匹配MR，升级版本号至 v0.2.5 ([77b20a8](https://github.com/AZenking/nervd/commit/77b20a894b63600636afdeab05c1b770cc318419))
## [0.2.4](https://github.com/AZenking/nervd/releases/tag/v0.2.4) - 2026-10-20

### 🐛 Bug Fixes

- *(iteration)* 修复迭代切换与补拉重复累加 bug，升级版本号至 v0.2.4 ([4e12cbb](https://github.com/AZenking/nervd/commit/4e12cbb83961891640aa30943117b9fc087d4d55))
## [0.2.3](https://github.com/AZenking/nervd/releases/tag/v0.2.3) - 2026-10-19

### 🚀 Features

- *(mr)* 优化仓库卡片操作入口与 MR 创建流程，常驻发起构建，升级版本号至 v0.2.3 ([f81a2ce](https://github.com/AZenking/nervd/commit/f81a2ce6fef26219fc2849764747fd575b691050))
## [0.2.2](https://github.com/AZenking/nervd/releases/tag/v0.2.2) - 2026-10-19

### 🚀 Features

- 优化设置自动保存机制与 Jenkins Job 虚拟滚动模糊搜索，升级版本号至 v0.2.2 ([ed210ea](https://github.com/AZenking/nervd/commit/ed210ea71c361e0829e70fe679ba009f715ac1f6))
## [0.2.1](https://github.com/AZenking/nervd/releases/tag/v0.2.1) - 2026-10-19

### 🚀 Features

- *(diff)* 支持本地代码变更检视（内联查看与侧边抽屉 Diff） ([9543c2e](https://github.com/AZenking/nervd/commit/9543c2eaa150644a2bcda93f5a5d405e72dc52a7))
- 支持迭代分支与 dev 主干差异监控及设置配置，升级版本号至 v0.2.1 ([5d95067](https://github.com/AZenking/nervd/commit/5d9506797a331749908a4fd872ddc8e453aff47f))

### 🐛 Bug Fixes

- *(mr)* 修复云效直达 404 问题，规范 Codeup /change/:id 路由与组织路径拼接 ([6c99fab](https://github.com/AZenking/nervd/commit/6c99fab891e671c86696983188bf711dce91aef4))
- *(mr)* 优先使用 detailUrl 直达 MR 页面，并修复已合并 MR 下新未合入提交的状态与发起动作 ([f894356](https://github.com/AZenking/nervd/commit/f894356e1d98432996b012487fe6ebf214e4fe8d))
## [0.2.0](https://github.com/AZenking/nervd/releases/tag/v0.2.0) - 2026-10-19

### 🚀 Features

- *(ci)* 支持 Jenkins 主体步骤展示与控制台日志高亮 ([9b3febf](https://github.com/AZenking/nervd/commit/9b3febf85ed644fbf707f75655da68b3d54a2795))
- 支持 MR 列表手风琴检视与就地确认合并，升级版本号至 v0.2.0 ([ac5d740](https://github.com/AZenking/nervd/commit/ac5d74005bcff1214f73457bd6940e24f60782d0))
## [0.1.6](https://github.com/AZenking/nervd/releases/tag/v0.1.6) - 2026-10-19

### 🐛 Bug Fixes

- *(ui)* 修复分栏窄屏下关联仓库表单溢出遮挡 (v0.1.6) ([89fce25](https://github.com/AZenking/nervd/commit/89fce250e1c0e81bf2c0ede4adb8c1da75af3110))
## [0.1.5](https://github.com/AZenking/nervd/releases/tag/v0.1.5) - 2026-10-19

### 🚀 Features

- 支持仓库与分支统一分页收集器及应用内一键自动更新 (v0.1.5) ([735bd59](https://github.com/AZenking/nervd/commit/735bd59b834472f19dbc014cf9bf0642136cbce3))
## [0.1.4](https://github.com/AZenking/nervd/releases/tag/v0.1.4) - 2026-10-17

### 🚀 Features

- *(iteration)* Support in-place assignee switching and rename activity to 动态 ([0c5f02f](https://github.com/AZenking/nervd/commit/0c5f02f8bee610e8af83f299af3ecfd6017cc640))

### 🐛 Bug Fixes

- *(iteration)* Streamline description editing and prevent full-page reload on save ([a4a000e](https://github.com/AZenking/nervd/commit/a4a000ea4cf546fffb577af6bba2e0812002ffb6))
- *(ui)* Prevent ComboboxItem text wrapping and overlap in SearchableSelect ([c43c773](https://github.com/AZenking/nervd/commit/c43c773cc57e2d5842435ffd509ce11368679caf))
- *(activity)* Format AI-generated markdown drafts and activity comments to rich html ([ef673c3](https://github.com/AZenking/nervd/commit/ef673c3bc468c0d1af37351145eb00c25ff076a8))
- *(activity)* Sanitize emojis and control characters to prevent Yunxiao 400 error ([6fdeabb](https://github.com/AZenking/nervd/commit/6fdeabb62babb83caa8439550de4959ff586e7a5))
## [0.1.3](https://github.com/AZenking/nervd/releases/tag/v0.1.3) - 2026-10-17

### 🐛 Bug Fixes

- *(settings)* Resolve infinite auto-save loop caused by key order mismatch ([92670f0](https://github.com/AZenking/nervd/commit/92670f0ddd8784883c0938143c0d865d4a540534))
## [0.1.2](https://github.com/AZenking/nervd/releases/tag/v0.1.2) - 2026-10-17

### 🚀 Features

- *(build)* Add Windows x64 NSIS/MSI bundle targets and release workflow support ([e66c4f4](https://github.com/AZenking/nervd/commit/e66c4f42a95ac70a3f9703d5923918b6d857cb59))

### 🐛 Bug Fixes

- *(updater)* Add redirect probe fallback to bypass GitHub API rate limit ([792e772](https://github.com/AZenking/nervd/commit/792e772f71e0f0dd6f3a318653ea77f92d0ba2f5))
- *(ci)* Use cross-platform sha256 calculation for Windows runner in release workflow ([9b9ca73](https://github.com/AZenking/nervd/commit/9b9ca7342e44b4ea3e3324dc7a0891e49a70fc9b))
## [0.1.1](https://github.com/AZenking/nervd/releases/tag/v0.1.1) - 2026-10-16

### 🐛 Bug Fixes

- *(preview)* Resolve relative logo paths on GitHub Pages and sync onboarding settings ([37dac53](https://github.com/AZenking/nervd/commit/37dac53fcb1b9938dd0cf6711053e67f7848504a))

### 📚 Documentation

- *(e2e)* 更新测试覆盖规约与设置用例选择器 ([c1d495b](https://github.com/AZenking/nervd/commit/c1d495b328e4514232a6b22f9e6c046329f4ae8d))
- Add standard README, React Bits landing page and GitHub Pages deployment workflow ([7c150a5](https://github.com/AZenking/nervd/commit/7c150a571124caa23bee34ad773154c4fa26ead7))
- 补充 macOS 未签名应用清除隔离属性说明 ([6ae116d](https://github.com/AZenking/nervd/commit/6ae116d8cfccea422f0edd744d47588cacaec178))
## [0.1.0](https://github.com/AZenking/nervd/releases/tag/v0.1.0) - 2026-10-16

### 🚀 Features

- *(rust)* Yunxiao ROA client, 22 commands with write gating, keyring creds, pipeline poller ([560591a](https://github.com/AZenking/nervd/commit/560591a972fa807d3763f8bda434cba59618672c))
- *(app)* Datalayer(api/link/store), hangar-control theme, 3-pane workbench UI, settings onboarding ([3484a36](https://github.com/AZenking/nervd/commit/3484a367ed66c8b2b797e1fe257714b71874bff0))
- [**breaking**] Switch to openapi-rdc /oapi/v1 PAT surface (x-yunxiao-token) ([46a8ee0](https://github.com/AZenking/nervd/commit/46a8ee0f62cc7833aded471d8f0a6a4b578da70e))
- *(settings)* Validate space identifier is project id (block name-as-id trap) ([c6f1b95](https://github.com/AZenking/nervd/commit/c6f1b95406b54d6a35d55455ff7a4672e13f51ef))
- *(settings)* Auto-load projects & repos with dropdown-first space picker ([8b1cbd6](https://github.com/AZenking/nervd/commit/8b1cbd6f9ac379d0451655d579303ba1f00f4b11))
- *(workbench)* 人员过滤与富文本描述 + Jenkins/仓库CI集成与按需追溯 ([5e4fc32](https://github.com/AZenking/nervd/commit/5e4fc32e7fb1c7c9805e92adc7e1625d5f9e8dd2))
- *(ui)* 以 nervd-new-ui(v0) 为基准重构主界面 ([f3a1ce9](https://github.com/AZenking/nervd/commit/f3a1ce966282938f6e257b1402889a2739e63969))
- *(sidebar)* 需求项仅展示标题 + 溢出 Tooltip + 菜单 pointer ([022cc1c](https://github.com/AZenking/nervd/commit/022cc1ca00516a7e5255b8ff717203a0933b2063))
- *(workitem)* 子任务接入真实云效数据（getRelations SUB） ([4a3b8d0](https://github.com/AZenking/nervd/commit/4a3b8d0670786c837129996dee720aeaaed6a61f))
- *(workitem)* 子任务卡片展示处理人 ([10d0f66](https://github.com/AZenking/nervd/commit/10d0f66d50ecef6f746ab0aa2448d1472ed55bf2))
- *(workitem)* 缺陷卡片接入真实数据（parentId 挂载的 Bug） ([6f82e45](https://github.com/AZenking/nervd/commit/6f82e4541a0b1ee3a31526f512c422f7b28e987a))
- *(iteration)* 迭代/分支模板/Jenkins 构建全链路（后端与数据层） ([6e3632d](https://github.com/AZenking/nervd/commit/6e3632db61b23875f638ac44e99be88fadd278dc))
- *(iteration)* 关联提交折叠卡，承接追溯浮层下线后的提交明细 ([0c2d43b](https://github.com/AZenking/nervd/commit/0c2d43b59a4fc95b1809083cba2bd5fd96f88b9d))
- *(ui)* SectionHeader/PropertyRow 共享件，支撑主区 Notion 式平铺布局 ([4bbf66a](https://github.com/AZenking/nervd/commit/4bbf66a2cf30264ffd7027149945aa07643070e8))
- *(ui)* 全局搜索信号（⌘K）与 Notion 式可折叠侧栏分组组件 ([50c0417](https://github.com/AZenking/nervd/commit/50c0417d54eb9bf523426bb49c1df30ce1c48272))
- *(workitem)* 支持端内新建子任务与分支同步状态图 ([e4f7ce5](https://github.com/AZenking/nervd/commit/e4f7ce58b9d4d10e5eb2e1ddb80fdf604b56486c))
- *(ui)* 界面 1:1 对齐 Linear（骨架/列表/详情/设置/命令面板/快捷键） ([1a38e6f](https://github.com/AZenking/nervd/commit/1a38e6f82ef919775a8f197ec8ad7557b15a45ab))
- *(view)* 新增集成分支只读视图 ([40f2dca](https://github.com/AZenking/nervd/commit/40f2dcac2f3b5e7ba68c47da6afa5472d2d70bb7))
- *(ui)* 迭代页按标注改版——分页、筛选迁移、只读徽标、侧栏瘦身 ([50c5039](https://github.com/AZenking/nervd/commit/50c5039a7c4479a00467a0c6ea5e6ba582552720))
- *(app)* 适配 macOS 原生无边框沉浸式窗口与桌面图标资产 ([4b034a1](https://github.com/AZenking/nervd/commit/4b034a12ec80d5c8ed59890768273f56c4f9692d))
- *(security)* 强化写操作受控门控与工作项状态流转 IPC ([957dd8a](https://github.com/AZenking/nervd/commit/957dd8a4d50771b32c3513ccb3b26774e4518287))
- *(richtext)* 集成 Tiptap 富文本编辑器与描述编辑支持 ([03e5d10](https://github.com/AZenking/nervd/commit/03e5d10c31dedfd505510c5fe083b960daab312b))
- *(brand)* 引入全尺寸品牌图标资产并构建原生平滑启动屏 ([bb59dab](https://github.com/AZenking/nervd/commit/bb59daba7f1397d8f62b8f7ede3ab2b7c52263d5))
- *(yunxiao)* 支持云效 Projex 深度跳转与当前登录用户识别及高亮 ([935746f](https://github.com/AZenking/nervd/commit/935746f9900c60429e66e85d675ed5a8502422cd))
- *(ci)* 引入全局自适应 CI 调度中心并增强 Jenkins 构建参数映射 ([cdc4a19](https://github.com/AZenking/nervd/commit/cdc4a19ad9c1732826deeca22c08f16a1120be86))
- *(ai)* 深度集成 AI 智能助手——支持需求拆解、讨论纪要、代码推荐与交付报告 ([1619e71](https://github.com/AZenking/nervd/commit/1619e712a00cb477ce5e035e589b94747be503ad))
- *(updater)* 集成版本检查更新体系、本地发版脚本与关于 nervd 诊断工作台 ([ea15152](https://github.com/AZenking/nervd/commit/ea15152d29ad23aeb5ece1b618db5e7967a24663))
- *(macos)* 适配 macOS 原生系统菜单并打通全局事件与核心 IPC 命令总线 ([694f4d9](https://github.com/AZenking/nervd/commit/694f4d9357f4eade5653b412f59828b1b4848930))
- *(ci)* 配置 GitHub Actions CI 与 Release 自动打包流水线并绑定远程仓库 ([aced358](https://github.com/AZenking/nervd/commit/aced3580012cd3ad430ee85eb3c9c888df46b278))

### 🐛 Bug Fixes

- *(store)* Batch pipeline runs fetch into single commit (stop UI refresh storm) ([2a8ef1e](https://github.com/AZenking/nervd/commit/2a8ef1eb50b82c240a55ed7f166b05f2ba00e6b3))
- *(ipc)* Register list_projects command in generate_handler ([3666d7e](https://github.com/AZenking/nervd/commit/3666d7e5fb30de5c3510600dc171f62e9e48e312))
- 迁移收尾——修正 cn 工具（clsx+tailwind-merge 替代误装的 cn 包）、恢复 shadcn 样式依赖、统一 @/lib/utils 导入 ([06d9b34](https://github.com/AZenking/nervd/commit/06d9b34fbd44ca4de2a5754a1d99a0b15b896cd9))
- *(workitem)* 子任务空结果诊断能力 + 响应包装深扫 ([622f06d](https://github.com/AZenking/nervd/commit/622f06d4989d72f7a1b73081770b6521f466437e))
- *(yunxiao)* ROA 族接口改走 devops.cn-hangzhou.aliyuncs.com ([55f4111](https://github.com/AZenking/nervd/commit/55f41110ab981c3fd24f81eb71bbb01fed63053f))
- *(yunxiao)* ROA 请求补 Date 头 + accessToken 鉴权 ([270fc1d](https://github.com/AZenking/nervd/commit/270fc1dfb04115c2462484ad90e775d2012d51a0))
- *(workitem)* 子任务改用 workitems:search 行级 parentId 过滤（实测可用路径） ([5e939aa](https://github.com/AZenking/nervd/commit/5e939aae0abaf418c2350f8ea6b5bceb0ff45aa9))
- *(ui)* 审计 C1 补遗——剩余 7 文件的原始错误直出统一接 humanizeError ([367aa85](https://github.com/AZenking/nervd/commit/367aa855d1c3254ecb9da53cef5b4dbd705597c3))
- *(ui)* .eyebrow 去除 uppercase 转换(审计 D5 收尾) ([1005c54](https://github.com/AZenking/nervd/commit/1005c54505a1daf3b1fd3071303884a4d7f0e777))
- *(detail)* 仓库行次级动作收敛为 ⋯ 下拉菜单（对齐 Linear） ([6475aac](https://github.com/AZenking/nervd/commit/6475aac0e313c744bea5abc84d98e6d667edaab2))
- *(workitems)* 子任务状态流转即时回显与缺陷指定人及严重程度支持 ([304d61a](https://github.com/AZenking/nervd/commit/304d61a1ff8f760788eb27acb506e63e74d8e14a))
- *(ui)* 优化原生窗口拖拽热区与基础交互组件容错 ([29c592a](https://github.com/AZenking/nervd/commit/29c592a7d392dd7928f4aeb0e311c1db5079851a))
- *(ci)* 指定 pnpm version 10 与 Node.js 22 ([18c083b](https://github.com/AZenking/nervd/commit/18c083bccb4397e41cab9a939c05d5c22b56ac7b))
- *(ci)* 在 macos-latest 上统一交叉编译 x86_64 与 aarch64，消除 Node 20 废弃警告 ([df94a2e](https://github.com/AZenking/nervd/commit/df94a2e4238d7e20182adc5569955c071f3d5b35))

### 🎨 UI & Styling

- *(ui)* 清理排查出的旧形态残留 ([2ca136a](https://github.com/AZenking/nervd/commit/2ca136ad60bf81412d1667980a0ca255bd6c8dfd))
- *(settings)* 对照真实 Linear 校准设置页与侧栏激活态 ([81ac60f](https://github.com/AZenking/nervd/commit/81ac60f713b33df1566014687f448afaec7df3ad))
- *(ui)* 全站样式精修——统一密度、字重与阴影 token ([0eddae3](https://github.com/AZenking/nervd/commit/0eddae38e5c579d848de3d0cf8382660ca3ec3f9))
- *(ui)* 深度对齐 Linear 设计系统基准——统一 Token、导航与卡片交互 ([aebbc19](https://github.com/AZenking/nervd/commit/aebbc19b44f59eaf714a96d1fb8cc0ad865e5e3e))

### ♻️ Refactor

- *(ui)* 原生组件全量替换为 shadcn 且所有下拉统一支持搜索 ([a462954](https://github.com/AZenking/nervd/commit/a462954bdfa766d15ef21d60f7a8881cabeafdb4))
- *(shared)* 抽离 CI 领域与格式化共享层，消除跨文件重复实现 ([bc3224f](https://github.com/AZenking/nervd/commit/bc3224fd00ad61e4f3d0d02eac2a398bd7427847))
- *(shared)* CI 概要聚合单元格，表格详情入口 3→1 ([228f02a](https://github.com/AZenking/nervd/commit/228f02ae419a4aa2270b992c63094774c7e41c9f))
- *(common)* 提炼通用 Hooks 与跨视图交互原语组件 ([316d8c9](https://github.com/AZenking/nervd/commit/316d8c90820eb973c73c8ff80bf1a9a50135f30e))
- *(settings)* 设置页分区分发化与子卡片模块解耦 ([c42e2d8](https://github.com/AZenking/nervd/commit/c42e2d87ab5fb0f168826466091146c1c4d8d38a))
- *(iteration)* 需求详情与迭代工作台原子化解耦及视图接入 ([893a4b2](https://github.com/AZenking/nervd/commit/893a4b2a236f15925bbb825700f9d69624e974ea))
- *(branch-rules)* 抽取公共分支模板管理组件并支持全局与迭代模板融合 ([f93e815](https://github.com/AZenking/nervd/commit/f93e81591b913f7a8271df196d77dedb1df4ba91))

### 📚 Documentation

- Nervd README (产品/架构/快速开始) ([1ec588b](https://github.com/AZenking/nervd/commit/1ec588bec2fb6bbaaf85e7bed3454354e72feb88))
- UI 选型调研报告（方案 B：shadcn/ui + Tailwind v4） ([cb0321c](https://github.com/AZenking/nervd/commit/cb0321c709f74319e4a17ff2831faa92b1b0e96d))
- README 技术栈补充 shadcn/ui + Tailwind v4 ([175dfb2](https://github.com/AZenking/nervd/commit/175dfb2489f0a1d6634105eda063862d2e9753f5))
- 审计报告回写修复状态(当日闭环) ([4738f20](https://github.com/AZenking/nervd/commit/4738f206542386c622369b33f262ae754718d532))
- README 同步端内子任务与分支同步状态图说明 ([76507a1](https://github.com/AZenking/nervd/commit/76507a1a4fbbc1b19b244da82de37374659c3489))
- *(test)* 补充功能测试规约拆解方法论与 E2E 测试指南 ([c82964b](https://github.com/AZenking/nervd/commit/c82964b20bb27d02fac707fcac614f7ad434cf11))

### 🛠️ Build & Tooling

- Scaffold tauri2+react, yunxiao api reference, frozen ipc contract & shared types ([cb80690](https://github.com/AZenking/nervd/commit/cb8069077921636d5289f4995c093482e227cfad))
- *(fleet)* Mission spec + minimal fleet config ([2a42f20](https://github.com/AZenking/nervd/commit/2a42f20e00a95203c5283c4c8b71cab9c129e3d3))
- Integration verify script ([62c4343](https://github.com/AZenking/nervd/commit/62c434345e9a7c56ed96d2f2605de833f2ae733f))
- *(conf)* ProductName nervd, 1360x860 window for 3-pane workbench ([2874fbd](https://github.com/AZenking/nervd/commit/2874fbd2e8ac81972673e16b5a16ab25f82481a5))
- *(build)* Bundle app only, skip dmg (no more volume mounts on rebuild) ([2de9088](https://github.com/AZenking/nervd/commit/2de9088a5ee32619c690b76457d632de2885e23a))
- *(fleet)* Mission gap-closure-batch1（状态下拉/通知跳转/运行挂钩/图片代理） ([6dd2760](https://github.com/AZenking/nervd/commit/6dd2760347a5528e7caa25806c0f8833f33a5842))
- *(fleet)* Gap-closure-batch1 改纯验证门（maxReviewLoops 0 + 显式校验命令）——zai 审阅者超时/裁决不可解析两次 fail-closed ([d519da7](https://github.com/AZenking/nervd/commit/d519da7bec0cc111bd28ed3cfbd7c44c300ad870))
- *(lib)* 统一错误文案工具 humanizeError/errorLog(审计 C1 基础件) ([9a24048](https://github.com/AZenking/nervd/commit/9a24048e5d6c7ba7282f12af60fec8d1a133d151))
- *(fleet)* 设计审计修复 mission 定义 ([63cdc3c](https://github.com/AZenking/nervd/commit/63cdc3c1763f73a4787ec647d2dcd9adef474656))
- 忽略 .pnpm-store 本地包缓存 ([b41ea30](https://github.com/AZenking/nervd/commit/b41ea30b3e03935732c18f95858b3418536a7519))
- *(fleet)* 同步 codegraph/graphify 索引产物 ([fb6d9ed](https://github.com/AZenking/nervd/commit/fb6d9ed51dac2a73a947d872729e1fab730e03c6))
- *(git)* 完善 .gitignore 规则并同步智能体开发规范 ([189443c](https://github.com/AZenking/nervd/commit/189443c562106d1c0d5731bbdde5ceda022bf3e8))

### Fleet

- 修复 fleet.yaml（version 字段 + agy 模型占位符），新增 shadcn 迁移 mission ([8116949](https://github.com/AZenking/nervd/commit/8116949ae623183fae3af4a0716dbf31be6f9a60))
- 运行时切换为 zai-coding-cn/glm-5.2（agy 需交互式 Google 登录，不可用于非交互 run） ([9f40fa8](https://github.com/AZenking/nervd/commit/9f40fa8ecbc70c83fd02c67c4a8c79cbae02f64a))
- 恢复 agy 路由（已登录）；mission 审阅判据客观化 + maxReviewLoops 3 ([54771bc](https://github.com/AZenking/nervd/commit/54771bcb3c735d07ef009463d15f1b969cec3803))
- 任务角色修正——reflex 是轻量分诊角色，实质实现全部改派 reason（深度写权限） ([e666f03](https://github.com/AZenking/nervd/commit/e666f03ede78e99d63b26f34ccab75b1ed6b4809))
- 执行角色改 zai（agy 桥接工具调用失败），审阅角色保留 agy ([b196820](https://github.com/AZenking/nervd/commit/b1968208366a5adcbc08c32e6633dcc3eda0380f))
- 修正 agent 契约——改动留工作区禁止提交（fleet 自管 add/commit/merge，agent 提交会使 diff 校验隐形） ([eff79c2](https://github.com/AZenking/nervd/commit/eff79c24d3b801f10196378d53f07340e1912764))
- 收敛为单任务全量迁移 mission（审阅者按 mission 整体裁决 + 300s 审阅预算约束）；审阅角色换 zai 提速 ([c711052](https://github.com/AZenking/nervd/commit/c711052b2b55f4a6541cb30b34920919a272557f))
- Full-migration ([8b37e8d](https://github.com/AZenking/nervd/commit/8b37e8d9f303af7287a983d652f7fd9955a6c91f))
- Merge full-migration ([b3c69a9](https://github.com/AZenking/nervd/commit/b3c69a9d64eefad60a58518606cfc894089d6e0e))
- Task-status-dropdown ([f53a5ad](https://github.com/AZenking/nervd/commit/f53a5add4efc28f1a368d3dd5370c8ce78cb6883))
- Merge task-status-dropdown ([4a6c5fa](https://github.com/AZenking/nervd/commit/4a6c5fa2d2951510a0e47e178324c75dceb1515a))
- Task-notify-link ([0864e9f](https://github.com/AZenking/nervd/commit/0864e9fa1af87e9d1813a48c15c4742877244b0d))
- Merge task-notify-link ([29b988a](https://github.com/AZenking/nervd/commit/29b988a0d27d4fe6b684ae216739e8f069461448))
- Task-run-link ([498ee01](https://github.com/AZenking/nervd/commit/498ee01826f86739c209b41424ac90a202494d66))
- Merge task-run-link ([8ac3a99](https://github.com/AZenking/nervd/commit/8ac3a9978c9caa954decfd83b44a46426dd197e9))
- Task-attachment-image ([2737569](https://github.com/AZenking/nervd/commit/2737569c5cd0a6ca7555d732e6d8a81a4c329fef))
- Merge task-attachment-image ([ababcf5](https://github.com/AZenking/nervd/commit/ababcf5c9eb8dabb32ac91b15afadfe6d1c78a92))
- Token-layer ([d8a855d](https://github.com/AZenking/nervd/commit/d8a855d54994a3692c8a817089e423806ccb5b51))
- Merge token-layer ([5738137](https://github.com/AZenking/nervd/commit/5738137b1374fab4442d3c1158094f1763b847bf))
- Iteration-ci-views ([9070298](https://github.com/AZenking/nervd/commit/9070298176de0f19dd40064c9708674b5bc39372))
- Merge iteration-ci-views ([9ac72f9](https://github.com/AZenking/nervd/commit/9ac72f9bb2bebbfb28bfad5a367c104455de714a))
- Shell-shared ([43dfda6](https://github.com/AZenking/nervd/commit/43dfda6abd10c108e3b3dc749d62a29ad81b3479))
- Merge shell-shared ([2cd62af](https://github.com/AZenking/nervd/commit/2cd62afa68beb1b85ef5a57c51da3c60f507a30b))

### Wip

- *(ui)* V0 新 UI 基线快照(2026-10-10 设计审计时点) ([c3b9757](https://github.com/AZenking/nervd/commit/c3b9757cff5fb1ff333f66abd6d420112adab82b))
