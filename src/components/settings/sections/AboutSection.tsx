import {
  CheckCircle2Icon,
  ChevronDownIcon,
  DownloadIcon,
  InfoIcon,
  KeyRoundIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Accordion } from '@/components/ui/accordion';
import { SettingsGroup, SettingsRow } from '../settings-group';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { useAppUpdate } from '@/hooks/use-app-update';
import { APP_BUILD_CHANNEL, APP_NAME, APP_TAGLINE, APP_VERSION } from '@/lib/app-info';

/**
 * 设置 → 关于 nervd（应用）。
 *
 * 只承载产品版本、发布渠道与更新检查；安全配置摘要提供跳转而不重复配置，
 * 技术架构信息默认折叠。主题偏好已迁至「外观与交互」，诊断能力已迁至「诊断与支持」。
 */
export function AboutSection() {
  const { settings } = useApp();
  const { openSettings, setAboutOpen } = useUi();
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
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary ring-1 ring-border">
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
                <Chip size="sm" variant="secondary" className="font-mono font-medium">
                  v{APP_VERSION}
                </Chip>
                <Chip size="sm" variant="soft" className="font-normal text-muted-foreground">
                  {APP_BUILD_CHANNEL}
                </Chip>
              </div>
              <p className="text-xs text-muted-foreground">{APP_TAGLINE}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:self-center">
            <Button
              variant="secondary"
              size="sm"
              onPress={() => setAboutOpen(true)}
              className="gap-1.5"
            >
              <InfoIcon className="size-3.5 text-muted-foreground" />
              <span>打开关于卡片</span>
            </Button>
          </div>
        </div>

        {hasUpdate && updateInfo && (
          <div className="mx-4 mt-4 flex flex-row items-center justify-between gap-3 rounded-md border border-border bg-primary/5 p-3 text-xs">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <SparklesIcon className="size-3.5 text-primary" />
                <span>发现新版本 v{updateInfo.latestVersion}</span>
                <Chip size="sm" color="accent" variant="soft">
                  可更新
                </Chip>
              </div>
              <p className="line-clamp-1 text-[11px] text-muted-foreground">
                {updateInfo.releaseName || '包含最新稳定性改进与新功能特性。'}
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onPress={() => void openDownload()}
              className="shrink-0 gap-1.5"
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
                <span className="flex items-center gap-1 text-xs text-success font-medium">
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
                variant="secondary"
                size="sm"
                isDisabled={isChecking}
                onPress={() => void checkForUpdates(false)}
                className="gap-1.5"
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

      {/* 安全与凭据状态摘要：只读状态 + 跳转，不重复配置项 */}
      <SettingsGroup
        title="安全概览"
        description="当前只读保护与凭据存储状态；具体开关与说明在「安全与权限」中管理。"
      >
        <SettingsRow
          orientation="horizontal"
          label="写操作权限"
          description={
            allowWriteOps
              ? '当前已开启受控写操作模式，可在客户端内创建分支、触发流水线与回写状态。'
              : '当前处于只读保护模式，所有破坏性或写操作均已在界面与 Rust Core 双重锁定。'
          }
          control={(
            <div className="flex items-center gap-2">
              {allowWriteOps ? (
                <Chip size="sm" color="danger" variant="soft" className="gap-1 font-normal">
                  <ShieldAlertIcon className="size-3" />
                  写操作已开启
                </Chip>
              ) : (
                <Chip size="sm" variant="soft" className="gap-1 font-normal text-muted-foreground">
                  <ShieldCheckIcon className="size-3 text-success" />
                  只读保护中
                </Chip>
              )}
              <Button
                variant="ghost"
                size="sm"
                onPress={() => openSettings('security')}
                className="text-muted-foreground hover:text-foreground"
              >
                管理
              </Button>
            </div>
          )}
        />

        <SettingsRow
          orientation="horizontal"
          label="访问凭据保护"
          description="云效个人访问令牌（PAT）经 macOS Keychain 本地保护，不以明文落盘。"
          control={(
            <div className="flex items-center gap-2">
              <Chip size="sm" variant="secondary" className="gap-1">
                <KeyRoundIcon className="size-3 text-muted-foreground" />
                macOS Keychain
              </Chip>
              <Button
                variant="ghost"
                size="sm"
                onPress={() => openSettings('security')}
                className="text-muted-foreground hover:text-foreground"
              >
                查看说明
              </Button>
            </div>
          )}
        />
      </SettingsGroup>

      {/* 技术架构（默认折叠） */}
      <SettingsGroup
        title="技术信息"
        description="实现架构栈与运行环境；默认收起，排查问题时展开查看。"
      >
        <Accordion hideSeparator>
          <Accordion.Item id="tech-stack">
            <Accordion.Heading>
              <Accordion.Trigger>
                技术架构与运行环境
                <Accordion.Indicator>
                  <ChevronDownIcon />
                </Accordion.Indicator>
              </Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <Accordion.Body>
                <div className="flex flex-col gap-3 text-xs">
                  {[
                    {
                      label: '桌面核心与 IPC 通信',
                      description: '基于 Tauri 2 + Rust 驱动，具备纳秒级启动开销与零 Node.js 内存驻留设计。',
                      value: 'Tauri 2 (Rust Core)',
                    },
                    {
                      label: '视图与无障碍原语',
                      description: 'React 19 + TypeScript + @heroui/react v3 无障碍组件基座（React Aria），保障键盘顺畅流动。',
                      value: 'React 19 · HeroUI v3',
                    },
                    {
                      label: '设计系统与图谱引擎',
                      description: '深浅色双模 Tailwind CSS v4 CSS-First 主题 + @xyflow/react 分支流图。',
                      value: 'Tailwind v4 · XYFlow',
                    },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-medium text-foreground">{item.label}</span>
                        <p className="leading-5 text-muted-foreground">{item.description}</p>
                      </div>
                      <Chip size="sm" variant="secondary" className="shrink-0">
                        {item.value}
                      </Chip>
                    </div>
                  ))}
                </div>
              </Accordion.Body>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </SettingsGroup>
    </div>
  );
}