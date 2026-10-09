import { useMemo, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowUpRight,
  Bell,
  Boxes,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleDot,
  Clock3,
  Database,
  ExternalLink,
  FileText,
  Filter,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  LayoutDashboard,
  ListFilter,
  LockKeyhole,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import { Badge } from '../src/components/ui/badge';
import { Alert, AlertDescription } from '../src/components/ui/alert';
import { Avatar, AvatarFallback } from '../src/components/ui/avatar';
import { Button } from '../src/components/ui/button';
import { Card, CardContent } from '../src/components/ui/card';
import { Checkbox } from '../src/components/ui/checkbox';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../src/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '../src/components/ui/field';
import { Input } from '../src/components/ui/input';
import { Progress } from '../src/components/ui/progress';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../src/components/ui/select';
import { Separator } from '../src/components/ui/separator';
import { Switch } from '../src/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../src/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../src/components/ui/tabs';
import { Toaster, toast } from '../src/components/ui/toast';
import { ToggleGroup, ToggleGroupItem } from '../src/components/ui/toggle-group';

type Tone = 'ok' | 'run' | 'fail' | 'idle' | 'info';
type Section = 'overview' | 'workbench' | 'iterations' | 'pipelines' | 'repositories' | 'settings';
type SettingsTab = 'connection' | 'trace' | 'ci' | 'security';
type WorkItemKind = '需求' | '缺陷' | '任务';

interface CiTarget {
  id: string;
  environment: string;
  label: string;
  status: string;
  tone: Tone;
  run: string;
}

interface WorkItemRepository {
  id: string;
  name: string;
  provider: string;
  branch: string;
  iterationBranch: string;
  mergeStatus: string;
  mergeTone: Tone;
  commit: string;
  mr: string;
  ciTargets: CiTarget[];
}

interface WorkItem {
  id: string;
  code: string;
  title: string;
  kind: WorkItemKind;
  status: string;
  tone: Tone;
  assignee: string;
  updated: string;
  space: string;
  intro: string;
  description: string;
  iterationId: string;
  parentRequirement?: string;
  childIds?: string[];
  repositories: WorkItemRepository[];
  comments: number;
}

interface Iteration {
  id: string;
  code: string;
  name: string;
  status: string;
  tone: Tone;
  period: string;
  baseBranch: string;
  devBranch: string;
  baseBranchReady: boolean;
  devBranchReady: boolean;
  requirementCount: number;
  taskCount: number;
  workItemIds: string[];
}

interface Pipeline {
  id: string;
  name: string;
  key: string;
  status: string;
  tone: Tone;
  run: string;
  branch: string;
  time: string;
  duration: string;
  passRate: number;
  totalRuns: number;
}

interface Repository {
  id: string;
  name: string;
  provider: string;
  status: string;
  tone: Tone;
  branch: string;
  lastRun: string;
  uptime: string;
  activity: string;
  environments: string[];
}

interface ActivityItem {
  time: string;
  title: string;
  detail: string;
  tone: Tone;
  icon: LucideIcon;
}

const workItems: WorkItem[] = [
  {
    id: 'REQ-2048',
    code: 'REQ-2048',
    title: '支持需求链路一键回溯',
    kind: '需求',
    status: '开发中',
    tone: 'run',
    assignee: '林默',
    updated: '8 分钟前',
    space: '平台工程',
    intro: '让“需求 → 分支 → 提交 → MR → 流水线”在一个工作面内可解释、可操作。',
    description: '当前需求正在整理追溯链路展示。关联的代码仓库、分支和流水线状态会在右侧实时汇总，便于交付前快速确认。',
    iterationId: 'iter-18',
    childIds: ['TASK-417', 'TASK-420'],
    repositories: [
      {
        id: 'repo-01',
        name: 'codeup / nervd-web',
        provider: '云效 Flow',
        branch: 'feature/REQ-2048-trace',
        iterationBranch: 'iteration/Benz-20261016',
        mergeStatus: '待合入迭代分支',
        mergeTone: 'run',
        commit: '9f3ac21',
        mr: '!128 · 支持链路回溯视图',
        ciTargets: [
          { id: 'ci-web-staging', environment: 'staging', label: 'nervd-web · staging', status: 'SUCCESS', tone: 'ok', run: '#122' },
          { id: 'ci-web-production', environment: 'production', label: 'nervd-web · production', status: 'SUCCESS', tone: 'ok', run: '#128' },
        ],
      },
      {
        id: 'repo-02',
        name: 'codeup / nervd-core',
        provider: 'Jenkins',
        branch: 'feature/REQ-2048-core',
        iterationBranch: 'iteration/Benz-20261016',
        mergeStatus: '已合入迭代分支',
        mergeTone: 'ok',
        commit: 'b2c44e8',
        mr: '!127 · 接入追溯查询',
        ciTargets: [
          { id: 'ci-core-dev', environment: 'dev', label: 'nervd-core · dev', status: 'RUNNING', tone: 'run', run: '#76' },
          { id: 'ci-core-release', environment: 'release', label: 'nervd-core · release', status: 'SUCCESS', tone: 'ok', run: '#72' },
        ],
      },
    ],
    comments: 6,
  },
  {
    id: 'BUG-892',
    code: 'BUG-892',
    title: '流水线失败后仍显示运行中',
    kind: '缺陷',
    status: '待验证',
    tone: 'info',
    assignee: '周弦',
    updated: '21 分钟前',
    space: '交付稳定性',
    intro: '修正事件轮询和桌面通知之间的状态落差。',
    description: '验证阶段关注运行结束事件、列表刷新和通知状态是否一致，避免工作台继续显示过期的运行中状态。',
    iterationId: 'iter-18',
    repositories: [
      {
        id: 'repo-02',
        name: 'codeup / nervd-core',
        provider: 'Jenkins',
        branch: 'fix/BUG-892-run-state',
        iterationBranch: 'iteration/Benz-20261016',
        mergeStatus: '冲突待处理',
        mergeTone: 'fail',
        commit: 'b7e110d',
        mr: '!123 · 修正流水线终态映射',
        ciTargets: [
          { id: 'ci-bug892-dev', environment: 'dev', label: 'nervd-core · dev', status: 'RUNNING', tone: 'run', run: '#76' },
          { id: 'ci-bug892-release', environment: 'release', label: 'nervd-core · release', status: 'FAIL', tone: 'fail', run: '#75' },
        ],
      },
    ],
    comments: 3,
  },
  {
    id: 'TASK-417',
    code: 'TASK-417',
    title: '补充 Jenkins 多实例配置说明',
    kind: '任务',
    status: '已完成',
    tone: 'ok',
    assignee: '苏禾',
    updated: '今天 09:34',
    space: '工程效率',
    intro: '把连接、Job 全路径和仓库绑定整理成可复用配置模板。',
    description: '设置页现在能够区分云效 Flow 与 Jenkins，并在仓库层面选择对应的 CI 供应商。此处为静态展示数据。',
    iterationId: 'iter-18',
    parentRequirement: 'REQ-2048',
    repositories: [
      {
        id: 'repo-03',
        name: 'docs / delivery-handbook',
        provider: '云效 Flow',
        branch: 'docs/TASK-417-jenkins',
        iterationBranch: 'iteration/Benz-20261016',
        mergeStatus: '已合入迭代分支',
        mergeTone: 'ok',
        commit: '44f0d2a',
        mr: '!119 · 补充 CI 配置文档',
        ciTargets: [
          { id: 'ci-docs-staging', environment: 'staging', label: 'docs-site · staging', status: 'SUCCESS', tone: 'ok', run: '#43' },
        ],
      },
    ],
    comments: 8,
  },
  {
    id: 'TASK-420',
    code: 'TASK-420',
    title: '补充多环境 CI 标签展示',
    kind: '任务',
    status: '待开发',
    tone: 'info',
    assignee: '陈岑',
    updated: '今天 10:18',
    space: '平台工程',
    intro: '让仓库下不同环境的 CI 目标在需求链路中可区分、可单独触发。',
    description: '为每个关联仓库展示 staging、dev、release、production 等 CI 环境，并把运行入口放到具体环境下。',
    iterationId: 'iter-18',
    parentRequirement: 'REQ-2048',
    repositories: [
      {
        id: 'repo-02',
        name: 'codeup / nervd-core',
        provider: 'Jenkins',
        branch: 'task/TASK-420-ci-env',
        iterationBranch: 'iteration/Benz-20261016',
        mergeStatus: '未提交 MR',
        mergeTone: 'info',
        commit: 'c190ab2',
        mr: '—',
        ciTargets: [
          { id: 'ci-task420-dev', environment: 'dev', label: 'nervd-core · dev', status: 'WAITING', tone: 'info', run: '—' },
        ],
      },
    ],
    comments: 1,
  },
  {
    id: 'REQ-2039',
    code: 'REQ-2039',
    title: '总览页增加仓库健康度',
    kind: '需求',
    status: '已评审',
    tone: 'info',
    assignee: '林默',
    updated: '昨天 18:26',
    space: '平台工程',
    intro: '将监控仓库的最新 CI 结果和通过率放到总览第一屏。',
    description: '通过率、最近构建、失败原因和日志入口集中呈现，帮助使用者先定位异常，再进入具体工作项。',
    iterationId: 'iter-18',
    repositories: [
      {
        id: 'repo-01',
        name: 'codeup / nervd-web',
        provider: '云效 Flow',
        branch: 'feature/REQ-2039-repo-health',
        iterationBranch: 'iteration/Benz-20261016',
        mergeStatus: '已合入迭代分支',
        mergeTone: 'ok',
        commit: 'd1c30aa',
        mr: '!116 · 总览仓库健康度',
        ciTargets: [
          { id: 'ci-req2039-web-staging', environment: 'staging', label: 'nervd-web · staging', status: 'SUCCESS', tone: 'ok', run: '#122' },
          { id: 'ci-req2039-web-production', environment: 'production', label: 'nervd-web · production', status: 'SUCCESS', tone: 'ok', run: '#120' },
        ],
      },
      {
        id: 'repo-03',
        name: 'docs / delivery-handbook',
        provider: '云效 Flow',
        branch: 'docs/REQ-2039-health-docs',
        iterationBranch: 'iteration/Benz-20261016',
        mergeStatus: '待合入迭代分支',
        mergeTone: 'run',
        commit: 'a82d190',
        mr: '!117 · 更新健康度说明',
        ciTargets: [
          { id: 'ci-req2039-docs-production', environment: 'production', label: 'docs-site · deploy', status: 'SUCCESS', tone: 'ok', run: '#44' },
        ],
      },
    ],
    comments: 4,
  },
  {
    id: 'BUG-864',
    code: 'BUG-864',
    title: '空追溯结果需要更明确的引导',
    kind: '缺陷',
    status: '已关闭',
    tone: 'idle',
    assignee: '—',
    updated: '10 月 07 日',
    space: '体验优化',
    intro: '在没有关联分支时，让用户知道下一步应该在哪里配置。',
    description: '空状态不再只显示“无数据”，而是说明关联仓库和 ID 规则，降低第一次使用时的理解成本。',
    iterationId: 'iter-17',
    repositories: [
      {
        id: 'repo-01',
        name: 'codeup / nervd-web',
        provider: '云效 Flow',
        branch: 'fix/BUG-864-empty-trace',
        iterationBranch: 'iteration/17',
        mergeStatus: '已合入迭代分支',
        mergeTone: 'ok',
        commit: '8036bf4',
        mr: '!111 · 补充追溯空状态',
        ciTargets: [
          { id: 'ci-bug864-production', environment: 'production', label: 'nervd-web · production', status: 'SUCCESS', tone: 'ok', run: '#118' },
        ],
      },
    ],
    comments: 2,
  },
];

const iterations: Iteration[] = [
  {
    id: 'iter-18',
    code: 'Benz-20261016',
    name: 'Benz-20261016 · 前端优化迭代',
    status: '进行中',
    tone: 'run',
    period: '2026.10.01 — 2026.10.16',
    baseBranch: 'iteration/Benz-20261016',
    devBranch: 'dev',
    baseBranchReady: true,
    devBranchReady: true,
    requirementCount: 2,
    taskCount: 2,
    workItemIds: ['REQ-2048', 'BUG-892', 'REQ-2039', 'TASK-417', 'TASK-420'],
  },
  {
    id: 'iter-17',
    code: 'ITER-17',
    name: '稳定性 · Iteration 17',
    status: '已归档',
    tone: 'idle',
    period: '2026.09.12 — 2026.09.30',
    baseBranch: 'iteration/17',
    devBranch: 'dev',
    baseBranchReady: true,
    devBranchReady: true,
    requirementCount: 0,
    taskCount: 0,
    workItemIds: [],
  },
];

const pipelines: Pipeline[] = [
  { id: 'flow-01', name: 'nervd-web · production', key: 'web-prod', status: 'SUCCESS', tone: 'ok', run: '#128', branch: 'feature/REQ-2048-trace', time: '5 分钟前', duration: '08m 42s', passRate: 96, totalRuns: 48 },
  { id: 'flow-02', name: 'nervd-core · release', key: 'core-release', status: 'RUNNING', tone: 'run', run: '#76', branch: 'fix/BUG-892-run-state', time: '刚刚', duration: '进行中', passRate: 88, totalRuns: 32 },
  { id: 'flow-03', name: 'docs-site · deploy', key: 'docs-deploy', status: 'SUCCESS', tone: 'ok', run: '#44', branch: 'docs/TASK-417-jenkins', time: '今天 09:18', duration: '03m 11s', passRate: 100, totalRuns: 19 },
  { id: 'flow-04', name: 'mobile-shell · nightly', key: 'mobile-nightly', status: 'FAIL', tone: 'fail', run: '#203', branch: 'main', time: '昨天 23:47', duration: '12m 06s', passRate: 72, totalRuns: 104 },
];

const repositories: Repository[] = [
  { id: 'repo-01', name: 'codeup / nervd-web', provider: '云效 Flow', status: 'SUCCESS', tone: 'ok', branch: 'main', lastRun: '#128 · 5 分钟前', uptime: '98.6%', activity: '3 个活跃分支', environments: ['staging', 'production'] },
  { id: 'repo-02', name: 'codeup / nervd-core', provider: 'Jenkins', status: 'RUNNING', tone: 'run', branch: 'release/1.8', lastRun: '#76 · 运行中', uptime: '94.1%', activity: '2 个活跃分支', environments: ['dev', 'release'] },
  { id: 'repo-03', name: 'docs / delivery-handbook', provider: '云效 Flow', status: 'SUCCESS', tone: 'ok', branch: 'main', lastRun: '#44 · 今天 09:18', uptime: '100%', activity: '文档已发布', environments: ['staging', 'production'] },
  { id: 'repo-04', name: 'mobile / shell', provider: 'Jenkins', status: 'FAIL', tone: 'fail', branch: 'main', lastRun: '#203 · 昨天 23:47', uptime: '86.8%', activity: '需查看日志', environments: ['nightly'] },
];

const activities: ActivityItem[] = [
  { time: '09:42', title: 'nervd-web #128 已通过', detail: 'REQ-2048 · feature/REQ-2048-trace', tone: 'ok', icon: Check },
  { time: '09:35', title: 'BUG-892 进入待验证', detail: '状态由开发中回写为待验证', tone: 'info', icon: CircleDot },
  { time: '09:18', title: 'docs-site #44 已发布', detail: 'TASK-417 · delivery-handbook', tone: 'ok', icon: Zap },
  { time: '08:57', title: 'mobile-shell #203 失败', detail: 'main · 查看控制台日志', tone: 'fail', icon: CircleAlert },
];

const navItems: { id: Section; label: string; caption: string; icon: LucideIcon }[] = [
  { id: 'overview', label: '总览', caption: '系统脉搏', icon: LayoutDashboard },
  { id: 'workbench', label: '工作台', caption: '需求与追溯', icon: Boxes },
  { id: 'iterations', label: '迭代', caption: '分支基线', icon: CalendarDays },
  { id: 'pipelines', label: '流水线', caption: '运行与日志', icon: Workflow },
  { id: 'repositories', label: '仓库 CI', caption: '健康度监控', icon: GitBranch },
  { id: 'settings', label: '设置', caption: '连接与策略', icon: Settings2 },
];

function ToneDot({ tone }: { tone: Tone }) {
  return <span className={`sample-tone-dot tone-${tone}`} aria-hidden="true" />;
}

function StatusBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <Badge variant="outline" className={`sample-status-badge tone-${tone}`}>
      <ToneDot tone={tone} />
      {children}
    </Badge>
  );
}

