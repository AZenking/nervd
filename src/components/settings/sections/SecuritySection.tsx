import { ShieldAlertIcon, ShieldCheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsDraft } from '@/store/settings-draft';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { SettingsGroup, SettingsRow } from '../settings-group';

export function SecuritySection() {
  const draft = useSettingsDraft();

  return (
    <div className="flex flex-col gap-6">
      <SettingsGroup
        title="写操作权限门控"
        description="控制 nervd 是否具备对云效真实资源（代码分支、合并请求、流水线构建等）的写入与触发权限。"
      >
        <SettingsRow
          orientation="horizontal"
          label={(
            <span className="flex items-center gap-2">
              <span>允许写操作</span>
              {draft.draft?.allowWriteOps ? (
                <Badge variant="destructive" className="h-5 px-1.5 text-[11px] font-normal">
                  写操作已开启
                </Badge>
              ) : (
                <Badge variant="secondary" className="h-5 px-1.5 text-[11px] font-normal text-muted-foreground">
                  只读保护中
                </Badge>
              )}
            </span>
          )}
          description="开启后允许在客户端内创建代码分支、发起/合并 MR、触发与重试流水线、回写工作项状态。关闭时所有写操作均在前端置灰并在 Rust 核心层拦截。"
          htmlFor="allow-write-ops"
          control={(
            <Switch
              id="allow-write-ops"
              checked={draft.draft?.allowWriteOps ?? false}
              onCheckedChange={(v) => draft.update({ allowWriteOps: v }, true)}
            />
          )}
        />

        {/* 模式状态提示栏 */}
        <div
          className={cn(
            'flex flex-col gap-2.5 border-t px-4 py-3.5 transition-colors sm:flex-row sm:items-start sm:gap-3',
            draft.draft?.allowWriteOps
              ? 'border-destructive/20 bg-destructive/5 text-destructive-foreground'
              : 'border-border/50 bg-muted/20 text-muted-foreground',
          )}
        >
          {draft.draft?.allowWriteOps ? (
            <ShieldAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          ) : (
            <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
            <span className={cn('font-medium', draft.draft?.allowWriteOps ? 'text-destructive' : 'text-foreground')}>
              {draft.draft?.allowWriteOps ? '注意：写操作已对真实资源生效' : '当前处于只读保护状态'}
            </span>
            <p className="leading-relaxed text-muted-foreground">
              {draft.draft?.allowWriteOps
                ? '客户端内的所有创建分支、合并代码或触发构建操作都将直接同步至云效线上。请确保当前使用的个人访问令牌（PAT）拥有相应仓库及流水线的写权限。'
                : '所有具有破坏性或变更线上数据的操作均已被锁定。你可以安全浏览需求、关联代码与流水线运行日志，不用担心误触或修改云效线上真实资源。'}
            </p>
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup
        title="凭据与安全机制"
        description="nervd 遵循本地最小权限与双重防护设计，保障云效鉴权凭据与系统调用隔离。"
      >
        <SettingsRow
          orientation="horizontal"
          label="本地凭据安全存储"
          description="个人访问令牌（PAT）仅加密保存在 macOS 系统钥匙串（Keychain）中，不以明文落盘，不进行任何远程遥测上报。"
          control={(
            <Badge variant="outline" className="border-border bg-muted/40 font-mono text-[11px] text-muted-foreground">
              macOS Keychain
            </Badge>
          )}
        />
        <SettingsRow
          orientation="horizontal"
          label="核心层双重拦截保护"
          description="当允许写操作未开启时，除了前端界面按钮置灰外，Tauri 后端（Rust IPC 命令层）会统一执行二次门控拦截，双重保障资源安全。"
          control={(
            <Badge variant="outline" className="border-border bg-muted/40 font-mono text-[11px] text-muted-foreground">
              Rust Core Gated
            </Badge>
          )}
        />
      </SettingsGroup>
    </div>
  );
}
