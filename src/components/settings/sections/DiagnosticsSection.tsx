import { CopyIcon, ExternalLinkIcon, TerminalIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApp } from '@/store/app';
import { SettingsGroup, SettingsRow } from '../settings-group';
import {
  DOCS_URL,
  REPO_URL,
  copyDiagnosticSnapshot,
  copyQuarantineCommand,
} from '@/lib/app-info';
import { openExternal } from '@/lib/yunxiao-link';

/**
 * 设置 → 诊断与支持（应用）。
 *
 * 从「关于」迁出的排查能力：脱敏诊断快照、macOS 安装放行与外部帮助入口。
 * 这里不承载产品版本与更新检查（仍归「关于 nervd」）。
 */
export function DiagnosticsSection() {
  const { settings } = useApp();
  const allowWriteOps = settings?.allowWriteOps ?? false;

  return (
    <div className="flex flex-col gap-6">
      <SettingsGroup
        title="诊断"
        description="用于 GitHub Issue 报障排查的脱敏快照；复制内容不包含令牌明文。"
      >
        <SettingsRow
          orientation="horizontal"
          label="系统诊断快照"
          description="一键生成并复制脱敏后的系统版本、环境参数与配置状态，便于排查异常。"
          control={(
            <Button
              variant="secondary"
              size="sm"
              onPress={() => void copyDiagnosticSnapshot(settings, allowWriteOps)}
              className="gap-1.5"
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
              variant="secondary"
              size="sm"
              onPress={() => void copyQuarantineCommand()}
              className="gap-1.5"
            >
              <TerminalIcon className="size-3.5 text-muted-foreground" />
              <span>复制放行命令</span>
            </Button>
          )}
        />
      </SettingsGroup>

      <SettingsGroup
        title="帮助与反馈"
        description="遇到问题时优先查看诊断快照，再通过仓库 Issue 或云效平台反馈。"
      >
        <SettingsRow
          orientation="horizontal"
          label="开源仓库与 Issue"
          description="nervd 遵循开源许可协议开发，欢迎提交建议与 Pull Request。"
          control={(
            <Button
              variant="secondary"
              size="sm"
              onPress={() => void openExternal(REPO_URL)}
              className="gap-1.5"
            >
              <span>GitHub</span>
              <ExternalLinkIcon className="size-3" />
            </Button>
          )}
        />
        <SettingsRow
          orientation="horizontal"
          label="云效平台"
          description="访问阿里云云效 DevOps 控制台，核对组织、仓库与流水线配置。"
          control={(
            <Button
              variant="secondary"
              size="sm"
              onPress={() => void openExternal(DOCS_URL)}
              className="gap-1.5"
            >
              <span>打开云效</span>
              <ExternalLinkIcon className="size-3" />
            </Button>
          )}
        />
      </SettingsGroup>
    </div>
  );
}