function ciStatusLabel(status: string): string {
  if (status === 'SUCCESS') return '最近通过';
  if (status === 'RUNNING') return '运行中';
  if (status === 'FAIL') return '最近失败';
  if (status === 'WAITING') return '未运行';
  return status;
}

function SectionEyebrow({ children }: { children: ReactNode }) {
  return <div className="sample-eyebrow">{children}</div>;
}

function Topbar({
  section,
  query,
  onQueryChange,
  onNotice,
}: {
  section: Section;
  query: string;
  onQueryChange: (value: string) => void;
  onNotice: (message: string) => void;
}) {
  const current = navItems.find((item) => item.id === section) ?? navItems[0];
  return (
    <header className="sample-topbar">
      <div className="sample-breadcrumb">
        <span className="sample-breadcrumb-muted">nervd</span>
        <ChevronRight size={14} />
        <span>{current.label}</span>
      </div>
      <div className="sample-topbar-actions">
        <label className="sample-global-search">
          <Search size={16} />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索工作项、分支或仓库…"
            aria-label="搜索工作项、分支或仓库"
          />
          <kbd>⌘ K</kbd>
        </label>
        <Button variant="ghost" size="icon" className="sample-icon-button" onClick={() => onNotice('演示环境没有新的系统通知')} aria-label="通知">
          <Bell size={17} />
          <span className="sample-notification-dot" />
        </Button>
        <div className="sample-topbar-divider" />
        <div className="sample-user-chip">
          <Avatar size="sm" className="sample-avatar"><AvatarFallback className="sample-avatar-fallback">CM</AvatarFallback></Avatar>
          <span className="sample-user-name">Charles</span>
          <ChevronDown size={14} />
        </div>
      </div>
    </header>
  );
}

