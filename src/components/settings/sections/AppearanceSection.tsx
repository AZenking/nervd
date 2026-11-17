import { MonitorIcon, MoonIcon, SparklesIcon, SunIcon } from 'lucide-react';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Switch } from '@/components/ui/switch';
import { ToggleButton } from '@/components/ui/toggle-button';
import { ToggleButtonGroup } from '@/components/ui/toggle-button-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SettingsGroup, SettingsRow } from '../settings-group';

/**
 * 设置 → 外观与交互（个人偏好）。
 *
 * 只承载本机偏好：明暗主题、需求列表高亮与姓名匹配、快捷键速查入口。
 * 云效账号身份仍在「云效连接」展示，这里不重复凭据配置；所有开关写入本地存储，
 * 不经过设置草稿的持久化通道。
 */
export function AppearanceSection() {
  const { theme, resolvedTheme, setTheme, setShortcutsOpen, openSettings } = useUi();
  const { currentUser, workitemHighlight, setWorkitemHighlight } = useApp();

  // 原生 disabled 会吞掉 hover/focus，导致依赖说明不可达：改用 isDisabled + Tooltip 包裹
  const customNameInput = (
    <Input
      id="custom-match-name"
      isDisabled={!workitemHighlight.enabled}
      value={workitemHighlight.customName ?? ''}
      onChange={(e) => setWorkitemHighlight({ customName: e.target.value })}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.nativeEvent.isComposing) return;
      }}
      placeholder={currentUser?.name ? `默认匹配：${currentUser.name}` : '如：花名 / 别名'}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <SettingsGroup
        title="主题"
        description="选择界面主题模式，支持跟随 macOS 系统外观自动切换；偏好保存在本机。"
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
            <ToggleButtonGroup
              aria-label="明暗主题模式"
              selectionMode="single"
              disallowEmptySelection
              size="sm"
              selectedKeys={new Set([theme])}
            >
              <ToggleButton
                id="system"
                onPress={(e) => setTheme('system', { clientX: e.x, clientY: e.y })}
              >
                <MonitorIcon className="size-3.5" />
                跟随系统
              </ToggleButton>
              <ToggleButton
                id="light"
                onPress={(e) => setTheme('light', { clientX: e.x, clientY: e.y })}
              >
                <SunIcon className="size-3.5" />
                浅色
              </ToggleButton>
              <ToggleButton
                id="dark"
                onPress={(e) => setTheme('dark', { clientX: e.x, clientY: e.y })}
              >
                <MoonIcon className="size-3.5" />
                深色
              </ToggleButton>
            </ToggleButtonGroup>
          )}
        />
      </SettingsGroup>

      <SettingsGroup
        title="需求列表高亮"
        description="基于已保存的访问令牌识别云效用户身份，在迭代工作台列表中突出显示我负责（处理人）与我参与（关联人）的需求。"
      >
        <SettingsRow
          orientation="horizontal"
          label="当前云效身份"
          description={
            currentUser?.name
              ? `${currentUser.name}${currentUser.email ? ` · ${currentUser.email}` : ''}`
              : '尚未识别到云效用户，可先在「云效连接」中保存访问令牌。'
          }
          control={(
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onPress={() => openSettings('connection')}
              className="text-muted-foreground hover:text-foreground"
            >
              管理连接
            </Button>
          )}
        />

        <SettingsRow
          orientation="horizontal"
          label="开启需求列表高亮标记"
          description="在迭代工作台列表中根据当前用户身份视觉突出显示关联与负责的工作项。"
          htmlFor="highlight-enabled"
          control={(
            <Switch
              id="highlight-enabled"
              aria-label="开启需求列表高亮标记"
              size="md"
              isSelected={workitemHighlight.enabled}
              onChange={(checked) => setWorkitemHighlight({ enabled: checked })}
            />
          )}
        />

        <SettingsRow
          orientation="horizontal"
          label={(
            <span className="flex items-center gap-2">
              <span>高亮我负责的需求</span>
              <Chip
                size="sm"
                variant="soft"
                color="accent"
                className="shrink-0 select-none"
              >
                我负责
              </Chip>
            </span>
          )}
          description="当您为需求处理人（Assignee）时，行首显示紫色标记与「我负责」徽标。"
          htmlFor="highlight-assignee"
          control={(
            <Switch
              id="highlight-assignee"
              aria-label="高亮我负责的需求"
              size="md"
              isDisabled={!workitemHighlight.enabled}
              isSelected={workitemHighlight.highlightAssignee}
              onChange={(checked) => setWorkitemHighlight({ highlightAssignee: checked })}
            />
          )}
        />

        <SettingsRow
          orientation="horizontal"
          label={(
            <span className="flex items-center gap-2">
              <span>高亮我参与的需求</span>
              <Chip
                size="sm"
                variant="soft"
                color="warning"
                className="shrink-0 select-none"
              >
                我参与
              </Chip>
            </span>
          )}
          description="当您在需求关联人 / 参与人（Participants）列表中时，行首显示琥珀色标记与「我参与」徽标。"
          htmlFor="highlight-related"
          control={(
            <Switch
              id="highlight-related"
              aria-label="高亮我参与的需求"
              size="md"
              isDisabled={!workitemHighlight.enabled}
              isSelected={workitemHighlight.highlightRelated}
              onChange={(checked) => setWorkitemHighlight({ highlightRelated: checked })}
            />
          )}
        />

        <SettingsRow
          orientation="horizontal"
          controlWidth="w-72"
          label="自定义匹配姓名（可选）"
          description="如果工作项中的处理人显示名与云效账号姓名存在差异或使用花名，可在此指定补充匹配姓名。"
          htmlFor="custom-match-name"
          control={
            workitemHighlight.enabled ? customNameInput : (
              <Tooltip>
                <TooltipTrigger render={<span className="flex w-full cursor-not-allowed" />}>
                  {customNameInput}
                </TooltipTrigger>
                <TooltipContent>
                  需先开启上方「需求列表高亮标记」，才能填写自定义匹配姓名
                </TooltipContent>
              </Tooltip>
            )
          }
        />
      </SettingsGroup>

      <SettingsGroup
        title="键盘与帮助"
        description="nervd 支持全键盘操作，快捷键速查可随时打开。"
      >
        <SettingsRow
          orientation="horizontal"
          label="键盘快捷键速查"
          description="查看 j/k 移动、Enter 检视、x 多选、g 系列单手序列与全局命令快捷键。"
          control={(
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onPress={() => setShortcutsOpen(true)}
              className="gap-1.5"
            >
              <Kbd variant="light">?</Kbd>
              <span>查看速查表</span>
            </Button>
          )}
        />
        <SettingsRow
          orientation="horizontal"
          label="高级偏好入口"
          description="需求拆解偏好与场景提示词已归入「AI 助手」；写权限与凭据保护在「安全与权限」。"
          control={(
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onPress={() => openSettings('ai')}
                className="gap-1 text-muted-foreground hover:text-foreground"
              >
                <SparklesIcon className="size-3.5" />
                AI 助手
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onPress={() => openSettings('security')}
                className="text-muted-foreground hover:text-foreground"
              >
                安全与权限
              </Button>
            </div>
          )}
        />
      </SettingsGroup>
    </div>
  );
}