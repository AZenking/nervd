import { Modal, Surface } from '@heroui/react';
import { Card } from '@/components/ui/card';
import {
  CheckCircle2Icon,
  CopyIcon,
  ExternalLinkIcon,
  KeyRoundIcon,
  Loader2Icon,
  RefreshCwIcon,
  SettingsIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
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

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * 关于 nervd 独立弹窗（Deep Linear 风格设计）：
 * - Base UI Dialog 受控于 useUi.aboutOpen；
 * - 集中呈现品牌标识、客户端版本、系统架构与运行模式；
 * - 提供一键检查更新、诊断快照拷贝、快捷键与设置直达。
 */
export function AboutDialog() {
  const open = useUi((s) => s.aboutOpen);
  const setAboutOpen = useUi((s) => s.setAboutOpen);
  const setShortcutsOpen = useUi((s) => s.setShortcutsOpen);
  const openSettings = useUi((s) => s.openSettings);
  const settings = useApp((s) => s.settings);

  const {
    status,
    hasUpdate,
    isChecking,
    isUpdating,
    isDownloading,
    isInstalling,
    updateInfo,
    progress,
    checkForUpdates,
    startOneClickUpdate,
    openDownload,
  } = useAppUpdate();

  const allowWriteOps = settings?.allowWriteOps ?? false;

  const handleOpenShortcuts = () => {
    setAboutOpen(false);
    setShortcutsOpen(true);
  };

  const handleOpenSettings = () => {
    setAboutOpen(false);
    openSettings('about');
  };

  return (
    <Modal isOpen={open} onOpenChange={setAboutOpen}>
      <Modal.Backdrop variant="blur">
        <Modal.Container placement="center" size="sm">
          <Modal.Dialog className="relative p-0 overflow-hidden sm:max-w-[480px]">
            {/* 无障碍隐藏标题 */}
            <Modal.Heading className="sr-only">关于 nervd</Modal.Heading>

            {/* 右上角关闭按钮：z-10 压过后续 relative 品牌区，避免透明命中层吞掉点击 */}
            <Modal.CloseTrigger className="z-10" />

            {/* 顶部 Hero 品牌区 */}
          <div className="relative flex flex-col items-center px-6 pt-7 pb-5 text-center">
            {/* 柔和顶部环境微光 */}
            <div
              className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 size-48 rounded-full bg-primary/10 blur-2xl"
              aria-hidden="true"
            />

            {/* App Icon */}
            <div className="relative mb-3 flex size-16 items-center justify-center rounded-2xl bg-sidebar-primary ring-1 ring-border/80">
              <img
                src="/nervd-logo.png"
                alt="nervd logo"
                className="size-full rounded-2xl object-cover"
              />
            </div>

            {/* 软件标题与版本 */}
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                {APP_NAME}
              </h2>
              <Badge variant="outline" className="font-mono text-xs font-medium">
                v{APP_VERSION}
              </Badge>
              <Badge variant="secondary" className="text-[11px] font-normal text-muted-foreground">
                {APP_BUILD_CHANNEL}
              </Badge>
            </div>

            {/* 一句话定位 */}
            <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground">
              {APP_TAGLINE}
            </p>

            {/* 核心架构特性标签 */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-[11px]">
              <Surface variant="secondary" className="rounded-md border border-border/60 px-2 py-0.5 text-muted-foreground font-mono">
                Tauri 2 (Rust Core)
              </Surface>
              <Surface variant="secondary" className="rounded-md border border-border/60 px-2 py-0.5 text-muted-foreground">
                React 19
              </Surface>
              <Surface variant="secondary" className="rounded-md border border-border/60 px-2 py-0.5 text-muted-foreground">
                HeroUI v3
              </Surface>
              <Surface variant="secondary" className="rounded-md border border-border/60 px-2 py-0.5 text-muted-foreground">
                Tailwind v4
              </Surface>
            </div>
          </div>

          {/* 中间状态与诊断面板 */}
          <div className="flex flex-col gap-2.5 px-5 pb-4">
            {/* 状态徽章条 */}
            <Surface variant="secondary" className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 p-3 text-xs">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">写操作权限</span>
                <div className="flex items-center gap-1.5 font-medium">
                  {allowWriteOps ? (
                    <>
                      <ShieldAlertIcon className="size-3.5 text-destructive" />
                      <span className="text-destructive">已开启写操作</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheckIcon className="size-3.5 text-success" />
                      <span className="text-foreground">只读保护中</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">鉴权凭据存储</span>
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <KeyRoundIcon className="size-3.5 text-muted-foreground" />
                  <span>macOS Keychain</span>
                </div>
              </div>
            </Surface>

            {/* 发现新版本专属卡片 */}
            {hasUpdate && updateInfo && (
              <Card className="border-primary/30 bg-primary/5 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <SparklesIcon className="size-3.5 text-primary" />
                    <span>发现新版本 v{updateInfo.latestVersion}</span>
                  </div>
                  <Badge variant="outline" className="border-primary/40 bg-primary/10 text-[10px] text-primary">
                    {isInstalling ? '安装中' : isDownloading ? '下载中' : status === 'done' ? '准备就绪' : '可更新'}
                  </Badge>
                </div>
                {updateInfo.releaseNotes && (
                  <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground whitespace-pre-line">
                    {updateInfo.releaseNotes}
                  </p>
                )}

                {/* 一键更新下载进度与状态展示 */}
                {isUpdating || status === 'done' ? (
                  <div className="flex flex-col gap-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Loader2Icon className="size-3 animate-spin text-primary" />
                        <span>{progress?.message || (isInstalling ? '正在安装更新…' : '正在下载…')}</span>
                      </span>
                      <span className="font-mono text-xs font-medium text-foreground">
                        {progress?.percent.toFixed(0) ?? 0}%
                      </span>
                    </div>

                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/20">
                      <div
                        className="h-full bg-primary transition-all duration-150"
                        style={{ width: `${Math.max(4, progress?.percent ?? 0)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                      <span>
                        {progress?.transferredBytes ? formatBytes(progress.transferredBytes) : '0 B'}
                        {progress?.totalBytes ? ` / ${formatBytes(progress.totalBytes)}` : ''}
                      </span>
                      {Boolean(progress?.speedBytesPerSec) && (
                        <span>{formatBytes(progress!.speedBytesPerSec)}/s</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 flex items-center gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onPress={() => void startOneClickUpdate()}
                      className="h-7 flex-1 gap-1.5 text-xs font-medium cursor-pointer"
                    >
                      <SparklesIcon className="size-3.5" />
                      <span>一键自动更新</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onPress={() => void openDownload()}
                      className="h-7 gap-1 px-2.5 text-xs font-normal text-muted-foreground hover:text-foreground cursor-pointer"
                      title="在浏览器中手动下载安装包"
                    >
                      <ExternalLinkIcon className="size-3" />
                      <span>手动下载</span>
                    </Button>
                  </div>
                )}
              </Card>
            )}

            {/* 快速动作行 */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                disabled={isChecking}
                onPress={() => void checkForUpdates(false)}
                className="h-8 flex-1 gap-1.5 text-xs font-normal cursor-pointer"
              >
                {status === 'up_to_date' ? (
                  <CheckCircle2Icon className="size-3.5 text-success" />
                ) : (
                  <RefreshCwIcon className={`size-3.5 ${isChecking ? 'animate-spin text-primary' : 'text-muted-foreground'}`} />
                )}
                <span>
                  {isChecking
                    ? '正在检查…'
                    : status === 'available'
                    ? '发现新版本'
                    : status === 'up_to_date'
                    ? '当前已是最新'
                    : status === 'error'
                    ? '检查重试'
                    : '检查更新'}
                </span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onPress={() => void copyDiagnosticSnapshot(settings, allowWriteOps)}
                className="h-8 flex-1 gap-1.5 text-xs font-normal cursor-pointer"
                title="复制包含版本、系统与脱敏配置的快照"
              >
                <CopyIcon className="size-3.5 text-muted-foreground" />
                <span>复制诊断信息</span>
              </Button>
            </div>
          </div>

          {/* 底部导航与外链条 */}
          <div className="flex items-center justify-between border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenShortcuts}
                className="cursor-pointer hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                快捷键 (<Kbd variant="light" className="h-5! px-1.5! text-[11px]!">?</Kbd>)
              </button>
              <span aria-hidden="true" className="text-border">·</span>
              <button
                type="button"
                onClick={() => void copyQuarantineCommand()}
                className="cursor-pointer hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                title="复制解除 macOS 首次打开拦截命令: xattr -cr /Applications/nervd.app"
              >
                放行命令
              </button>
              <span aria-hidden="true" className="text-border">·</span>
              <button
                type="button"
                onClick={handleOpenSettings}
                className="flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <SettingsIcon className="size-3" />
                <span>详细设置</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void openExternal(REPO_URL)}
                className="flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span>GitHub</span>
                <ExternalLinkIcon className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => void openExternal(DOCS_URL)}
                className="flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span>云效</span>
                <ExternalLinkIcon className="size-3" />
              </button>
            </div>
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  </Modal>
);
}