function Sidebar({ section, selectedId, onSectionChange, onSelectItem, writeEnabled }: { section: Section; selectedId: string; onSectionChange: (section: Section) => void; onSelectItem: (id: string) => void; writeEnabled: boolean }) {
  const [expandedIterations, setExpandedIterations] = useState<string[]>(['iter-18']);
  const selectedWorkItem = workItems.find((item) => item.id === selectedId);
  const selectedRequirementId = selectedWorkItem?.kind === '需求' ? selectedWorkItem.id : selectedWorkItem?.parentRequirement;
  const toggleIteration = (iterationId: string) => {
    setExpandedIterations((current) => current.includes(iterationId) ? current.filter((id) => id !== iterationId) : [...current, iterationId]);
  };

  return (
    <aside className="sample-sidebar">
      <div className="sample-brand-row">
        <div className="sample-brand-mark">n</div>
        <div>
          <div className="sample-brand-name">nervd</div>
          <div className="sample-brand-subtitle">delivery control</div>
        </div>
      </div>

      <div className="sample-workspace-switcher">
        <div className="sample-workspace-icon"><Database size={15} /></div>
        <div className="sample-workspace-copy">
          <span className="sample-side-muted">工作区</span>
          <strong>平台工程 / 默认</strong>
        </div>
        <ChevronDown size={14} className="sample-side-muted" />
      </div>

      <div className="sample-side-section-label">交付范围</div>
      <nav className="sample-sidebar-tree" aria-label="迭代与需求">
        {iterations.map((iteration) => {
          const requirements = workItems.filter((item) => item.kind === '需求' && item.iterationId === iteration.id);
          const expanded = expandedIterations.includes(iteration.id);
          const iterationActive = section === 'iterations' && iteration.id === 'iter-18';
          return (
            <div className="sample-sidebar-iteration" key={iteration.id}>
              <Button
                variant="ghost"
                className={`sample-sidebar-iteration-trigger${iterationActive ? ' is-active' : ''}`}
                onClick={() => { toggleIteration(iteration.id); onSectionChange('iterations'); }}
                aria-expanded={expanded}
                aria-controls={`sample-sidebar-requirements-${iteration.id}`}
              >
                <span className="sample-sidebar-iteration-icon"><CalendarDays size={15} /></span>
                <span className="sample-sidebar-iteration-copy">
                  <strong>{iteration.code}</strong>
                  <small>{iteration.status} · {requirements.length} 个需求</small>
                </span>
                <span className={`sample-sidebar-iteration-state tone-${iteration.tone}`}>{iteration.status === '进行中' ? '当前' : '归档'}</span>
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </Button>
              {expanded && (
                <div className="sample-sidebar-requirements" id={`sample-sidebar-requirements-${iteration.id}`}>
                  {requirements.length ? requirements.map((item) => {
                    const active = selectedRequirementId === item.id && section === 'workbench';
                    return (
                      <Button
                        variant="ghost"
                        key={item.id}
                        className={`sample-sidebar-requirement${active ? ' is-active' : ''}`}
                        onClick={() => { onSelectItem(item.id); onSectionChange('workbench'); }}
                        aria-current={active ? 'page' : undefined}
                      >
                        <span className={`sample-sidebar-requirement-icon tone-${item.tone}`}><FileText size={13} /></span>
                        <span className="sample-sidebar-requirement-copy">
                          <strong>{item.code}</strong>
                          <small>{item.title}</small>
                        </span>
                        <span className={`sample-sidebar-requirement-dot tone-${item.tone}`} />
                      </Button>
                    );
                  }) : <span className="sample-sidebar-empty">该迭代暂无需求</span>}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sample-side-divider" />
      <div className="sample-side-section-label">环境</div>
      <div className="sample-env-card">
        <div className="sample-env-row">
          <span className="sample-env-led" />
          <span>云效 API</span>
          <span className="sample-env-state">已连接</span>
        </div>
        <div className="sample-env-row sample-env-row-muted">
          <LockKeyhole size={13} />
          <span>写操作策略</span>
          <span className="sample-env-state">{writeEnabled ? '演示可写' : '只读'}</span>
        </div>
      </div>

      <div className="sample-sidebar-spacer" />
      <div className="sample-side-footer">
        <Badge variant="outline" className="sample-demo-badge">MOCK DATA</Badge>
        <p>静态演示层 · 不连接真实服务</p>
        <span>v0.1 design sample</span>
      </div>
    </aside>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="sample-page-header">
      <div>
        <SectionEyebrow>{eyebrow}</SectionEyebrow>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="sample-page-actions">{actions}</div>}
    </div>
  );
}

function KpiCard({ label, value, note, tone, icon: Icon, trend }: { label: string; value: string; note: string; tone: Tone; icon: LucideIcon; trend?: string }) {
  return (
    <Card className="sample-card sample-kpi-card">
      <CardContent>
        <div className="sample-kpi-topline">
          <span className={`sample-kpi-icon tone-${tone}`}><Icon size={17} /></span>
          {trend && <span className="sample-kpi-trend">{trend}</span>}
        </div>
        <div className="sample-kpi-label">{label}</div>
        <div className="sample-kpi-value">{value}</div>
        <div className="sample-kpi-note"><ToneDot tone={tone} />{note}</div>
      </CardContent>
    </Card>
  );
}

function OverviewPage({
  onOpenWorkbench,
  onOpenPipeline,
  onOpenLog,
  onNotice,
}: {
  onOpenWorkbench: (id?: string) => void;
  onOpenPipeline: () => void;
  onOpenLog: (title: string) => void;
  onNotice: (message: string) => void;
}) {
  return (
    <div className="sample-page sample-overview-page">
      <PageHeader
        eyebrow="SYSTEM PULSE / 08 OCT 2026"
        title="今天，链路是清晰的。"
        description="从工作项到交付结果，所有变化都聚合在同一张工作面上。"
        actions={(
          <>
            <Button variant="outline" className="sample-button sample-button-soft" onClick={() => onNotice('已刷新 mock 数据快照')}>
              <RefreshCw size={15} />
              刷新快照
            </Button>
            <Button className="sample-button sample-button-coral" onClick={() => onOpenWorkbench()}>
              打开工作台 <ArrowUpRight size={15} />
            </Button>
          </>
        )}
      />

      <section className="sample-hero-grid">
        <div className="sample-hero-card">
          <div className="sample-hero-orbit orbit-one" />
          <div className="sample-hero-orbit orbit-two" />
          <div className="sample-hero-content">
            <div className="sample-hero-kicker"><span className="sample-hero-live-dot" /> LIVE DELIVERY MAP</div>
            <h2>把“发生了什么”<br /><em>变成可回答的问题。</em></h2>
            <p>工作项、代码和流水线不再是三个孤立页面。nervd 把交付链路压缩成一张可操作的地图。</p>
            <div className="sample-hero-links">
              <Button variant="ghost" size="sm" className="sample-hero-link" onClick={() => onOpenWorkbench()}>查看 REQ-2048 链路 <ChevronRight data-icon="inline-end" /></Button>
              <span>最后同步 2 分钟前</span>
            </div>
          </div>
          <div className="sample-hero-graph" aria-hidden="true">
            <div className="graph-node graph-node-start"><span>REQ</span><strong>2048</strong></div>
            <div className="graph-line line-one" />
            <div className="graph-node graph-node-mid"><GitBranch size={15} /><strong>branch</strong></div>
            <div className="graph-line line-two" />
            <div className="graph-node graph-node-end"><Check size={16} /><strong>PASS</strong></div>
          </div>
        </div>
        <div className="sample-system-card">
          <div className="sample-panel-heading">
            <div><SectionEyebrow>CONTROL PLANE</SectionEyebrow><h3>系统状态</h3></div>
            <MoreHorizontal size={18} className="sample-muted-icon" />
          </div>
          <div className="sample-system-main"><span className="sample-system-pulse" /><strong>一切正常</strong><span>·</span><span>只读演示模式</span></div>
          <div className="sample-system-metric"><span>云效 API</span><strong>186ms</strong><div className="sample-mini-bars"><i /><i /><i /><i /><i /><i /></div></div>
          <div className="sample-system-metric"><span>工作项缓存</span><strong>{workItems.length} / {workItems.length}</strong><Progress value={100} className="sample-mini-progress" aria-label="工作项缓存 100%" /></div>
          <div className="sample-system-metric"><span>流水线订阅</span><strong>4 个</strong><Progress value={82} className="sample-mini-progress sample-progress-blue" aria-label="流水线订阅 82%" /></div>
          <div className="sample-system-foot"><Clock3 size={14} /> 下次轮询 <strong>00:28</strong></div>
        </div>
      </section>

      <section className="sample-kpi-grid">
        <KpiCard label="工作项" value="14" note="3 个正在推进" tone="info" icon={Boxes} trend="+2" />
        <KpiCard label="活跃分支" value="08" note="全部已关联需求" tone="run" icon={GitBranch} trend="稳定" />
        <KpiCard label="流水线运行" value="06" note="1 个运行中 · 1 个失败" tone="ok" icon={Workflow} trend="96%" />
        <KpiCard label="仓库 CI" value="03 / 04" note="1 个需要关注" tone="fail" icon={Activity} trend="-1" />
      </section>

      <section className="sample-dashboard-grid">
        <div className="sample-panel sample-health-panel">
          <div className="sample-panel-heading">
            <div><SectionEyebrow>RECENT RUNS</SectionEyebrow><h3>流水线健康度</h3></div>
            <Button variant="ghost" size="sm" className="sample-inline-button" onClick={onOpenPipeline}>查看全部 <ArrowUpRight size={14} /></Button>
          </div>
          <div className="sample-health-list">
            {pipelines.map((pipeline) => (
              <Button key={pipeline.id} variant="ghost" className="sample-health-row justify-start" onClick={onOpenPipeline}>
                <ToneDot tone={pipeline.tone} />
                <span className="sample-health-name">{pipeline.name}</span>
                <span className="sample-health-run">{pipeline.run}</span>
                <span className="sample-health-time">{pipeline.time}</span>
                <Progress value={pipeline.passRate} className="sample-health-progress" aria-label={`${pipeline.name} 通过率 ${pipeline.passRate}%`} />
                <span className={`sample-health-rate tone-${pipeline.tone}`}>{pipeline.passRate}%</span>
                <ChevronRight size={15} className="sample-muted-icon" />
              </Button>
            ))}
          </div>
        </div>

        <div className="sample-panel sample-activity-panel">
          <div className="sample-panel-heading"><div><SectionEyebrow>EVENT STREAM</SectionEyebrow><h3>最近动态</h3></div><Button variant="ghost" size="icon" className="sample-round-action" onClick={() => onNotice('动态流已经是最新的')} aria-label="刷新动态"><RefreshCw size={15} /></Button></div>
          <div className="sample-activity-list">
            {activities.map((activity) => {
              const Icon = activity.icon;
              return <div key={`${activity.time}-${activity.title}`} className="sample-activity-row"><div className={`sample-activity-icon tone-${activity.tone}`}><Icon size={14} /></div><div className="sample-activity-copy"><strong>{activity.title}</strong><span>{activity.detail}</span></div><time>{activity.time}</time></div>;
            })}
          </div>
          <Button variant="link" size="sm" className="sample-activity-footer" onClick={() => onNotice('动态流详情将在真实数据接入后展开')}>打开事件流 <ArrowUpRight data-icon="inline-end" /></Button>
        </div>
      </section>

      <section className="sample-panel sample-workitem-panel">
        <div className="sample-panel-heading">
          <div><SectionEyebrow>WORK ITEMS / UPDATED</SectionEyebrow><h3>工作项速览</h3></div>
          <div className="sample-heading-tools"><span>按更新时间排序</span><Button variant="outline" size="sm" className="sample-button sample-button-soft" onClick={() => onOpenWorkbench()}><ListFilter size={14} />进入工作台</Button></div>
        </div>
        <div className="sample-table-wrap">
          <Table className="sample-table">
            <TableHeader><TableRow><TableHead>工作项</TableHead><TableHead>状态</TableHead><TableHead>处理人</TableHead><TableHead>空间</TableHead><TableHead>更新时间</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {workItems.slice(0, 4).map((item) => <TableRow key={item.id} className="cursor-pointer" onClick={() => onOpenWorkbench(item.id)}><TableCell><div className="sample-table-title"><span className={`sample-kind-mark kind-${item.kind}`}>{item.kind.slice(0, 1)}</span><div><strong>{item.title}</strong><span>{item.code}</span></div></div></TableCell><TableCell><StatusBadge tone={item.tone}>{item.status}</StatusBadge></TableCell><TableCell>{item.assignee}</TableCell><TableCell>{item.space}</TableCell><TableCell>{item.updated}</TableCell><TableCell><ChevronRight size={15} className="sample-muted-icon" /></TableCell></TableRow>)}
            </TableBody>
          </Table>
        </div>
      </section>

      <div className="sample-page-footnote"><span><SlidersHorizontal size={13} /> STATIC SURFACE</span><span>当前页面只展示信息架构与交互路径，所有数据均为 mock。</span><Button variant="link" size="xs" className="sample-page-footnote-action" onClick={() => onOpenLog('mock / delivery-stream.log')}>查看示例日志 <Terminal data-icon="inline-end" /></Button></div>
    </div>
  );
}

function WorkbenchPage({
  selectedItem,
  selectedId,
  query,
  onSelect,
  onQueryChange,
  traceOpen,
  onToggleTrace,
  onWrite,
  onOpenLog,
  onNotice,
  onOpenIterations,
}: {
  selectedItem: WorkItem;
  selectedId: string;
  query: string;
  onSelect: (id: string) => void;
  onQueryChange: (value: string) => void;
  traceOpen: boolean;
  onToggleTrace: () => void;
  onWrite: (label: string) => void;
  onOpenLog: (title: string) => void;
  onNotice: (message: string) => void;
  onOpenIterations: () => void;
}) {
  const [kind, setKind] = useState<'全部' | WorkItemKind>('全部');
  const [filterOpen, setFilterOpen] = useState(false);
  const [relatedFilter, setRelatedFilter] = useState('全部');
  const [iterationFilter, setIterationFilter] = useState('全部');
  const [statusFilter, setStatusFilter] = useState('全部');
  const selectedIteration = iterations.find((iteration) => iteration.id === selectedItem.iterationId) ?? iterations[0];
  const relatedOptions = ['全部', ...Array.from(new Set(workItems.flatMap((item) => item.repositories.map((repository) => repository.name))))];
  const iterationOptions = ['全部', ...iterations.map((iteration) => iteration.code)];
  const statusOptions = ['全部', ...Array.from(new Set(workItems.map((item) => item.status)))];
  const mergedRepositoryCount = selectedItem.repositories.filter((repository) => repository.mergeStatus === '已合入迭代分支').length;
  const ciTargets = selectedItem.repositories.flatMap((repository) => repository.ciTargets);
  const passedCiCount = ciTargets.filter((target) => target.status === 'SUCCESS').length;
  const deliveryStatus = mergedRepositoryCount === selectedItem.repositories.length && selectedItem.childIds?.every((childId) => workItems.find((item) => item.id === childId)?.status === '已完成')
    ? '可交付'
    : mergedRepositoryCount > 0
      ? '部分合入'
      : '待合入';
  const deliveryTone: Tone = deliveryStatus === '可交付' ? 'ok' : deliveryStatus === '部分合入' ? 'run' : 'info';
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return workItems.filter((item) => {
      const matchesKind = kind === '全部' || item.kind === kind;
      const matchesRepository = relatedFilter === '全部' || item.repositories.some((repository) => repository.name === relatedFilter);
      const matchesIteration = iterationFilter === '全部' || item.iterationId === iterations.find((iteration) => iteration.code === iterationFilter)?.id;
      const matchesStatus = statusFilter === '全部' || item.status === statusFilter;
      const repositoryText = item.repositories.map((repository) => `${repository.name} ${repository.branch} ${repository.ciTargets.map((target) => target.label).join(' ')}`).join(' ');
      const matchesQuery = !normalized || `${item.code} ${item.title} ${item.assignee} ${repositoryText}`.toLowerCase().includes(normalized);
      return matchesKind && matchesRepository && matchesIteration && matchesStatus && matchesQuery;
    });
  }, [kind, query, relatedFilter, iterationFilter, statusFilter]);

  return (
    <div className="sample-page sample-workbench-page">
      <div className="sample-workbench-toolbar">
        <div><SectionEyebrow>WORKSPACE / LINKED DELIVERY</SectionEyebrow><h1>工作台</h1></div>
        <div className="sample-workbench-tools"><span className="sample-result-count">{filteredItems.length} 个工作项</span><Button variant="outline" className="sample-button sample-button-soft" onClick={() => onNotice('工作项列表已刷新')}><RefreshCw size={14} />刷新</Button><Button variant="outline" size="icon" className="sample-button sample-button-soft" onClick={onToggleTrace} aria-label={traceOpen ? '隐藏追溯面板' : '显示追溯面板'}>{traceOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}</Button></div>
      </div>
      <div className={`sample-workbench-layout${traceOpen ? '' : ' trace-closed'}`}>
        <aside className="sample-item-list">
          <div className="sample-list-heading"><div><strong>工作项</strong><span>按类别浏览和筛选</span></div><Button variant="ghost" size="xs" className={`sample-filter-button${filterOpen ? ' is-active' : ''}`} onClick={() => setFilterOpen((open) => !open)} aria-expanded={filterOpen}><Filter size={14} /><span>关联筛选</span></Button></div>
          {filterOpen && <div className="sample-related-filters">
            <label><span>关联仓库</span><Select value={relatedFilter} onValueChange={(value) => value && setRelatedFilter(value)}><SelectTrigger size="sm" className="sample-filter-select"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{relatedOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectGroup></SelectContent></Select></label>
            <label><span>迭代</span><Select value={iterationFilter} onValueChange={(value) => value && setIterationFilter(value)}><SelectTrigger size="sm" className="sample-filter-select"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{iterationOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectGroup></SelectContent></Select></label>
            <label><span>状态</span><Select value={statusFilter} onValueChange={(value) => value && setStatusFilter(value)}><SelectTrigger size="sm" className="sample-filter-select"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{statusOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectGroup></SelectContent></Select></label>
          </div>}
          <ToggleGroup value={[kind]} onValueChange={(value) => value[0] && setKind(value[0] as '全部' | WorkItemKind)} className="sample-category-tabs" spacing={1} aria-label="工作项类别">
            {(['全部', '需求', '缺陷', '任务'] as const).map((itemKind) => <ToggleGroupItem key={itemKind} value={itemKind} size="sm" className={kind === itemKind ? 'is-active' : undefined}>{itemKind}<span>{itemKind === '全部' ? workItems.length : workItems.filter((item) => item.kind === itemKind).length}</span></ToggleGroupItem>)}
          </ToggleGroup>
          <label className="sample-list-search"><Search size={14} /><Input className="sample-list-search-input" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索编号 / 标题" /><kbd>/</kbd></label>
          <div className="sample-list-items">
            {filteredItems.map((item) => <Button key={item.id} variant="ghost" className={`sample-list-item justify-start${selectedId === item.id ? ' is-selected' : ''}`} onClick={() => onSelect(item.id)}><div className="sample-list-item-top"><span>{item.code}</span><StatusBadge tone={item.tone}>{item.status}</StatusBadge></div><strong>{item.title}</strong><div className="sample-list-item-meta"><span>{item.assignee}</span><span>{item.updated}</span></div></Button>)}
            {!filteredItems.length && <div className="sample-empty-state"><Search size={20} /><strong>没有匹配项</strong><span>试试其他编号或标题</span></div>}
          </div>
          <div className="sample-list-footer"><span>已加载全部 mock 数据</span><Button variant="link" size="xs" onClick={() => onNotice('分页加载将在真实 API 接入后启用')}>加载更多</Button></div>
        </aside>
        <main className="sample-detail-pane">
          <div className="sample-detail-topline"><div className="sample-detail-breadcrumb"><span>{selectedItem.space}</span><ChevronRight size={13} /><span className="sample-mono">{selectedItem.code}</span></div><div className="sample-detail-actions"><Button variant="outline" size="sm" className="sample-button sample-button-soft" onClick={() => onNotice('已复制工作项链接')}><ExternalLink size={14} />复制链接</Button><Button variant="ghost" size="icon" className="sample-round-action" onClick={() => onNotice('更多动作将在真实数据接入后展开')} aria-label="更多工作项动作"><MoreHorizontal size={17} /></Button></div></div>
          <div className="sample-detail-heading"><div><div className="sample-detail-kind"><span className={`sample-kind-mark kind-${selectedItem.kind}`}>{selectedItem.kind.slice(0, 1)}</span><span>{selectedItem.kind}</span><StatusBadge tone={selectedItem.tone}>{selectedItem.status}</StatusBadge></div><h2>{selectedItem.title}</h2><p>{selectedItem.intro}</p></div></div>
          <div className="sample-detail-meta"><div><span>处理人</span><strong><Avatar size="sm" className="sample-avatar sample-avatar-small"><AvatarFallback>{selectedItem.assignee === '—' ? '—' : selectedItem.assignee.slice(0, 1)}</AvatarFallback></Avatar>{selectedItem.assignee}</strong></div><div><span>当前迭代</span><strong>{selectedIteration.code}</strong></div><div><span>关联仓库</span><strong>{selectedItem.repositories.length} 个</strong></div><div><span>{selectedItem.parentRequirement ? '父需求' : '子任务'}</span><strong>{selectedItem.parentRequirement ?? `${selectedItem.childIds?.length ?? 0} 个`}</strong></div></div>
          <section className="sample-detail-section"><div className="sample-section-title"><h3>描述</h3><span>DETAIL</span></div><p className="sample-detail-description">{selectedItem.description}</p><div className="sample-detail-tags"><span>追溯链路</span><span>云效 API</span><span>mock payload</span></div></section>
          <section className="sample-detail-section"><div className="sample-section-title"><h3>最终交付状态</h3><span>LISTEN / MERGE GATE</span></div><div className="sample-delivery-status-card"><div className={`sample-delivery-status-icon tone-${deliveryTone}`}><GitMerge size={17} /></div><div className="sample-delivery-status-copy"><div><strong>{deliveryStatus}</strong><StatusBadge tone={deliveryTone}>{mergedRepositoryCount} / {selectedItem.repositories.length} 个仓库已合入</StatusBadge></div><span>监听当前需求分支是否合入 <span className="sample-mono">{selectedIteration.baseBranch}</span>；CI 通过 {passedCiCount} / {ciTargets.length} 个环境。</span></div></div></section>
          <section className="sample-detail-section"><div className="sample-section-title"><h3>当前迭代</h3><span>ITERATION / BRANCH BASELINE</span></div><div className="sample-iteration-context-card"><div className="sample-iteration-context-icon"><CalendarDays size={17} /></div><div className="sample-iteration-context-copy"><strong>{selectedIteration.name}</strong><span>{selectedIteration.period} · 当前需求分支从 <span className="sample-mono">{selectedIteration.baseBranch}</span> 拉取最新代码，开发分支默认 <span className="sample-mono">{selectedIteration.devBranch}</span></span></div><Button variant="outline" size="sm" className="sample-button sample-button-soft sample-iteration-context-action" onClick={onOpenIterations}>查看迭代 <ArrowUpRight size={13} /></Button></div></section>
          {selectedItem.childIds?.length ? <section className="sample-detail-section"><div className="sample-section-title"><h3>子任务 <span className="sample-title-count">{selectedItem.childIds.length}</span></h3><span>CHILD TASKS / YUNXIAO</span></div><div className="sample-child-task-list">{selectedItem.childIds.map((childId) => { const child = workItems.find((item) => item.id === childId); return child ? <Button key={child.id} variant="ghost" className="sample-child-task-card justify-start" onClick={() => onSelect(child.id)}><span className={`sample-kind-mark kind-${child.kind}`}>{child.kind.slice(0, 1)}</span><span className="sample-child-task-copy"><strong>{child.code} · {child.title}</strong><small>{child.assignee} · {child.repositories.length} 个仓库 · {iterations.find((iteration) => iteration.id === child.iterationId)?.code}</small></span><StatusBadge tone={child.tone}>{child.status}</StatusBadge><ChevronRight size={14} className="sample-muted-icon" /></Button> : null; })}</div></section> : selectedItem.parentRequirement ? <section className="sample-detail-section"><div className="sample-section-title"><h3>父需求</h3><span>PARENT REQUIREMENT</span></div><Button variant="ghost" className="sample-parent-link justify-start" onClick={() => onSelect(selectedItem.parentRequirement ?? '')}><span className="sample-kind-mark kind-需求">需</span><span><strong>{selectedItem.parentRequirement}</strong><small>返回需求链路查看全部子任务</small></span><ChevronRight size={14} /></Button></section> : null}
          <section className="sample-detail-section"><div className="sample-section-title"><h3>关联仓库 <span className="sample-title-count">{selectedItem.repositories.length}</span></h3><span>REPOSITORY / 1:N</span></div><div className="sample-repo-link-list">{selectedItem.repositories.map((repository) => <WorkItemRepositoryCard key={repository.id} repository={repository} onWrite={onWrite} onNotice={onNotice} />)}</div><div className="sample-repo-one-to-many"><GitBranch size={14} /><span>一个需求可以关联多个仓库；每个仓库独立追踪分支、MR 和 CI。状态表示该 CI 环境最近一次运行结果。</span><Button variant="link" size="xs" onClick={() => onNotice('仓库关联编辑将在真实配置页展开')}>管理关联 <ChevronRight data-icon="inline-end" /></Button></div></section>
          <section className="sample-detail-section"><div className="sample-section-title"><h3>代码操作</h3><span>WRITE OPS</span></div><div className="sample-action-grid"><ActionCard icon={GitBranch} title="创建分支" detail={`${selectedItem.repositories.length} 个仓库目标`} action="建分支" onClick={() => onWrite('创建分支')} /><ActionCard icon={GitMerge} title="创建 MR" detail={`${selectedItem.repositories.length} 个 MR 目标`} action="建 MR" onClick={() => onWrite('创建 MR')} /></div><Alert className="sample-readonly-callout"><LockKeyhole /><AlertDescription className="sample-readonly-content"><span>演示当前为只读模式，写操作仅展示意图，不会发送请求。</span><Button variant="link" size="xs" onClick={() => onNotice('请在设置 → 安全中切换写操作策略')}>去设置 <ChevronRight data-icon="inline-end" /></Button></AlertDescription></Alert></section>
          <section className="sample-detail-section sample-comments-section"><div className="sample-section-title"><h3>评论 <span className="sample-title-count">{selectedItem.comments}</span></h3><span>COMMENTS</span></div><div className="sample-comment"><Avatar size="sm" className="sample-avatar sample-avatar-small"><AvatarFallback>周</AvatarFallback></Avatar><div><div><strong>周弦</strong><span>今天 09:35</span></div><p>链路展示已经可以从工作项直接进入，建议补充失败运行的日志快捷入口。</p></div></div><Button variant="link" size="xs" className="sample-comment-add" onClick={() => onNotice('评论编辑器将在真实连接后启用')}><Plus data-icon="inline-start" />添加评论</Button></section>
        </main>
        {traceOpen && <TracePanel item={selectedItem} onWrite={onWrite} onOpenLog={onOpenLog} />}
      </div>
    </div>
  );
}

function WorkItemRepositoryCard({ repository, onWrite, onNotice }: { repository: WorkItemRepository; onWrite: (label: string) => void; onNotice: (message: string) => void }) {
  return <div className="sample-repo-link-card sample-repo-detail-card">
    <div className="sample-repo-icon"><GitBranch size={17} /></div>
    <div className="sample-repo-link-copy">
      <div className="sample-repo-link-title"><strong>{repository.name}</strong><StatusBadge tone={repository.provider === 'Jenkins' ? 'run' : 'info'}>{repository.provider}</StatusBadge></div>
      <div className="sample-repo-branch-row"><span className="sample-repo-branch-label"><GitBranch size={12} />当前需求分支</span><strong className="sample-mono sample-repo-branch-name">{repository.branch}</strong><span className="sample-repo-commit"><GitCommitHorizontal size={12} />{repository.commit}</span></div>
      <div className="sample-repo-merge-row"><span><GitMerge size={12} />目标迭代分支</span><strong className="sample-mono">{repository.iterationBranch}</strong><StatusBadge tone={repository.mergeTone}>{repository.mergeStatus}</StatusBadge></div>
      <div className="sample-repo-ci-label"><Workflow size={12} /><span>CI 环境</span>{repository.ciTargets.map((target) => <span key={target.id} className="sample-ci-env-tag tone-info">{target.environment}</span>)}</div>
      <div className="sample-ci-target-list">{repository.ciTargets.map((target) => <div className="sample-ci-target-row" key={target.id}><span className="sample-ci-target-name"><span className="sample-mono">{target.label}</span><small>{target.run}</small></span><StatusBadge tone={target.tone}>{ciStatusLabel(target.status)}</StatusBadge><Button variant="outline" size="xs" className="sample-ci-trigger" onClick={() => onWrite(`触发 ${repository.name} / ${target.environment} CI`)}><Play data-icon="inline-start" />触发</Button></div>)}</div>
      <div className="sample-repo-link-bottom"><span><GitMerge size={12} />{repository.mr}</span><Button variant="ghost" size="icon-xs" onClick={() => onNotice(`${repository.name} 已标记为当前仓库`)} aria-label={`打开 ${repository.name}`}><ArrowUpRight size={14} /></Button></div>
    </div>
  </div>;
}

function ActionCard({ icon: Icon, title, detail, action, onClick }: { icon: LucideIcon; title: string; detail: string; action: string; onClick: () => void }) {
  return <Button variant="ghost" className="sample-action-card justify-start" onClick={onClick}><span className="sample-action-icon"><Icon size={16} /></span><span className="sample-action-copy"><strong>{title}</strong><small>{detail}</small></span><span className="sample-action-link">{action}<ArrowUpRight data-icon="inline-end" /></span></Button>;
}

function TracePanel({ item, onWrite, onOpenLog }: { item: WorkItem; onWrite: (label: string) => void; onOpenLog: (title: string) => void }) {
  const repositories = item.repositories;
  const iteration = iterations.find((candidate) => candidate.id === item.iterationId) ?? iterations[0];
  const mergedRepositoryCount = repositories.filter((repository) => repository.mergeStatus === '已合入迭代分支').length;
  const ciTargets = repositories.flatMap((repository) => repository.ciTargets);
  const passedCiCount = ciTargets.filter((target) => target.status === 'SUCCESS').length;
  const traceTone: Tone = repositories.some((repository) => repository.ciTargets.some((target) => target.tone === 'fail'))
    ? 'fail'
    : repositories.some((repository) => repository.ciTargets.some((target) => target.tone === 'run'))
      ? 'run'
      : 'ok';
  const finalStatus = traceTone === 'fail' ? 'CI 失败' : mergedRepositoryCount === repositories.length && item.childIds?.every((childId) => workItems.find((candidate) => candidate.id === childId)?.status === '已完成') ? '可交付' : mergedRepositoryCount > 0 ? '部分合入' : '待合入';
  const finalTone: Tone = traceTone === 'fail' ? 'fail' : finalStatus === '可交付' ? 'ok' : finalStatus === '部分合入' ? 'run' : 'info';
  const stages = [
    { label: '当前迭代', value: iteration.code, detail: '需求来自迭代范围', icon: CalendarDays, tone: 'info' as Tone },
    { label: '需求 / 子任务', value: item.code, detail: `${item.childIds?.length ?? 0} 个子任务 · ${item.status}`, icon: FileText, tone: 'info' as Tone },
    { label: '仓库分支', value: `${repositories.length} 个`, detail: `${mergedRepositoryCount} 个已合入迭代分支`, icon: GitBranch, tone: mergedRepositoryCount === repositories.length ? 'ok' as Tone : 'run' as Tone },
    { label: '最终状态', value: finalStatus, detail: `CI 通过 ${passedCiCount} / ${ciTargets.length}`, icon: ShieldCheck, tone: finalTone },
  ];
  return (
    <aside className="sample-trace-pane">
      <div className="sample-trace-header"><div><SectionEyebrow>TRACE / LIVE MAP</SectionEyebrow><h3>追溯链路</h3></div><span className="sample-trace-scan"><span className="sample-env-led" />已扫描</span></div>
      <div className="sample-trace-summary"><strong>1 : {repositories.length}</strong><span>需求 → 仓库映射</span><div className="sample-trace-progress"><i /></div></div>
      <div className="sample-trace-timeline">{stages.map((stage, index) => { const Icon = stage.icon; return <div className="sample-trace-stage" key={stage.label}><div className={`sample-trace-stage-icon tone-${stage.tone}`}><Icon size={15} /></div>{index < stages.length - 1 && <span className="sample-trace-line" />}<div className="sample-trace-stage-copy"><span>{stage.label}</span><strong>{stage.value}</strong><small><ToneDot tone={stage.tone} />{stage.detail}</small></div></div>; })}</div>
      <Separator className="sample-trace-divider" />
      <div className="sample-trace-subhead"><span>仓库链路</span><span className="sample-mono">{repositories.length} 个仓库</span></div>
      <div className="sample-trace-repository-list">{repositories.map((repository) => <div className="sample-trace-repository" key={repository.id}><div className="sample-trace-repository-head"><div><GitBranch size={13} /><strong>{repository.name}</strong></div><span className="sample-mono">{repository.provider}</span></div><div className="sample-trace-repository-branch"><span><GitBranch size={11} />当前需求分支</span><strong className="sample-mono">{repository.branch}</strong></div><div className="sample-trace-merge-row"><span><GitMerge size={11} />合入迭代分支</span><strong className="sample-mono">{repository.iterationBranch}</strong><StatusBadge tone={repository.mergeTone}>{repository.mergeStatus}</StatusBadge></div><div className="sample-trace-repository-ci-label"><Workflow size={11} /><span>CI 环境</span>{repository.ciTargets.map((target) => <span key={target.id} className="sample-ci-env-tag tone-info">{target.environment}</span>)}</div><div className="sample-trace-ci-list">{repository.ciTargets.map((target) => <div className="sample-trace-ci-row" key={target.id}><span className="sample-ci-target-name"><span>{target.label}</span><small>{target.run}</small></span><StatusBadge tone={target.tone}>{ciStatusLabel(target.status)}</StatusBadge><Button variant="ghost" size="icon-xs" onClick={() => onOpenLog(`${target.label} / ${target.run}`)} aria-label={`查看 ${target.label} 日志`}><Terminal size={12} /></Button><Button variant="outline" size="xs" className="sample-trace-trigger" onClick={() => onWrite(`触发 ${repository.name} / ${target.environment} CI`)}><Play data-icon="inline-start" />触发</Button></div>)}</div><div className="sample-trace-repository-foot"><span>{repository.mr} · {repository.commit}</span></div></div>)}</div>
      <p className="sample-trace-note"><ShieldCheck size={13} /> 最终状态监听需求分支是否合入迭代分支，并汇总各仓库 CI 环境的最近结果。</p>
    </aside>
  );
}

function IterationPage({ onWrite, onNotice }: { onWrite: (label: string) => void; onNotice: (message: string) => void }) {
  return <div className="sample-page"><PageHeader eyebrow="ITERATION / WORKITEM SCOPE" title="当前迭代" description="以云效迭代作为交付范围：一个迭代包含多个需求，需求下继续挂载任务；仓库分支从迭代分支拉取最新代码。" actions={<><Button variant="outline" className="sample-button sample-button-soft" onClick={() => onNotice('迭代列表已刷新')}><RefreshCw size={15} />刷新</Button><Button className="sample-button sample-button-coral" onClick={() => onWrite('创建迭代')}><Plus size={15} />新建迭代</Button></>} /><Alert className="sample-iteration-policy"><GitBranch /><AlertDescription className="sample-iteration-policy-content"><strong>当前交付范围</strong><span>迭代基础分支 → 需求分支 → MR 合入迭代分支 → CI 环境监听最终状态</span></AlertDescription><StatusBadge tone="info">需求 2 · 任务 2</StatusBadge></Alert><div className="sample-section-heading-row"><div><SectionEyebrow>ACTIVE ITERATION</SectionEyebrow><h2>Benz-20261016</h2></div><Button variant="outline" size="xs" className="sample-filter-chip" onClick={() => onNotice('当前筛选为进行中的迭代')}><CalendarDays data-icon="inline-start" />当前进行中<ChevronDown data-icon="inline-end" /></Button></div><div className="sample-iteration-grid">{iterations.map((iteration) => <IterationCard key={iteration.id} iteration={iteration} onWrite={onWrite} onNotice={onNotice} />)}</div></div>;
}

function IterationRequirementRow({ item, onNotice }: { item: WorkItem; onNotice: (message: string) => void }) {
  const mergedCount = item.repositories.filter((repository) => repository.mergeStatus === '已合入迭代分支').length;
  return <Button variant="ghost" className="sample-iteration-workitem-row justify-start" onClick={() => onNotice(`已定位 ${item.code} 需求详情`)}><span className={`sample-kind-mark kind-${item.kind}`}>{item.kind.slice(0, 1)}</span><span className="sample-iteration-workitem-copy"><strong>{item.code} · {item.title}</strong><small>{item.repositories.length} 个仓库 · {item.childIds?.length ?? 0} 个子任务 · {mergedCount}/{item.repositories.length} 已合入</small></span><StatusBadge tone={item.tone}>{item.status}</StatusBadge><ChevronRight size={14} className="sample-muted-icon" /></Button>;
}

function IterationCard({ iteration, onWrite, onNotice }: { iteration: Iteration; onWrite: (label: string) => void; onNotice: (message: string) => void }) {
  const requirements = workItems.filter((item) => iteration.workItemIds.includes(item.id) && item.kind === '需求');
  return <div className="sample-iteration-card"><div className="sample-iteration-card-head"><div><SectionEyebrow>{iteration.code}</SectionEyebrow><h3>{iteration.name}</h3></div><StatusBadge tone={iteration.tone}>{iteration.status}</StatusBadge></div><div className="sample-iteration-period"><CalendarDays size={13} />{iteration.period}</div><div className="sample-iteration-branch-list"><div className="sample-iteration-branch-row"><span className="sample-iteration-branch-icon"><GitBranch size={14} /></span><span className="sample-iteration-branch-copy"><small>迭代基础分支</small><strong className="sample-mono">{iteration.baseBranch}</strong></span><StatusBadge tone={iteration.baseBranchReady ? 'ok' : 'info'}>{iteration.baseBranchReady ? '已创建' : '待创建'}</StatusBadge></div><div className="sample-iteration-branch-row"><span className="sample-iteration-branch-icon"><GitBranch size={14} /></span><span className="sample-iteration-branch-copy"><small>开发分支（默认）</small><strong className="sample-mono">{iteration.devBranch}</strong></span><StatusBadge tone={iteration.devBranchReady ? 'ok' : 'info'}>{iteration.devBranchReady ? '已创建' : '待创建'}</StatusBadge></div></div><div className="sample-iteration-metrics"><div><span>需求</span><strong>{iteration.requirementCount}</strong></div><div><span>任务</span><strong>{iteration.taskCount}</strong></div><div><span>需求来源</span><strong className="sample-mono">{iteration.baseBranch}</strong></div></div><div className="sample-iteration-workitems"><div className="sample-iteration-workitems-head"><span>迭代需求</span><span>{requirements.length} 项</span></div>{requirements.map((item) => <IterationRequirementRow key={item.id} item={item} onNotice={onNotice} />)}</div><div className="sample-iteration-card-footer"><span>需求从迭代基础分支拉取</span><Button variant="link" size="xs" onClick={() => onNotice(`${iteration.code} 已选中`)}>查看需求 <ArrowUpRight data-icon="inline-end" /></Button></div><div className="sample-iteration-actions"><Button variant="outline" size="sm" className="sample-button sample-button-soft" onClick={() => onWrite(`${iteration.baseBranchReady ? '重建' : '创建'} ${iteration.code} 基础分支`)}><GitBranch size={13} />{iteration.baseBranchReady ? '管理基础分支' : '创建基础分支'}</Button><Button variant="outline" size="sm" className="sample-button sample-button-soft" onClick={() => onWrite(`${iteration.devBranchReady ? '重建' : '创建'} ${iteration.code} dev 分支`)}><GitBranch size={13} />{iteration.devBranchReady ? '管理 dev 分支' : '创建 dev 分支'}</Button></div></div>;
}

function PipelinePage({ onWrite, onOpenLog, onNotice }: { onWrite: (label: string) => void; onOpenLog: (title: string) => void; onNotice: (message: string) => void }) {
  return <div className="sample-page"><PageHeader eyebrow="PIPELINE CONTROL / RUN HISTORY" title="流水线" description="查看运行状态，并在具体仓库 / CI 环境下触发动作，从关联工作项反查交付上下文。" actions={<Button variant="outline" className="sample-button sample-button-soft" onClick={() => onNotice('流水线列表已刷新')}><RefreshCw size={15} />刷新</Button>} /><div className="sample-pipeline-summary"><div><span>运行中</span><strong>01</strong><small>nervd-core · #76</small></div><div><span>最近通过</span><strong>03</strong><small>平均耗时 06m 41s</small></div><div><span>通过率</span><strong>92<span className="sample-summary-unit">%</span></strong><small>过去 30 次运行</small></div><div><span>失败需关注</span><strong className="sample-summary-fail">01</strong><small>mobile-shell · #203</small></div></div><div className="sample-section-heading-row"><div><SectionEyebrow>PIPELINE WALL</SectionEyebrow><h2>全部流水线</h2></div><Button variant="outline" size="xs" className="sample-filter-chip" onClick={() => onNotice('当前筛选为最近 30 天')}><ListFilter data-icon="inline-start" />最近 30 天<ChevronDown data-icon="inline-end" /></Button></div><div className="sample-pipeline-grid">{pipelines.map((pipeline) => <PipelineCard key={pipeline.id} pipeline={pipeline} onWrite={onWrite} onOpenLog={onOpenLog} />)}</div><div className="sample-section-heading-row sample-section-heading-row-spaced"><div><SectionEyebrow>RUNBOOK / REPOSITORY CI</SectionEyebrow><h2>仓库 CI 绑定</h2></div><Button variant="outline" size="sm" className="sample-button sample-button-soft" onClick={() => onNotice('进入设置可编辑 CI 绑定')}><Settings2 size={14} />管理绑定</Button></div><div className="sample-repository-grid">{repositories.slice(0, 3).map((repository) => <RepositoryCard key={repository.id} repository={repository} onOpenLog={onOpenLog} />)}</div></div>;
}

function PipelineCard({ pipeline, onWrite, onOpenLog }: { pipeline: Pipeline; onWrite: (label: string) => void; onOpenLog: (title: string) => void }) {
  return <div className="sample-pipeline-card"><div className="sample-pipeline-card-top"><StatusBadge tone={pipeline.tone}>{pipeline.status === 'SUCCESS' ? '已通过' : pipeline.status === 'RUNNING' ? '运行中' : '失败'}</StatusBadge><Button variant="ghost" size="icon" className="sample-round-action" onClick={() => onWrite(`触发 ${pipeline.name}`)} aria-label={`触发 ${pipeline.name}`}><MoreHorizontal size={16} /></Button></div><h3>{pipeline.name}</h3><div className="sample-pipeline-branch"><GitBranch size={14} /><span className="sample-mono">{pipeline.branch}</span></div><div className="sample-pipeline-run-row"><div><span>最近运行</span><strong>{pipeline.run}</strong></div><div><span>耗时</span><strong>{pipeline.duration}</strong></div><div><span>触发时间</span><strong>{pipeline.time}</strong></div></div><div className="sample-pipeline-rate-row"><span>最近通过率</span><strong className={`tone-${pipeline.tone}`}>{pipeline.passRate}%</strong><Progress value={pipeline.passRate} className="sample-pipeline-progress" aria-label={`${pipeline.name} 通过率 ${pipeline.passRate}%`} /></div><div className="sample-pipeline-card-footer"><span><Activity size={13} /> {pipeline.totalRuns} 次运行</span><Button variant="ghost" size="sm" className="sample-inline-button" onClick={() => onOpenLog(`${pipeline.name} / ${pipeline.run}`)}>查看日志 <ArrowUpRight data-icon="inline-end" /></Button></div></div>;
}

function RepositoryCard({ repository, onOpenLog }: { repository: Repository; onOpenLog: (title: string) => void }) {
  return <div className="sample-repository-card"><div className="sample-repo-card-head"><div className="sample-repo-icon"><GitBranch size={17} /></div><div><h3>{repository.name}</h3><span>{repository.provider}</span></div><StatusBadge tone={repository.tone}>{ciStatusLabel(repository.status)}</StatusBadge></div><div className="sample-repository-card-body"><div><span>默认分支</span><strong className="sample-mono">{repository.branch}</strong></div><div><span>最近 CI</span><strong>{repository.lastRun}</strong></div><div><span>健康度</span><strong className={`tone-${repository.tone}`}>{repository.uptime}</strong></div></div><div className="sample-repository-environment-row"><span>CI 环境</span><div className="sample-ci-environment-tags">{repository.environments.map((environment) => <span key={environment} className="sample-ci-env-tag tone-info">{environment}</span>)}</div></div><div className="sample-repository-card-footer"><span><ToneDot tone={repository.tone} />{repository.activity}</span><Button variant="link" size="xs" onClick={() => onOpenLog(`${repository.name} / console`)}>打开日志 <Terminal data-icon="inline-end" /></Button></div></div>;
}

function RepositoriesPage({ onOpenLog, onNotice }: { onOpenLog: (title: string) => void; onNotice: (message: string) => void }) {
  return <div className="sample-page"><PageHeader eyebrow="REPOSITORY WATCH / CI HEALTH" title="仓库 CI" description="以仓库和 CI 环境为单位查看绑定供应商、最近运行和可追溯分支。" actions={<><Button variant="outline" className="sample-button sample-button-soft" onClick={() => onNotice('仓库状态已刷新')}><RefreshCw size={15} />刷新状态</Button><Button className="sample-button sample-button-coral" onClick={() => onNotice('新仓库绑定流程将在真实配置页完成')}><Plus size={15} />添加仓库</Button></>} /><div className="sample-repo-overview-banner"><div className="sample-repo-banner-icon"><ShieldCheck size={21} /></div><div><strong>3 个仓库状态正常</strong><span>最近一次扫描于 2 分钟前完成，当前有 1 个仓库需要关注。</span></div><div className="sample-repo-banner-stat"><span>平均健康度</span><strong>94.8%</strong></div><div className="sample-repo-banner-stat"><span>活跃分支</span><strong>08</strong></div></div><div className="sample-repository-grid sample-repository-grid-large">{repositories.map((repository) => <RepositoryCard key={repository.id} repository={repository} onOpenLog={onOpenLog} />)}</div><div className="sample-panel sample-repo-rules"><div className="sample-panel-heading"><div><SectionEyebrow>TRACE RULES</SectionEyebrow><h3>当前追溯规则</h3></div><Button variant="ghost" size="sm" className="sample-inline-button" onClick={() => onNotice('规则编辑在设置 → 追溯与仓库中完成')}>编辑规则 <ArrowUpRight size={14} /></Button></div><div className="sample-rule-grid"><div><span>工作项匹配</span><strong className="sample-mono">(?:REQ|BUG|TASK)[-_]?(\d+)</strong></div><div><span>扫描窗口</span><strong>最近 20 条运行</strong></div><div><span>默认供应商</span><strong>云效 Flow</strong></div></div></div></div>;
}

function SettingsPage({ tab, onTabChange, writeEnabled, onWriteToggle, onNotice }: { tab: SettingsTab; onTabChange: (tab: SettingsTab) => void; writeEnabled: boolean; onWriteToggle: (enabled: boolean) => void; onNotice: (message: string) => void }) {
  const tabs: { id: SettingsTab; label: string; icon: LucideIcon; description: string }[] = [
    { id: 'connection', label: '云效连接', icon: Database, description: '组织、项目空间与访问令牌' },
    { id: 'trace', label: '追溯与仓库', icon: GitBranch, description: '匹配规则和默认仓库' },
    { id: 'ci', label: 'CI 集成', icon: Workflow, description: 'Flow 与 Jenkins 实例' },
    { id: 'security', label: '安全策略', icon: ShieldCheck, description: '写操作与本地凭证' },
  ];
  return <div className="sample-page sample-settings-page"><PageHeader eyebrow="WORKSPACE CONFIGURATION" title="设置" description="连接数据源、决定追溯边界，并明确哪些动作允许写回服务。" actions={<Button className="sample-button sample-button-coral" onClick={() => onNotice('设置已保存到 mock 状态')}><Check size={15} />保存设置</Button>} /><Tabs value={tab} onValueChange={(value) => onTabChange(value as SettingsTab)} orientation="vertical" className="sample-settings-layout"><TabsList variant="line" className="sample-settings-nav" aria-label="设置分区">{tabs.map((item) => { const Icon = item.icon; return <TabsTrigger key={item.id} value={item.id} className="sample-settings-tab justify-start"><span className="sample-settings-icon"><Icon size={16} /></span><span><strong>{item.label}</strong><small>{item.description}</small></span><ChevronRight size={15} /></TabsTrigger>; })}</TabsList><div className="sample-settings-content"><TabsContent value="connection">{tab === 'connection' && <SettingsConnection onNotice={onNotice} />}</TabsContent><TabsContent value="trace">{tab === 'trace' && <SettingsTrace onNotice={onNotice} />}</TabsContent><TabsContent value="ci">{tab === 'ci' && <SettingsCi onNotice={onNotice} />}</TabsContent><TabsContent value="security">{tab === 'security' && <SettingsSecurity writeEnabled={writeEnabled} onWriteToggle={onWriteToggle} onNotice={onNotice} />}</TabsContent></div></Tabs></div>;
}

function SettingsSection({ eyebrow, title, description, children, footer }: { eyebrow: string; title: string; description: string; children: ReactNode; footer?: ReactNode }) {
  return <Card className="sample-settings-card"><div className="sample-settings-card-head"><SectionEyebrow>{eyebrow}</SectionEyebrow><h2>{title}</h2><p>{description}</p></div><CardContent className="sample-settings-fields">{children}</CardContent>{footer && <div className="sample-settings-card-footer">{footer}</div>}</Card>;
}

function SettingsField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <Field className="sample-settings-field"><FieldLabel>{label}</FieldLabel>{children}{hint && <FieldDescription>{hint}</FieldDescription>}</Field>;
}

function SettingsConnection({ onNotice }: { onNotice: (message: string) => void }) {
  return <SettingsSection eyebrow="CLOUD API / AUTH" title="云效连接" description="个人访问令牌只保存在本机，用于读取工作项、仓库和流水线数据。" footer={<div className="sample-settings-status"><span className="sample-env-led" />已连接 · 上次验证 2 分钟前</div>}><SettingsField label="组织 ID" hint="来自 devops.aliyun.com/organization/<组织 ID>"><Input defaultValue="org_7c9d4a2e" className="sample-form-input sample-mono" /></SettingsField><SettingsField label="默认项目空间"><Select defaultValue="space_2f81c4"><SelectTrigger className="sample-form-select"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="space_2f81c4">平台工程（space_2f81c4）</SelectItem><SelectItem value="space_3d12aa">基础设施（space_3d12aa）</SelectItem></SelectGroup></SelectContent></Select></SettingsField><SettingsField label="个人访问令牌" hint="已保存的令牌不会在页面上显示"><div className="sample-token-field"><LockKeyhole size={14} /><span>agp_••••••••••••••••</span><Button variant="link" size="xs" onClick={() => onNotice('令牌编辑仍然是 mock 行为')}>重新设置</Button></div></SettingsField><div className="sample-settings-actions"><Button variant="outline" className="sample-button sample-button-soft" onClick={() => onNotice('连接测试成功 · 186ms')}><Zap size={14} />测试连接</Button></div></SettingsSection>;
}

function SettingsTrace({ onNotice }: { onNotice: (message: string) => void }) {
  return <SettingsSection eyebrow="TRACE / ITERATION GATE" title="追溯与仓库" description="以当前迭代为边界关联需求、子任务、仓库分支和 CI；最终状态由需求分支是否合入迭代分支决定。"><SettingsField label="当前迭代"><Select defaultValue="Benz-20261016"><SelectTrigger className="sample-form-select"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="Benz-20261016">Benz-20261016 · 前端优化迭代</SelectItem><SelectItem value="ITER-17">ITER-17 · 稳定性</SelectItem></SelectGroup></SelectContent></Select></SettingsField><SettingsField label="迭代分支规则" hint="需求分支从当前迭代基础分支拉取最新代码，开发分支默认使用 dev"><div className="sample-branch-rule-grid"><span><small>基础分支</small><strong className="sample-mono">iteration/Benz-20261016</strong></span><span><small>开发分支</small><strong className="sample-mono">dev</strong></span></div></SettingsField><SettingsField label="工作项匹配规则" hint="分支、提交信息和 MR 标题中出现编号即视为关联"><Input defaultValue="(?:REQ|BUG|TASK)[-_]?(\\d+)" className="sample-form-input sample-mono" /></SettingsField><SettingsField label="默认追溯仓库（1:N）" hint="需求未配置独立覆盖时，使用这组仓库"><div className="sample-multi-select"><div className="sample-repo-chip-list"><span>codeup / nervd-web <Button variant="ghost" size="icon-xs" onClick={() => onNotice('已移除 nervd-web（mock）')} aria-label="移除 nervd-web"><X size={11} /></Button></span><span>codeup / nervd-core <Button variant="ghost" size="icon-xs" onClick={() => onNotice('已移除 nervd-core（mock）')} aria-label="移除 nervd-core"><X size={11} /></Button></span><span>docs / delivery-handbook <Button variant="ghost" size="icon-xs" onClick={() => onNotice('已移除 delivery-handbook（mock）')} aria-label="移除 delivery-handbook"><X size={11} /></Button></span></div><Button variant="link" size="xs" className="sample-multi-select-add" onClick={() => onNotice('仓库选择器已打开（mock）')}><Plus data-icon="inline-start" />添加仓库</Button></div></SettingsField><div className="sample-check-list"><Field orientation="horizontal"><Checkbox defaultChecked /><FieldLabel><span><strong>扫描合并请求</strong><small>将每个关联仓库的 MR 状态和目标迭代分支纳入追溯链路</small></span></FieldLabel></Field><Field orientation="horizontal"><Checkbox defaultChecked /><FieldLabel><span><strong>监听合入迭代分支</strong><small>持续判断当前需求分支是否已合入 iteration/Benz-20261016</small></span></FieldLabel></Field><Field orientation="horizontal"><Checkbox defaultChecked /><FieldLabel><span><strong>交叉匹配 CI 运行</strong><small>按仓库 × 分支 × 环境匹配最近一次流水线运行</small></span></FieldLabel></Field></div><div className="sample-settings-actions"><Button className="sample-button sample-button-coral" onClick={() => onNotice('追溯规则已更新（mock）')}><Check size={14} />应用规则</Button></div></SettingsSection>;
}

function SettingsCi({ onNotice }: { onNotice: (message: string) => void }) {
  return <SettingsSection eyebrow="CI / PROVIDERS" title="CI 集成" description="一个仓库可以绑定云效 Flow 或 Jenkins，运行历史会在工作台与总览中汇总。"><div className="sample-provider-card"><div className="sample-provider-logo flow-logo"><Workflow size={17} /></div><div><strong>云效 Flow</strong><span>2 个流水线绑定 · 默认供应商</span></div><StatusBadge tone="ok">已连接</StatusBadge><Button variant="ghost" size="icon-xs" onClick={() => onNotice('Flow 连接详情已展开')} aria-label="展开 Flow 连接详情"><MoreHorizontal size={16} /></Button></div><div className="sample-provider-card"><div className="sample-provider-logo jenkins-logo"><Terminal size={17} /></div><div><strong>Jenkins / build-east</strong><span>http://jenkins.example.local · 2 个 Job</span></div><StatusBadge tone="run">已配置</StatusBadge><Button variant="ghost" size="icon-xs" onClick={() => onNotice('Jenkins Job 配置已展开')} aria-label="展开 Jenkins 配置"><MoreHorizontal size={16} /></Button></div><Button variant="outline" className="sample-button sample-button-soft" onClick={() => onNotice('新增 CI 实例表单已准备好')}><Plus size={14} />添加 CI 实例</Button></SettingsSection>;
}

function SettingsSecurity({ writeEnabled, onWriteToggle, onNotice }: { writeEnabled: boolean; onWriteToggle: (enabled: boolean) => void; onNotice: (message: string) => void }) {
  return <SettingsSection eyebrow="SECURITY / LOCAL POLICY" title="安全策略" description="默认只读。打开写操作后，工作台才会展示分支、MR、CI 触发与迭代分支管理动作。"><div className="sample-security-toggle"><div className="sample-security-icon"><ShieldCheck size={19} /></div><div><strong>允许写操作</strong><span>控制所有会改变云效或 CI 状态的按钮</span></div><Switch checked={writeEnabled} onCheckedChange={onWriteToggle} className={`sample-switch${writeEnabled ? ' is-on' : ''}`} aria-label="允许写操作" /></div><Alert className="sample-security-note"><LockKeyhole /><AlertDescription><strong>{writeEnabled ? '写操作已开启（演示）' : '当前为只读模式'}</strong><span>{writeEnabled ? '样例动作会显示“已触发”反馈，但不会向真实服务发送请求。' : '所有写按钮仍可查看意图，点击后会解释被策略拦截的原因。'}</span></AlertDescription></Alert><div className="sample-local-row"><span>本地凭证存储</span><strong>macOS Keychain</strong><Button variant="link" size="xs" onClick={() => onNotice('凭证不会在 mock 页面展示')}>查看说明</Button></div><div className="sample-settings-actions"><Button variant="outline" className="sample-button sample-button-soft" onClick={() => onNotice('已执行本地策略检查')}><ShieldCheck size={14} />检查策略</Button></div></SettingsSection>;
}

function LogDrawer({ title, onClose }: { title: string; onClose: () => void }) {
  const lines = ['[09:42:08] resolving workitem context REQ-2048', '[09:42:09] matched branch feature/REQ-2048-trace', '[09:42:12] checkout commit 9f3ac21', '[09:43:40] unit tests 128 passed', '[09:45:16] build artifacts uploaded', '[09:45:17] pipeline finished with SUCCESS'];
  return <Dialog open={Boolean(title)} onOpenChange={(open) => !open && onClose()}><DialogContent className="sample-log-drawer" showCloseButton={false}><DialogHeader className="sample-log-head"><div><SectionEyebrow>CONSOLE OUTPUT</SectionEyebrow><DialogTitle>{title}</DialogTitle><DialogDescription className="sr-only">构建日志只读预览</DialogDescription></div><DialogClose render={<Button variant="ghost" size="icon" className="sample-icon-button sample-icon-button-dark" onClick={onClose} aria-label="关闭" />}><X size={17} /></DialogClose></DialogHeader><div className="sample-log-meta"><StatusBadge tone="ok">SUCCESS</StatusBadge><span>exit code 0</span><span>8 分钟前</span></div><pre>{lines.map((line, index) => <code key={line}><span className="sample-log-line-number">{String(index + 1).padStart(2, '0')}</span>{line}{'\n'}</code>)}</pre><div className="sample-log-foot"><span><Terminal size={14} /> mock / immutable output</span><DialogClose render={<Button variant="outline" className="sample-button sample-button-dark-outline" onClick={onClose} />}>关闭日志</DialogClose></div></DialogContent></Dialog>;
}

export default function App() {
  const [section, setSection] = useState<Section>('workbench');
  const [selectedId, setSelectedId] = useState('REQ-2048');
  const [query, setQuery] = useState('');
  const [traceOpen, setTraceOpen] = useState(true);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('connection');
  const [writeEnabled, setWriteEnabled] = useState(false);
  const [logTitle, setLogTitle] = useState<string | null>(null);
  const selectedItem = workItems.find((item) => item.id === selectedId) ?? workItems[0];

  const openWorkbench = (id?: string) => {
    if (id) setSelectedId(id);
    setSection('workbench');
  };
  const openSettings = () => {
    setSection('settings');
    setSettingsTab('security');
  };
  const notify = (message: string) => {
    toast.add({ title: 'Mock feedback', description: message, type: 'info', timeout: 3200 });
  };
  const runWriteAction = (label: string) => {
    if (!writeEnabled) {
      notify(`${label}已被只读策略拦截 · 可在设置 → 安全策略中开启`);
      return;
    }
    notify(`${label}已触发（mock）· 不会发送真实请求`);
  };

  return <Toaster><div className="sample-app"><Sidebar section={section} selectedId={selectedId} onSectionChange={setSection} onSelectItem={setSelectedId} writeEnabled={writeEnabled} /><div className="sample-shell"><Topbar section={section} query={query} onQueryChange={setQuery} onNotice={notify} /><main className="sample-main">{section === 'overview' && <OverviewPage onOpenWorkbench={openWorkbench} onOpenPipeline={() => setSection('pipelines')} onOpenLog={setLogTitle} onNotice={notify} />}{section === 'workbench' && <WorkbenchPage selectedItem={selectedItem} selectedId={selectedId} query={query} onSelect={setSelectedId} onQueryChange={setQuery} traceOpen={traceOpen} onToggleTrace={() => setTraceOpen((open) => !open)} onWrite={runWriteAction} onOpenLog={setLogTitle} onNotice={notify} onOpenIterations={() => setSection('iterations')} />}{section === 'iterations' && <IterationPage onWrite={runWriteAction} onNotice={notify} />}{section === 'pipelines' && <PipelinePage onWrite={runWriteAction} onOpenLog={setLogTitle} onNotice={notify} />}{section === 'repositories' && <RepositoriesPage onOpenLog={setLogTitle} onNotice={notify} />}{section === 'settings' && <SettingsPage tab={settingsTab} onTabChange={setSettingsTab} writeEnabled={writeEnabled} onWriteToggle={setWriteEnabled} onNotice={notify} />}</main></div>{logTitle && <LogDrawer title={logTitle} onClose={() => setLogTitle(null)} />}{section !== 'settings' && !logTitle && <Button variant="ghost" className="sample-float-help justify-start" onClick={openSettings}><span>?</span><span>体验策略</span></Button>}</div></Toaster>;
}
