# nervd 设计审计报告(实现 vs DESIGN.md / Notion 官网)

- **日期**:2026-10-10
- **对象**:nervd 新 UI(v0 基准),预览构建 `pnpm preview:dev`(http://localhost:1423,mock 数据,只读模式 `allowWriteOps=false`)
- **参照系**:
  - `DESIGN.md`(根目录,Notion 设计语言分析——本项目设计规范的唯一来源)
  - Notion 官网实测截图(zh-cn 区,2026-10-10 采集:首页 hero/区块 ×2、定价头部、定价对照表)
- **方法**:ego 浏览器全视图走查(20 张应用截图)+ Notion 官网参考(5 张)+ `getComputedStyle` 像素级取色 + 源码(`file:line`)交叉验证;3 路独立审计(设计令牌合规 / Notion 品牌对照 / UX·无障碍)并行后合并。全程只读,审计本身未修改任何文件。
- **与既有文档关系**:`docs/ux-review.md`(10-09)是上一轮 UX 评审;本报告为其后的全量设计审计,证据编号独立,个别条目(如 WriteOpButton 内联确认「UX 评审 A5」)为该轮已修项的延续。

> 截图材料存于 `/tmp/nervd-audit/`(01–20 应用视图,n1–n5 Notion 参考;临时目录,如需长期留存请自行归档)。
> 所有截图中**右缘粉色/蓝色圆钮为 ego 浏览器悬浮层,非 nervd UI**,已从评审中排除。

---

## 0. 需要调整什么(执行清单)

### A. P1 —— 必须修(4 项,均有用户可感知的功能/语义影响)

| # | 问题 | 证据 | 具体修法 | 验收标准 |
|---|------|------|----------|----------|
| A1 | **失败态不是红色**,与"运行中"同属橙系,仅深浅之差;色觉障碍用户只剩文字单通道 | `theme.css:53-56`(`--sig-fail:#793400` 深棕橙 vs `--sig-run:#dd5b00` 橙);`:83` 同色映射 `--destructive`;截图 04/15 | `--sig-fail`/`--destructive` 换红色(如 `#d1340b`,白底 5.0:1);或保留 token 但失败胶囊加 ⚠ 图标/红描边做双通道编码 | 失败与运行中在灰度/色盲模拟下可区分 |
| A2 | **面包屑、页面标题、迭代切换器指向三个不同迭代**:回退逻辑静默显示第一个迭代,面包屑却渲染 store 的 key | `IterationView.tsx:119`(`find(...) ?? iterations[0]`)vs `app-breadcrumb.tsx:34`;截图 01/12/13/17 | 回退时同步 `setIteration(iterations[0].name)`;或 iterationKey 无命中时渲染"迭代不存在"空态 | 面包屑 = 页面标题 = 切换器,三处恒等 |
| A3 | **无限滚动键盘/辅助技术不可达**,加载态只有"加载中…"纯文字(`ui/skeleton.tsx` 已存在未用) | `IterationView.tsx:137-149, :275-281`;截图 12/13 | 哨兵旁常驻可聚焦 Button「加载更多」(nextToken 存在时显示);首屏加载用骨架卡 | 纯 Tab 键可触发加载下一页 |
| A4 | **只读门控不可发现**:写操作按钮 `disabled` + `opacity-50`,品牌蓝被稀释成 ≈`#80baef`+白字(≈2.1:1),看起来像"另一种浅蓝样式";disabled 不触发 hover/focus,Tooltip 里的原因永远不出现;侧栏"只读"徽章无解释,折叠态直接消失 | `button.tsx:6`(`disabled:opacity-50`);`WriteOpButton.tsx:47,54-58,116`;`RequirementDetails.tsx:737`(空草稿同因);截图 02/04/05/15 同屏实心蓝与浅蓝并排 | ① 被门控按钮**保持可聚焦**,点击弹说明「需在 设置→安全 开启写操作」并给直达入口(aria-describedby 兜底);② 禁用态改**灰阶样式**,与品牌蓝脱钩;③ 工作台页面顶部加只读横幅(折叠态也可见) | 新用户不看文档也能明白"为什么点不了、去哪里开" |

### B. P2 —— 设计令牌收口(4 项,一次小重构全解决)

| # | 问题 | 证据 | 具体修法 |
|---|------|------|----------|
| B1 | **`#005bab`(pressed 蓝)已定义未接线**:hover 实际 `bg-primary/90`,白底上反而变浅,与"按下变深"方向相反 | 定义 `theme.css:32`(全仓唯一一处);实测 `button.tsx:10` | button default 改 `hover:bg-(--primary-active) active:bg-(--primary-active)` |
| B2 | **页面标题双规格**:base h1=26px/700/−0.625px/1.23(精确复刻 heading-2),但面包屑模式被覆写为 `text-2xl tracking-tight`(24px/−0.025em) | `theme.css:209-214` vs `page-header.tsx:38` | 删除覆写让 base 生效,或抽 `--text-page-title: 26px` 单一来源 |
| B3 | **eyebrow 双规格**:`.eyebrow`=11px/0.12em/1.2/uppercase,表头=12px/+0.125px/uppercase(字距精确) | `theme.css:260-267` vs `table.tsx:70` | 统一 token `--eyebrow: 12px/600/+0.125px/1.33`;uppercase 仅保留表头场景 |
| B4 | **浮层阴影档位混用**:dialog/toast/日志用规范式三层近透明阴影,dropdown/popover/sheet 却用 Tailwind `shadow-md/lg` 默认档(偏重,违背 barely-there) | `dialog.tsx:54`、`toast.tsx:36`、`LogViewer.tsx:39` vs `dropdown-menu.tsx:42,136`、`popover.tsx:38`、`sheet.tsx:55` | 统一为 `0 1px 2px rgba(0,0,0,.01), 0 4px 18px rgba(0,0,0,.04), 0 16px 40px rgba(0,0,0,.05)`,收进 `--shadow-level-2` |

### C. P2 —— UX 修正(6 项)

| # | 问题 | 证据 | 具体修法 |
|---|------|------|----------|
| C1 | 错误文案直出原始异常(`String(e)`/`entry.error`),无下一步动作 | `JenkinsBuildDialog.tsx:290`、`PipelineCard.tsx:30,47`、`RepositoryCiDetails.tsx:208`、`RepoCiCard.tsx:70` | 统一错误模板:人话原因 + 动作(重试/查看日志/去设置);失败 toast 附「查看日志」 |
| C2 | CI 详情抽屉与日志对话框**无可见关闭 X**(仅 Esc/底部按钮) | `RepositoryCiDetails.tsx:57-65`(未用 DrawerClose)、`LogViewer.tsx:39`(`showCloseButton={false}`);截图 15/16 | 抽屉头部与日志对话框右上恢复 X |
| C3 | 空态无下一步动作(仅图标+标题) | `empty-hint.tsx:12-39`(无 action 槽)、`OverviewView.tsx:222`;正例:`RepositoryCiDetails.tsx:111-124` | `EmptyHint` 加 `action` prop 并全面接入 |
| C4 | 计数口径三套并存:"4 / 已加载 57"、"迭代内 4 项 · 筛选后 4(已加载 57)"、"共 57 项" | `IterationView.tsx:196, :211, :284`;截图 01 | 统一为「当前类别 x 项 · 全部已加载 y 项」 |
| C5 | 侧栏 12px 小字用黑 50%(≈3.98:1 < 4.5:1) | `app-sidebar.tsx:46,116`(`/50`)、`:101`(`/55`) | 改 `text-muted-foreground`(6.5:1) |
| C6 | ⌘K 心智错位:「搜索或提问」实为聚焦列表搜索框,无命令面板 | `Shell.tsx:82-85`、`app-sidebar.tsx:104`;截图 17 | 短期:文案改「搜索工作项(⌘K)」;长期:升级真 palette |

### D. P3 —— 打磨项(择期批量处理)

1. 「刷新」按钮 5 种形态(ghost 纯文字/outline+icon/icon-only/ghost+icon/outline+icon"刷新状态")→ 统一 outline+icon sm(`OverviewView.tsx:148` 等 5 处)
2. 活动 Tab 仅蓝色文字、无下划线,截图间观感不稳(`tabs.tsx:62-63`)→ 活动态补下划线或 font-semibold
3. 状态点绿 `#1aae39` 白底 2.94:1 略低于 3:1(`theme.css:54`)→ 圆点加 2px 或同色描边
4. 标题旁语义徽章 tint 偏艳(≈`#e89f6c`,截图 01)→ 与表格徽章统一"中性底+彩点+墨字"
5. 信息噪声:总览副标题直出原始哈希(`OverviewView.tsx:147`)、组织长 ID 上墙(`app-sidebar.tsx:118`)、设置页标题重复(`SettingsView.tsx:240-241`)、JENKINS/FLOW 原始值 uppercase(`RepoCiCard.tsx:50` → 中文化"云效 Flow/Jenkins")
6. 日志查看器非等宽:`--font-mono` 映射到 Inter(`theme.css:65`),编号列不对齐、`break-all` 折断标识符、无行号/复制(`LogViewer.tsx:50`)→ 日志与编号场景启用真等宽栈
7. 输入框圆角 ≈6px vs 规范 4px(`input.tsx:11`);CI 抽屉遮罩偏亮 → `rgba(15,15,15,.3~.45)`
8. 触达目标基本达标(桌面 24–32px),无需处理;仅记录
9. 规范外散色 3 处令牌化:`#dceeff`(selection,`theme.css:200` → 用 `--accent-dim`)、`#fff0e8`(`button.tsx:18` → destructive alpha)、`#d6d2ce`(`theme.css:44` → 令牌化 hairline-strong)

### E. 需要你拍板的 2 个规范级决策

| 决策 | 现状 | 选项 |
|------|------|------|
| **失败色语义** | 严格锁进 sticker 调色板(`#793400`),忠实执行了 DESIGN.md,但规范本身没有"失败=红"语义位 | A. 允许失败一处语义例外(推荐,即 A1);B. 保持贴纸色+双通道编码(⚠/描边) |
| **主区画布** | 主区纯白 `#ffffff`,暖纸 `#f6f5f4` 用于侧栏/muted/hover/空态 | 判定为**桌面语境合理豁免**(Notion 官方桌面端同为白内容+灰侧栏;规范"clinical white"禁令针对营销整页)。可维持现状;若想更贴规范气质,给页头/设置页铺暖纸段 |

### F. 明确**不需要**调的(避免过度修正)

- 按钮 8px 替代营销 pill、15/14px 密度字号、badge"中性底+彩点"语法 —— 工具语境合理适配
- display 64/54/40 尺阶、`#213183` 夜间 hero 带、footer 未实现 —— 营销站专属,备而不用是正确的
- 1024px 容器(vs 规范 1080–1300)、触达目标 24–32px —— 桌面应用合理
- 焦点环/reduced-motion/⌘← 后退/脏导航守卫/两段式确认 —— 已达标,保持

---

## 1. 总体结论

> **这是一次高保真的 Notion 设计语言移植,工程纪律出色;问题集中在"已定义令牌未接线""禁用态样式借用了品牌蓝"与少量"规范 vs 可用性"张力点。**

| 审计维度 | 结论 |
|---|---|
| 令牌合规 | 无 P0/P1。28 个规范色 1:1 落位 `theme.css:20-48`;圆角阶 4/5/8/12/16px 逐字复刻(:163-170);h1=26px/700/−0.625px 精确命中 heading-2;4 项 P2(B1–B4) |
| Notion 相似度 | **78/100**。侧栏/表头/hairline/主蓝/状态点五处 token 级命中;三条真差距:第三轨蓝按钮(=A4)、白底白卡(=E 豁免)、mono-caps eyebrow(=B3/D5) |
| UX 无障碍 | 4 项 P1(A1–A4);焦点环全覆盖、reduced-motion 全局生效、键盘流基础扎实 |

**主色实测 `rgb(0,117,222)` = `#0075de`,与 DESIGN.md 一字不差**(取色 + `theme.css:75` 双重验证)。

## 2. 关键交叉验证:浅蓝按钮的真相

对照审计从截图像素实测到"第三轨蓝 `#7fbaee`+白字(≈2.1:1)";令牌审计与人工复核从 computed style 和源码证实:按钮背景仍是 `#0075de`,`ui/button.tsx:6` 的 `disabled:opacity-50` 在**只读门控**(`WriteOpButton.tsx:47`)与**空草稿**(`RequirementDetails.tsx:737`)场景下把品牌蓝稀释成 50% 透明。

→ 结论:不是新颜色 token,但 **A4 问题成立且为 P1**——它看起来像另一种按钮样式而非禁用,且键盘用户永远得不到原因。修法见 A4。

## 3. 合规亮点(保持,不要动)

1. 令牌转译几乎 1:1:28 色 + `--input:#dddddd` 精确复刻;圆角阶含 2xl+ 主动钳制防漂移
2. 状态色零新色、纪律严格;sig-idle 弃 `#a39e98`(2.66:1)改 `#615d59` 的对比度决策写在注释(`theme.css:50-56`)
3. 单一蓝色纪律:`#0075de` 只用于 CTA/焦点环/激活指示/链接,无第二结构 accent;`--brand-indigo` 仅定义未滥用
4. hairline 优先、卡片显式 `shadow-none`;弹层三层近透明阴影
5. focus-visible 蓝 ring 全组件覆盖;`prefers-reduced-motion` 全局;⌘← 后退不劫持输入框;设置页脏导航守卫;两段式内联确认(上轮 UX 评审成果)
6. 设置页是全场最 Notion 的一屏(居中窄列+白卡+卡头+帮助灰字),近乎范本

## 4. 修复路线图

**Quick wins(按顺序,多为单点改动)**
1. A1 失败色改红(`theme.css:55,83` 两处)
2. A2 面包屑同步(`IterationView.tsx:119`)
3. A4 禁用态灰阶化 + 只读横幅(`button.tsx:6`、`WriteOpButton.tsx:54`)
4. A3 可聚焦「加载更多」(`IterationView.tsx:275-281`)
5. C2 抽屉/日志补 X(`RepositoryCiDetails.tsx:57`、`LogViewer.tsx:39`)
6. B1 hover 接 `#005bab`(`button.tsx:10`)

**Strategic(体系化)**
1. 写操作门控体系化:全局只读状态条 + 统一"被门控按钮"组件(可聚焦、解释原因、直达设置开关),并统一运行/触发/刷新按钮族
2. 反馈组件升级:EmptyHint action 槽 + 统一错误文案模板,覆盖全部空态/失败态
3. 信息架构收敛:面包屑=页面唯一身份源;合并总览与迭代页的仓库 CI 双入口;⌘K 定位决策;计数口径统一
4. 设计令牌收口:B2/B3/B4 + D9 散色令牌化(一次小 PR)

---

## 附:材料与证据索引

- 应用截图:`/tmp/nervd-audit/01-iteration-view.png` … `20-trace-panel.png`(迭代视图/详情/总览/设置×4/折叠侧栏/缺陷任务Tab/未开始迭代/CI详情/日志/⌘K/hover/focus/追溯)
- Notion 参考:`/tmp/nervd-audit/n1~n5`(首页 hero、区块×2、定价头部、定价对照表,zh-cn 区)
- 关键源码锚点:`src/styles/theme.css`(令牌)、`src/components/ui/button.tsx`(按钮/禁用态)、`src/components/WriteOpButton.tsx`(门控)、`src/components/iteration/IterationView.tsx`(列表/回退)、`src/components/nav/app-sidebar.tsx`、`app-breadcrumb.tsx`
- 审计方式:3 路独立 subagent(令牌合规/品牌对照/UX 无障碍)+ 人工像素取色交叉验证;结论冲突处(浅蓝按钮)已用源码裁决
