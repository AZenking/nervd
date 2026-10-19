import { openUrl } from '@tauri-apps/plugin-opener';
import { toast } from '@/components/ui/toast';

export interface YunxiaoUrlParams {
  workitemId?: string | null;
  spaceIdentifier?: string | null;
  category?: string | null;
  organizationId?: string | null;
}

/**
 * 构造阿里云效 Projex 对应工作项或项目空间的直达 Web 链接
 */
export function buildYunxiaoWorkitemUrl({
  workitemId,
  spaceIdentifier,
  category,
  organizationId,
}: YunxiaoUrlParams): string {
  const cleanSpace = spaceIdentifier?.trim();
  const cleanId = workitemId?.trim();
  const cleanOrg = organizationId?.trim();


  if (cleanSpace && cleanId) {
    // Projex 工作项独立详情页路由（直达该工作项完整详情页面，非列表页）
    const orgParam = cleanOrg ? `?organizationId=${encodeURIComponent(cleanOrg)}` : '';
    return `https://devops.aliyun.com/projex/project/${encodeURIComponent(cleanSpace)}/workitem/${encodeURIComponent(cleanId)}${orgParam}`;
  }
  if (cleanId) {
    // 缺失项目空间时，使用云效全局工作项详情直达
    const orgParam = cleanOrg ? `?organizationId=${encodeURIComponent(cleanOrg)}` : '';
    return `https://devops.aliyun.com/projex/workitem/${encodeURIComponent(cleanId)}${orgParam}`;
  }
  if (cleanSpace) {
    const cat = category?.trim().toLowerCase();
    const catPath = cat === 'bug' ? '/bug' : cat === 'task' ? '/task' : cat === 'req' ? '/req' : '';
    return `https://devops.aliyun.com/projex/project/${encodeURIComponent(cleanSpace)}${catPath}`;
  }
  if (cleanOrg) {
    return `https://devops.aliyun.com/organization/${encodeURIComponent(cleanOrg)}`;
  }
  return 'https://devops.aliyun.com';
}

/**
 * 构造阿里云效 Codeup 合并请求 (Merge Request / Change Request) Web 直达链接
 */
export function buildCodeupMergeRequestUrl({
  webUrl,
  organizationId,
  repoPathWithNamespace,
  repoId,
  localId,
}: {
  webUrl?: string | null;
  organizationId?: string | null;
  repoPathWithNamespace?: string | null;
  repoId?: number | null;
  localId: number;
}): string {
  // 1. 若接口或数据源已提供合法的 Web 直达链接，优先使用
  if (webUrl && typeof webUrl === 'string' && /^https?:\/\//i.test(webUrl.trim())) {
    return webUrl.trim();
  }

  const cleanOrg = organizationId?.trim().replace(/^\/+|\/+$/g, '') || '';
  const cleanPath = repoPathWithNamespace?.trim().replace(/^\/+|\/+$/g, '') || '';

  // 2. 存在代码库路径时，规范化路径并拼装 Codeup Web 评审详情路由 (/change/:id)
  if (cleanPath) {
    let fullRepoPath = cleanPath;
    if (cleanOrg) {
      if (cleanPath === cleanOrg || cleanPath.toLowerCase().startsWith(cleanOrg.toLowerCase() + '/')) {
        fullRepoPath = cleanPath;
      } else if (!cleanPath.includes('/')) {
        fullRepoPath = `${cleanOrg}/${cleanPath}`;
      }
    }
    return `https://codeup.aliyun.com/${fullRepoPath}/change/${localId}`;
  }

  // 3. 兜底策略：只有组织 ID 与 repoId
  if (cleanOrg && repoId) {
    return `https://codeup.aliyun.com/${cleanOrg}/${repoId}/change/${localId}`;
  }

  if (cleanOrg) {
    return `https://codeup.aliyun.com/${cleanOrg}`;
  }

  return 'https://codeup.aliyun.com';
}

/**
 * 在系统默认浏览器中打开外部链接
 * 优先经 Tauri plugin-opener 打开系统浏览器；降级/浏览器预览模式下使用 window.open
 */
export async function openExternal(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) return;

  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  if (isTauri) {
    try {
      await openUrl(trimmed);
      return;
    } catch (err) {
      console.warn('openUrl via plugin-opener failed, falling back to window.open:', err);
    }
  }

  try {
    const opened = window.open(trimmed, '_blank', 'noopener,noreferrer');
    if (!opened && typeof window !== 'undefined') {
      toast.add({
        title: '打开链接被拦截',
        description: '请允许浏览器弹出新窗口，或检查默认浏览器设置',
        type: 'error',
      });
    }
  } catch (err) {
    toast.add({
      title: '打开链接失败',
      description: String(err),
      type: 'error',
    });
  }
}

/**
 * 快捷跳转至云效对应工作项或项目空间
 */
export async function openWorkitemInYunxiao(params: YunxiaoUrlParams): Promise<void> {
  const url = buildYunxiaoWorkitemUrl(params);
  await openExternal(url);
}
