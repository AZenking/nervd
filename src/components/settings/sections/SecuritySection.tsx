import { useState } from 'react';
import { useSettingsDraft } from '@/store/settings-draft';
import { Alert, Chip } from '@heroui/react';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SettingsGroup, SettingsRow } from '../settings-group';

export function SecuritySection() {
  const draft = useSettingsDraft();
  const [confirmEnable, setConfirmEnable] = useState(false);

  const enabled = draft.draft?.allowWriteOps ?? false;

  const applyWriteOps = (value: boolean) => {
    draft.update({ allowWriteOps: value }, true);
  };

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
              {enabled ? (
                <Chip size="sm" color="danger" variant="soft">
                  写操作已开启
                </Chip>
              ) : (
                <Chip size="sm" variant="soft">只读保护中</Chip>
              )}
            </span>
          )}
          description="开启后允许在客户端内创建代码分支、发起/合并 MR、触发与重试流水线、回写工作项状态。关闭时所有写操作均在前端置灰并在 Rust 核心层拦截。"
          htmlFor="allow-write-ops"
          control={(
            <Switch
              id="allow-write-ops"
              aria-label="允许写操作"
              size="md"
              isSelected={enabled}
              onChange={(v) => {
                // 关闭是收窄权限，直接生效；开启会扩大权限到真实资源，必须复述影响范围后确认。
                if (v) setConfirmEnable(true);
                else applyWriteOps(false);
              }}
            />
          )}
        />

        {/* 模式状态提示栏（HeroUI Alert 标准槽位：Indicator + Title/Description） */}
        <Alert status={enabled ? 'danger' : 'success'}>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              {enabled ? '注意：写操作已对真实资源生效' : '当前处于只读保护状态'}
            </Alert.Title>
            <Alert.Description>
              {enabled
                ? '客户端内的所有创建分支、合并代码或触发构建操作都将直接同步至云效线上。请确保当前使用的个人访问令牌（PAT）拥有相应仓库及流水线的写权限。'
                : '所有具有破坏性或变更线上数据的操作均已被锁定。你可以安全浏览需求、关联代码与流水线运行日志，不用担心误触或修改云效线上真实资源。'}
            </Alert.Description>
          </Alert.Content>
        </Alert>
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
            <Chip size="sm" variant="soft" color="success" className="font-mono">
              macOS Keychain
            </Chip>
          )}
        />
        <SettingsRow
          orientation="horizontal"
          label="核心层双重拦截保护"
          description="当允许写操作未开启时，除了前端界面按钮置灰外，Tauri 后端（Rust IPC 命令层）会统一执行二次门控拦截，双重保障资源安全。"
          control={(
            <Chip size="sm" variant="soft" color="success" className="font-mono">
              Rust Core Gated
            </Chip>
          )}
        />
      </SettingsGroup>

      <AlertDialog open={confirmEnable} onOpenChange={setConfirmEnable}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>开启写操作权限？</AlertDialogTitle>
            <AlertDialogDescription>
              开启后，以下操作将对云效真实资源直接生效：创建 / 合并代码分支与 MR、触发与重试流水线构建、回写工作项状态与评论。
              前端会解除灰阶门控，仅保留 Rust Core 的 allowWriteOps 二次校验。请确认当前个人访问令牌（PAT）具备对应仓库与流水线的写权限。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>保持只读</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onPress={() => {
                applyWriteOps(true);
                setConfirmEnable(false);
              }}
            >
              确认开启写操作
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}