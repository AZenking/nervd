import {
  CheckCircle2Icon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  InfoIcon,
  KeyRoundIcon,
  MonitorIcon,
  MoonIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SunIcon,
  TerminalIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SettingsGroup, SettingsRow } from '../settings-group';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { useAppUpdate } from '@/hooks/use-app-update';
import {
  APP_BUILD_CHANNEL,
  APP_NAME,
  APP_TAGLINE,
  APP_VERSION,
  copyDiagnosticSnapshot,
  copyQuarantineCommand,
  DOCS_URL,
  REPO_URL,
} from '@/lib/app-info';
import { openExternal } from '@/lib/yunxiao-link';

export function AboutSection() {
  const { settings } = useApp();
  const { openSettings, setShortcutsOpen, setAboutOpen, theme, resolvedTheme, setTheme } = useUi();
  const { status, hasUpdate, isChecking, updateInfo, error, checkForUpdates, openDownload } = useAppUpdate();

  const allowWriteOps = settings?.allowWriteOps ?? false;

  return (
    <div className="flex flex-col gap-6">
      {/* 软件与版本基本信息 */}
      <SettingsGroup
        title="软件与版本"
        description="nervd 客户端基础版本与发布渠道信息。"
      >
        <div className="flex flex-col gap-4 border-b border-border/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary shadow-xs ring-1 ring-border">
              <img
                src="/nervd-logo.png"
                alt="nervd logo"
                className="size-full rounded-xl object-cover"
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold tracking-tight text-foreground">
                  {APP_NAME}
                </span>
                <Badge variant="outline" className="font-mono text-xs font-medium">
                  v{APP_VERSION}
                </Badge>
                <Badge variant="secondary" className="text-[11px] font-normal text-muted-foreground">
                  {APP_BUILD_CHANNEL}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{APP_TAGLINE}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:self-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAboutOpen(true)}
              className="gap-1.5 text-xs"
            >
              <InfoIcon className="size-3.5 text-muted-foreground" />
              <span>打开关于卡片</span>
            </Button>
          </div>
        </div>

        {hasUpdate && updateInfo && (
          <div className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <SparklesIcon className="size-3.5 text-primary" />
                <span>发现新版本 v{updateInfo.latestVersion}</span>
                <Badge variant="outline" className="border-primary/40 bg-primary/10 text-[10px] text-primary">
                  可更新
                </Badge>
              </div>
              <p className="line-clamp-1 text-[11px] text-muted-foreground">
                {updateInfo.releaseName || '包含最新稳定性改进与新功能特性。'}
              </p>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={() => void openDownload()}
              className="h-7 shrink-0 gap-1.5 text-xs font-medium cursor-pointer"
            >
              <DownloadIcon className="size-3.5" />
              <span>下载更新</span>
            </Button>
          </div>
        )}

        <SettingsRow
          orientation="horizontal"
          label="检查更新"
          description={
            isChecking
              ? '正在连接发布通道检查最新版本信息…'
              : status === 'available' && updateInfo
              ? `已发现新版本 v${updateInfo.latestVersion}，点击右侧“下载更新”即可获取最新安装包。`
              : status === 'up_to_date'
              ? `当前已是最新版本 (v${APP_VERSION})，未发现新更新。`
              : status === 'error'
              ? `检查更新异常: ${error || '网络连接超时'}`
              : '连接发布更新通道以获取最新功能和安全更新补丁。'
          }
          control={(
            <div className="flex items-center gap-2">
              {status === 'up_to_date' && (
                <span className="flex items-center gap-1 text-xs text-emerald-500 font-medium">
                  <CheckCircle2Icon className="size-3.5" />
                  已是最新
                </span>
              )}
              {status === 'available' && (
                <span className="flex items-center gap-1 text-xs text-primary font-medium">
                  <SparklesIcon className="size-3.5" />
                  有可用版本
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={isChecking}
                onClick={() => void checkForUpdates(false)}
                className="gap-1.5 text-xs cursor-pointer"
              >
                <RefreshCwIcon className={`size-3.5 ${isChecking ? 'animate-spin text-primary' : 'text-muted-foreground'}`} />
                <span>
                  {isChecking
                    ? '正在检查…'
                    : status === 'available'
                    ? '重新检查'
                    : status === 'up_to_date'
                    ? '检查更新'
                    : status === 'error'
                    ? '重试'
                    : '检查更新'}
                </span>
              </Button>
            </div>
          )}
        />
      </SettingsGroup>

      {/* 外观与主题偏好 */}
      <SettingsGroup
        title="外观与主题"
        description="选择 nervd 界面主题模式，支持跟随 macOS 系统外观自动切换。"
      >
        <SettingsRow
          orientation="horizontal"
          label="明暗主题模式"
          description={
            theme === 'system'
              ? `当前正跟随系统外观（当前解析为${resolvedTheme === 'dark' ? '深色模式' : '浅色模式'}）。`
              : theme === 'dark'
              ? '当前已锁定深色模式（Dark）。'
              : '当前已锁定浅色模式（Light）。'
          }
          control={(
            <div className="flex items-center rounded-lg border border-border bg-muted/40 p-1 text-xs">
              <button
                type="button"
                onClick={(e) => setTheme('system', { clientX: e.clientX, clientY: e.clientY })}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer',
                  theme === 'system'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <MonitorIcon className="size-3.5" />
                <span>跟随系统</span>
              </button>
              <button
                type="button"
                onClick={(e) => setTheme('light', { clientX: e.clientX, clientY: e.clientY })}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer',
                  theme === 'light'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <SunIcon className="size-3.5" />
                <span>浅色</span>
              </button>
              <button
                type="button"
                onClick={(e) => setTheme('dark', { clientX: e.clientX, clientY: e.clientY })}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer',
                  theme === 'dark'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <MoonIcon className="size-3.5" />
                <span>深色</span>
              </button>
            </div>
          )}
        />
      </SettingsGroup>

      {/* 运行时与安全环境 */}
      <SettingsGroup
        title="运行环境与安全概览"
        description="当前客户端连接状态、凭据保护与系统写操作防护模式。"
      >
        <SettingsRow
          orientation="horizontal"
          label="写操作权限控制"
          description={
            allowWriteOps
              ? '当前已开启受控写操作模式，可在客户端内创建分支、触发流水线与回写状态。'
              : '当前处于只读保护模式，所有破坏性或写操作均已在界面与 Rust Core 双重锁定。'
          }
          control={(
            <div className="flex items-center gap-2">
              {allowWriteOps ? (
                <Badge variant="destructive" className="gap-1 h-5 px-1.5 text-[11px] font-normal">
                  <ShieldAlertIcon className="size-3" />
                  写操作已开启
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1 h-5 px-1.5 text-[11px] font-normal text-muted-foreground">
                  <ShieldCheckIcon className="size-3 text-emerald-500" />
                  只读保护中
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openSettings('security')}
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
              >
                管理
              </Button>
            </div>
          )}
        />

        <SettingsRow
          orientation="horizontal"
          label="访问凭据加密存储"
          description="云效个人访问令牌（PAT）经 macOS Keychain 本地硬件级密钥保护，不落盘明文。"
          control={(
            <div className="flex items-center gap-1.5">
              <KeyRoundIcon className="size-3.5 text-muted-foreground" />
              <Badge variant="outline" className="border-border bg-muted/40 font-mono text-[11px] text-muted-foreground">
                macOS Keychain
              </Badge>
            </div>
          )}
        />

        <SettingsRow
          orientation="horizontal"
          label="绑定的云效空间"
          description="当前工作台聚合拉取工作项与流水线的默认云效空间。"
          control={(
            <span className="font-mono text-xs text-muted-foreground">
              {settings?.organizationId
                ? `${settings.defaultSpaceIdentifier || '全项目'} (${settings.organizationId.slice(0, 6)}…)`
                : '尚未配置'}
            </span>
          )}
        />
      </SettingsGroup>

      {/* 技术架构规范 */}
      <SettingsGroup
        title="技术架构体系"
        description="nervd 采用的现代化跨平台与前端无障碍架构栈。"
      >
        <SettingsRow
          orientation="horizontal"
          label="桌面核心与 IPC 通信"
          description="基于 Tauri 2 + Rust 驱动，具备纳秒级启动开销与零 Node.js 内存驻留设计。"
          control={(
            <Badge variant="outline" className="border-border bg-muted/40 font-mono text-[11px] text-muted-foreground">
              Tauri 2 (Rust Core)
            </Badge>
          )}
        />
        <SettingsRow
          orientation="horizontal"
          label="视图与无障碍原语"
          description="React 19 + TypeScript + @base-ui/react Headless 无障碍原语，保障键盘顺畅流动。"
          control={(
            <Badge variant="outline" className="border-border bg-muted/40 font-mono text-[11px] text-muted-foreground">
              React 19 · Base UI
            </Badge>
          )}
        />
        <SettingsRow
          orientation="horizontal"
          label="设计系统与图谱引擎"
          description="深浅色双模 Tailwind CSS v4 CSS-First 主题 + @xyflow/react 分支流图。"
          control={(
            <Badge variant="outline" className="border-border bg-muted/40 font-mono text-[11px] text-muted-foreground">
              Tailwind v4 · XYFlow
            </Badge>
          )}
        />
      </SettingsGroup>

      {/* 诊断、支持与开源协议 */}
      <SettingsGroup
        title="诊断与技术支持"
        description="用于 GitHub Issue 报障排查的诊断快照与快捷参考指南。"
      >
        <SettingsRow
          orientation="horizontal"
          label="系统诊断快照"
          description="一键生成并复制脱敏后的系统版本、环境参数与配置状态，便于排查异常。"
          control={(
            <Button
              variant="outline"
              size="sm"
              onClick={() => void copyDiagnosticSnapshot(settings, allowWriteOps)}
              className="gap-1.5 text-xs"
            >
              <CopyIcon className="size-3.5 text-muted-foreground" />
              <span>复制诊断快照</span>
            </Button>
          )}
        />

        <SettingsRow
          orientation="horizontal"
          label="macOS 首次安装安全放行"
          description="新版本通过浏览器下载覆盖后若被 Gatekeeper 拦截（提示“无法验证开发者”或“已损坏”），点击复制终端命令执行即可一键解除隔离。"
          control={(
            <Button
              variant="outline"
              size="sm"
              onClick={() => void copyQuarantineCommand()}
              className="gap-1.5 text-xs cursor-pointer font-mono"
            >
              <TerminalIcon className="size-3.5 text-muted-foreground" />
              <span>复制放行命令</span>
            </Button>
          )}
        />

        <SettingsRow
          orientation="horizontal"
          label="键盘快捷键速查"
          description="查看全键盘导航 (j/k/Enter/x)、g 系列单手序列与全局命令快捷键速查表。"
          control={(
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShortcutsOpen(true)}
              className="gap-1.5 text-xs"
            >
              <kbd className="rounded border border-border bg-background px-1 font-mono text-[11px] text-muted-foreground">?</kbd>
              <span>查看速查表</span>
            </Button>
          )}
        />

        <SettingsRow
          orientation="horizontal"
          label="开源协议与外部支持"
          description="nervd 遵循开源许可协议开发，欢迎提交建议与 Pull Request。"
          control={(
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void openExternal(REPO_URL)}
                className="gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <span>GitHub</span>
                <ExternalLinkIcon className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void openExternal(DOCS_URL)}
                className="gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <span>云效平台</span>
                <ExternalLinkIcon className="size-3" />
              </Button>
            </div>
          )}
        />
      </SettingsGroup>
    </div>
  );
}
