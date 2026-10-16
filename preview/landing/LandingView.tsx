import React from 'react';
import {
  Layers,
  Columns,
  GitBranch,
  ShieldCheck,
  ArrowRight,
  Terminal,
  ExternalLink,
  Laptop,
  Command,
  Sun,
  Moon,
  CheckCircle2,
  Play,
  RotateCw,
  GitCommit,
  GitPullRequest,
  Workflow,
  Sparkles,
} from 'lucide-react';
import { Particles } from './components/Particles';
import { ShinyText } from './components/ShinyText';
import { DecryptedText } from './components/DecryptedText';
import { BlurText } from './components/BlurText';
import { SpotlightCard } from './components/SpotlightCard';
import { StarBorder } from './components/StarBorder';
import { useUi } from '../../src/store/ui';
import { APP_VERSION } from '../../src/lib/app-info';

interface LandingViewProps {
  onLaunchWorkbench: () => void;
}

export const LandingView: React.FC<LandingViewProps> = ({ onLaunchWorkbench }) => {
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-x-hidden selection:bg-primary/20 selection:text-primary">
      {/* Dynamic Background Particles (React Bits) */}
      <Particles
        particleColors={['#5e6ad2', '#4f46b5', '#8a8f98', '#30a46c']}
        particleCount={45}
        speed={0.25}
        particleBaseSize={2}
        className="opacity-70"
      />

      {/* Top Navigation */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="./nervd-logo.png"
              alt="nervd logo"
              className="w-8 h-8 rounded-lg shadow-sm border border-border"
            />
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-lg tracking-tight">nervd</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-mono">
                v{APP_VERSION} · macOS
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground font-medium">
            <a href="#features" className="hover:text-foreground transition-colors">
              核心特性
            </a>
            <a href="#traceability" className="hover:text-foreground transition-colors">
              全链路追溯
            </a>
            <a href="#keyboard" className="hover:text-foreground transition-colors">
              全键盘交互
            </a>
            <a href="#architecture" className="hover:text-foreground transition-colors">
              技术架构
            </a>
            <a
              href="https://github.com/AZenking/nervd"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground transition-colors flex items-center gap-1"
            >
              GitHub <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="切换明暗主题"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={onLaunchWorkbench}
              className="text-xs sm:text-sm font-medium px-3.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
            >
              <span>开启在线工作台</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-20 pb-24 md:pt-28 md:pb-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        {/* Shiny Badge (React Bits) */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card/60 backdrop-blur-sm shadow-sm mb-6">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <ShinyText
            text="以云效需求为核心维度的一站式 CI/CD 桌面工作台"
            speed={4}
            className="text-xs sm:text-sm text-muted-foreground"
          />
        </div>

        {/* BlurText Hero Headline (React Bits) */}
        <div className="max-w-4xl mx-auto mb-6">
          <BlurText
            text="告别多标签横跳 一屏掌控研发全生命周期"
            delay={80}
            className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight justify-center leading-tight"
          />
        </div>

        {/* DecryptedText Subtitle (React Bits) */}
        <div className="max-w-2xl mx-auto text-muted-foreground text-base sm:text-lg mb-10 min-h-[4rem]">
          <DecryptedText
            text="云效 Projex、Codeup 与 Flow 数据割裂？nervd 将 需求 → 分支 → Commit → MR → 流水线 全链路收敛至单屏，就地触发、看日志、回写状态与系统通知。"
            speed={25}
            maxIterations={8}
            className="leading-relaxed"
          />
        </div>

        {/* Call to Actions (StarBorder Button from React Bits) */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          <StarBorder
            onClick={onLaunchWorkbench}
            className="cursor-pointer"
            color="#5e6ad2"
            speed="5s"
          >
            <div className="px-6 py-3 flex items-center gap-2 text-sm sm:text-base font-semibold">
              <Sparkles className="w-4 h-4 text-primary" />
              <span>进入在线模拟工作台</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
            </div>
          </StarBorder>

          <a
            href="https://github.com/AZenking/nervd/releases"
            target="_blank"
            rel="noreferrer"
            className="px-5 py-3 rounded-lg border border-border bg-secondary hover:bg-secondary/80 text-foreground text-sm sm:text-base font-medium flex items-center gap-2 transition-all"
          >
            <Laptop className="w-4 h-4 text-muted-foreground" />
            <span>下载 macOS 客户端 (.dmg)</span>
          </a>

          <a
            href="https://github.com/AZenking/nervd"
            target="_blank"
            rel="noreferrer"
            className="px-4 py-3 rounded-lg border border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
          >
            Star on GitHub
          </a>
        </div>

        {/* Visual Mock Showcase (Live Traceability Flow Mock) */}
        <div id="traceability" className="mt-16 md:mt-20 max-w-5xl mx-auto">
          <div className="rounded-xl border border-border bg-card/90 backdrop-blur-md shadow-2xl p-4 sm:p-6 overflow-hidden text-left">
            <div className="flex items-center justify-between pb-4 border-b border-border/80">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                <span className="ml-2 text-xs font-mono text-muted-foreground">
                  nervd · 全链路极速检视链路
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
                  j / k 键盘联动就绪
                </span>
              </div>
            </div>

            {/* Traceability Pipeline Steps */}
            <div className="py-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Step 1 */}
              <div className="p-3.5 rounded-lg border border-border bg-background/60">
                <div className="text-[11px] font-mono text-muted-foreground mb-1 flex items-center justify-between">
                  <span>1. 云效需求</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                </div>
                <div className="font-semibold text-sm">REQ-101</div>
                <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                  重构流水线状态轮询
                </div>
                <div className="mt-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary w-fit">
                  开发中
                </div>
              </div>

              {/* Step 2 */}
              <div className="p-3.5 rounded-lg border border-border bg-background/60">
                <div className="text-[11px] font-mono text-muted-foreground mb-1 flex items-center justify-between">
                  <span>2. 匹配分支</span>
                  <GitBranch className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <div className="font-semibold text-sm font-mono truncate">
                  feat/req-101
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  基准: master
                </div>
                <div className="mt-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 w-fit">
                  ahead: 2, behind: 0
                </div>
              </div>

              {/* Step 3 */}
              <div className="p-3.5 rounded-lg border border-border bg-background/60">
                <div className="text-[11px] font-mono text-muted-foreground mb-1 flex items-center justify-between">
                  <span>3. Commit</span>
                  <GitCommit className="w-3.5 h-3.5 text-purple-400" />
                </div>
                <div className="font-semibold text-sm font-mono">7a3f8b1</div>
                <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                  feat(poller): native notif
                </div>
                <div className="mt-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground w-fit">
                  10 分钟前
                </div>
              </div>

              {/* Step 4 */}
              <div className="p-3.5 rounded-lg border border-border bg-background/60">
                <div className="text-[11px] font-mono text-muted-foreground mb-1 flex items-center justify-between">
                  <span>4. 合并请求</span>
                  <GitPullRequest className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="font-semibold text-sm font-mono">MR #42</div>
                <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                  2 人已 Review
                </div>
                <div className="mt-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 w-fit">
                  Ready to Merge
                </div>
              </div>

              {/* Step 5 */}
              <div className="p-3.5 rounded-lg border border-primary/40 bg-primary/5">
                <div className="text-[11px] font-mono text-primary mb-1 flex items-center justify-between">
                  <span>5. 流水线 (Flow)</span>
                  <RotateCw className="w-3.5 h-3.5 text-primary animate-spin" />
                </div>
                <div className="font-semibold text-sm font-mono">Build #142</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  单元测试 & 构建中
                </div>
                <div className="mt-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 w-fit">
                  运行中 (01:24)
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border/80 text-xs text-muted-foreground">
              <span>在单屏内就地查看详细构建日志，无需开启任何外部浏览器标签</span>
              <button
                onClick={onLaunchWorkbench}
                className="text-primary hover:underline flex items-center gap-1 font-medium"
              >
                在工作台中查看完整演示 <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Core Features Matrix (SpotlightCard from React Bits) */}
      <section id="features" className="py-20 border-t border-border bg-muted/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
              专为极速研发流打造的五大核心能力
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base">
              严格对齐 Linear 设计哲学，以深色冷黑为主基调，提供无缝连贯的键盘操作体验。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Feature 1 */}
            <SpotlightCard className="flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4">
                  <Layers className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold mb-2">迭代工作台 (Iteration View)</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  工作项列表按生命周期语义严格分组（运行中 → 失败 → 空闲 → 成功）。
                  全宽无边框裸行（Border-less Raw Rows），固定每页 30 条硬分页机制，彻底消除长列表无限滚动的内存累积与渲染卡顿。
                </p>
              </div>
              <div className="pt-3 border-t border-border/60 flex items-center gap-2 text-xs font-mono text-muted-foreground">
                <span className="px-2 py-0.5 rounded bg-muted">30条分页</span>
                <span className="px-2 py-0.5 rounded bg-muted">行首 Popover 流转</span>
                <span className="px-2 py-0.5 rounded bg-muted">浮动批量操作条</span>
              </div>
            </SpotlightCard>

            {/* Feature 2 */}
            <SpotlightCard className="flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-4">
                  <Columns className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold mb-2">Master-Detail 连续联动检视</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  按 Enter 展开详情分栏；在分栏开启状态下，通过 j / k 光标移动，右侧详情毫秒级实时联动刷新，无需反复开合。
                  支持子任务卡片行内直接按回车创建、就地钻取与 Esc 逐级退回。
                </p>
              </div>
              <div className="pt-3 border-t border-border/60 flex items-center gap-2 text-xs font-mono text-muted-foreground">
                <span className="px-2 py-0.5 rounded bg-muted">j / k 联动</span>
                <span className="px-2 py-0.5 rounded bg-muted">行内极速建子任务</span>
                <span className="px-2 py-0.5 rounded bg-muted">Esc 阶梯退回</span>
              </div>
            </SpotlightCard>

            {/* Feature 3 */}
            <SpotlightCard className="flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-4">
                  <GitBranch className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold mb-2">端到端全链路交付拓扑</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  需求与代码仓库基于灵活正则深度关联。关联仓库卡片（LinkedRepoCard）汇聚 MR 与流水线状态；
                  分支状态图谱（BranchStateDiagram）真实展现基准分支与开发分支的分叉与落后情况。
                </p>
              </div>
              <div className="pt-3 border-t border-border/60 flex items-center gap-2 text-xs font-mono text-muted-foreground">
                <span className="px-2 py-0.5 rounded bg-muted">LinkedRepoCard</span>
                <span className="px-2 py-0.5 rounded bg-muted">超前/落后落差</span>
                <span className="px-2 py-0.5 rounded bg-muted">实时构建日志抽屉</span>
              </div>
            </SpotlightCard>

            {/* Feature 4 */}
            <SpotlightCard className="flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold mb-2">集成分支只读大盘 & 凭证安全</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  纯查看、零写操作的高级代码交付视图，实时扫描 release/* 分支与 master 的落差，自动正则提取需求编号。
                  访问凭证安全存入 macOS Keychain，写操作通过前端与 Rust IPC 双重门控。
                </p>
              </div>
              <div className="pt-3 border-t border-border/60 flex items-center gap-2 text-xs font-mono text-muted-foreground">
                <span className="px-2 py-0.5 rounded bg-muted">macOS Keychain</span>
                <span className="px-2 py-0.5 rounded bg-muted">allowWriteOps 门控</span>
                <span className="px-2 py-0.5 rounded bg-muted">零写操作视图</span>
              </div>
            </SpotlightCard>
          </div>
        </div>
      </section>

      {/* Keyboard-First Interactive Cheat Sheet */}
      <section id="keyboard" className="py-20 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
              全键盘优先交互心智 (Keyboard-First)
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base">
              双手无需离开键盘。对齐主流专业级桌面客户端标准快捷键设计：
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* Column 1 */}
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center gap-2 font-semibold mb-4 text-sm">
                <Terminal className="w-4 h-4 text-primary" />
                <span>光标移动与检视</span>
              </div>
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">移动至下一项</span>
                  <kbd className="px-2 py-1 rounded bg-muted font-mono font-bold text-foreground">
                    j / ↓
                  </kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">移动至上一项</span>
                  <kbd className="px-2 py-1 rounded bg-muted font-mono font-bold text-foreground">
                    k / ↑
                  </kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">展开分栏详情</span>
                  <kbd className="px-2 py-1 rounded bg-muted font-mono font-bold text-foreground">
                    Enter
                  </kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">连续检视刷新</span>
                  <span className="text-muted-foreground italic font-mono">
                    分栏下 j/k 自动联动
                  </span>
                </div>
              </div>
            </div>

            {/* Column 2 */}
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center gap-2 font-semibold mb-4 text-sm">
                <Command className="w-4 h-4 text-blue-400" />
                <span>批量与退出流转</span>
              </div>
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">选中/取消多选行</span>
                  <kbd className="px-2 py-1 rounded bg-muted font-mono font-bold text-foreground">
                    x
                  </kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">上一页 / 下一页</span>
                  <div className="flex gap-1">
                    <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono font-bold">
                      [
                    </kbd>
                    <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono font-bold">
                      ]
                    </kbd>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">全局命令面板</span>
                  <kbd className="px-2 py-1 rounded bg-muted font-mono font-bold text-foreground">
                    ⌘ K
                  </kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">五级阶梯退回</span>
                  <kbd className="px-2 py-1 rounded bg-muted font-mono font-bold text-foreground">
                    Esc
                  </kbd>
                </div>
              </div>
            </div>

            {/* Column 3 */}
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center gap-2 font-semibold mb-4 text-sm">
                <Workflow className="w-4 h-4 text-emerald-400" />
                <span>G 序列单手导航</span>
              </div>
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">跳转至总览</span>
                  <div className="flex gap-1 font-mono font-bold">
                    <kbd className="px-1.5 py-0.5 rounded bg-muted">g</kbd>
                    <kbd className="px-1.5 py-0.5 rounded bg-muted">o</kbd>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">跳转至当前迭代</span>
                  <div className="flex gap-1 font-mono font-bold">
                    <kbd className="px-1.5 py-0.5 rounded bg-muted">g</kbd>
                    <kbd className="px-1.5 py-0.5 rounded bg-muted">i</kbd>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">跳转至集成分支</span>
                  <div className="flex gap-1 font-mono font-bold">
                    <kbd className="px-1.5 py-0.5 rounded bg-muted">g</kbd>
                    <kbd className="px-1.5 py-0.5 rounded bg-muted">b</kbd>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">跳转至系统设置</span>
                  <div className="flex gap-1 font-mono font-bold">
                    <kbd className="px-1.5 py-0.5 rounded bg-muted">g</kbd>
                    <kbd className="px-1.5 py-0.5 rounded bg-muted">s</kbd>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tech Stack & Architecture */}
      <section id="architecture" className="py-20 border-t border-border bg-muted/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
              现代原生桌面工程架构
            </h2>
            <p className="text-muted-foreground text-sm">
              Tauri 2 极低资源开销 + React 19 + Tailwind v4 + Base UI 无障碍原语
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-center max-w-4xl mx-auto">
            <div className="p-4 rounded-lg border border-border bg-card">
              <div className="font-bold text-sm">Tauri 2</div>
              <div className="text-xs text-muted-foreground mt-1">Rust IPC 核心</div>
            </div>
            <div className="p-4 rounded-lg border border-border bg-card">
              <div className="font-bold text-sm">React 19</div>
              <div className="text-xs text-muted-foreground mt-1">并发状态渲染</div>
            </div>
            <div className="p-4 rounded-lg border border-border bg-card">
              <div className="font-bold text-sm">TypeScript</div>
              <div className="text-xs text-muted-foreground mt-1">类型安全保障</div>
            </div>
            <div className="p-4 rounded-lg border border-border bg-card">
              <div className="font-bold text-sm">Tailwind v4</div>
              <div className="text-xs text-muted-foreground mt-1">CSS-first 主题</div>
            </div>
            <div className="p-4 rounded-lg border border-border bg-card">
              <div className="font-bold text-sm">Base UI</div>
              <div className="text-xs text-muted-foreground mt-1">无障碍交互原语</div>
            </div>
            <div className="p-4 rounded-lg border border-border bg-card">
              <div className="font-bold text-sm">Zustand</div>
              <div className="text-xs text-muted-foreground mt-1">原子状态分流</div>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section className="py-20 border-t border-border relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight mb-4">
            准备好体验极速研发工作台了吗？
          </h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto text-sm sm:text-base">
            无需下载安装，直接在浏览器中体验包含完整 Mock 数据的真实交互界面。
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={onLaunchWorkbench}
              className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all shadow-lg active:scale-95 flex items-center gap-2"
            >
              <span>立即开启在线工作台</span>
              <Play className="w-4 h-4 fill-current" />
            </button>
            <a
              href="https://github.com/AZenking/nervd"
              target="_blank"
              rel="noreferrer"
              className="px-6 py-3 rounded-lg border border-border bg-card hover:bg-muted text-foreground font-medium transition-colors"
            >
              在 GitHub 上查看源码
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span>nervd · 基于 Tauri 2 与 React 19 构建</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/AZenking/nervd"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground transition-colors"
            >
              GitHub 仓库
            </a>
            <span>•</span>
            <a
              href="https://github.com/AZenking/nervd/blob/master/DESIGN.md"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground transition-colors"
            >
              设计系统规范 (DESIGN.md)
            </a>
            <span>•</span>
            <span>MIT License</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
