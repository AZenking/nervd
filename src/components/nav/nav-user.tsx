import { HelpCircleIcon, MonitorIcon, MoonIcon, SettingsIcon, SunIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useUi } from '@/store/ui';
import { useAppUpdate } from '@/hooks/use-app-update';
import { APP_VERSION } from '@/lib/app-info';

/**
 * 侧栏底部操作区（2026-11-17 设计评审：去除中文文案，只留图标）：
 * - 三个纯图标入口横排为紧凑工具簇，语义全部由 Tooltip + aria-label 承载，视觉不出现中文字样；
 * - 帮助：有新版本时在图标右上角显示品牌色圆点（无文字徽标），Tooltip 内给出新版本号；
 * - 主题：图标随当前主题切换（跟随系统 / 深色 / 浅色），点击就地切换并保留 View Transition 涟漪；
 * - 设置：直达系统设置，Tooltip 内保留 `g s` 快捷键提示；
 * - 侧栏折叠为图标模式时自动改为竖排三枚图标，与主导航折叠态节奏一致。
 */
export function NavUser() {
  const { openSettings, theme, resolvedTheme, toggleTheme, setAboutOpen } = useUi();
  const { hasUpdate, updateInfo } = useAppUpdate();

  const themeLabel =
    theme === 'system'
      ? `跟随系统 (${resolvedTheme === 'dark' ? '深色' : '浅色'})`
      : theme === 'dark'
      ? '深色模式'
      : '浅色模式';

  const ThemeIcon =
    theme === 'system' ? MonitorIcon : theme === 'dark' ? MoonIcon : SunIcon;

  return (
    <div
      data-slot="nav-user-actions"
      className="flex w-full items-center gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center"
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`帮助与信息 (v${APP_VERSION})`}
              onClick={() => setAboutOpen(true)}
              className="relative text-muted-foreground hover:text-foreground"
            />
          }
        >
          <HelpCircleIcon className="size-[18px]" />
          {hasUpdate && (
            <span
              aria-hidden="true"
              className="absolute right-1 top-1 size-2 rounded-full bg-(--brand-indigo) ring-2 ring-sidebar"
            />
          )}
        </TooltipTrigger>
        <TooltipContent side="top">
          {hasUpdate
            ? `发现新版本 v${updateInfo?.latestVersion} · 点击查看更新 (v${APP_VERSION})`
            : `帮助与关于 nervd (v${APP_VERSION})`}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={themeLabel}
              onClick={(e) => toggleTheme({ clientX: e.clientX, clientY: e.clientY })}
              className="text-muted-foreground hover:text-foreground"
            />
          }
        >
          <ThemeIcon className="size-[18px]" />
        </TooltipTrigger>
        <TooltipContent side="top">当前: {themeLabel} · 点击切换</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="系统设置"
              onClick={() => openSettings()}
              className="text-muted-foreground hover:text-foreground"
            />
          }
        >
          <SettingsIcon className="size-[18px]" />
        </TooltipTrigger>
        <TooltipContent side="top">系统设置 (g s)</TooltipContent>
      </Tooltip>
    </div>
  );
}