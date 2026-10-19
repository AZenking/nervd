import { toast } from '@/components/ui/toast';
import type { Settings, SettingsView } from '@/types';

export const APP_NAME = 'nervd';
export const APP_VERSION = '0.2.2';
export const APP_TAGLINE = '以云效需求为核心维度的一站式 CI/CD 桌面工作台';
export const APP_BUILD_CHANNEL = 'Stable (Universal)';
export const REPO_URL = 'https://github.com/AZenking/nervd';
export const DOCS_URL = 'https://devops.aliyun.com';

/** 生成客户端诊断快照文本（用于报障排查与 Issue 提单） */
export function generateDiagnosticSnapshot(
  settings: Settings | SettingsView | null,
  allowWriteOps: boolean,
): string {
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';
  const orgId = settings?.organizationId ? `${settings.organizationId.slice(0, 8)}***` : '未绑定';
  const space = settings?.defaultSpaceIdentifier || '未配置';
  const reposCount = settings?.watchedRepos?.length ?? 0;
  const jenkinsCount = settings?.jenkinsConnections?.length ?? 0;
  const hasPat = settings && 'hasPat' in settings ? settings.hasPat : Boolean(settings?.organizationId);

  return [
    `# nervd 诊断快照 (Diagnostic Report)`,
    `- 应用版本 (Version): v${APP_VERSION} (${APP_BUILD_CHANNEL})`,
    `- 运行时环境 (Runtime): ${isTauri ? 'Tauri 2 (macOS Native)' : 'Browser Preview Mode'}`,
    `- 用户代理 (UserAgent): ${userAgent}`,
    `- 写操作模式 (WriteOps): ${allowWriteOps ? '已开启 (Write Enabled)' : '只读保护 (Read-Only Protected)'}`,
    `- 钥匙串凭据 (Keychain): ${hasPat ? '已安全存储 (PAT Configured)' : '未配置 (Missing PAT)'}`,
    `- 云效组织 (Organization): ${orgId}`,
    `- 默认空间 (Default Space): ${space}`,
    `- 追溯仓库数 (Watched Repos): ${reposCount}`,
    `- Jenkins 实例 (Jenkins Instances): ${jenkinsCount}`,
    `- 报告时间 (Generated At): ${new Date().toISOString()}`,
  ].join('\n');
}

/** 拷贝诊断信息并给出 Toast 反馈 */
export async function copyDiagnosticSnapshot(
  settings: Settings | SettingsView | null,
  allowWriteOps: boolean,
): Promise<boolean> {
  const text = generateDiagnosticSnapshot(settings, allowWriteOps);
  try {
    await navigator.clipboard.writeText(text);
    toast.add({
      title: '诊断快照已复制到剪贴板',
      description: '已脱敏敏感字段，可直接粘贴至 GitHub Issue 或技术支持沟通',
      type: 'success',
    });
    return true;
  } catch {
    // 降级使用 textarea
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      if (ok) {
        toast.add({
          title: '诊断快照已复制到剪贴板',
          type: 'success',
        });
        return true;
      }
    } catch {}
    toast.add({
      title: '复制诊断信息失败',
      description: '请检查浏览器或系统剪贴板权限',
      type: 'error',
    });
    return false;
  }
}

/** 拷贝 macOS Gatekeeper 隔离放行命令 */
export async function copyQuarantineCommand(): Promise<boolean> {
  const cmd = 'xattr -cr /Applications/nervd.app';
  try {
    await navigator.clipboard.writeText(cmd);
    toast.add({
      title: '放行命令已复制到剪贴板',
      description: '在终端执行以解除 macOS Gatekeeper 拦截: xattr -cr /Applications/nervd.app',
      type: 'success',
    });
    return true;
  } catch {
    toast.add({
      title: '复制失败',
      description: '请手动复制: xattr -cr /Applications/nervd.app',
      type: 'error',
    });
    return false;
  }
}

