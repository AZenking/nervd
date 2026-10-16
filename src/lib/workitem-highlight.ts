import type { CurrentYunxiaoUser, WorkitemRow } from './api';

export interface WorkitemHighlightSettings {
  /** 是否开启工作项高亮标记 */
  enabled: boolean;
  /** 是否高亮我负责的需求（处理人） */
  highlightAssignee: boolean;
  /** 是否高亮我参与的需求（关联人 / 参与人） */
  highlightRelated: boolean;
  /** 自定义匹配姓名（为空时自动使用云效账号姓名） */
  customName?: string;
}

export const DEFAULT_HIGHLIGHT_SETTINGS: WorkitemHighlightSettings = {
  enabled: true,
  highlightAssignee: true,
  highlightRelated: true,
  customName: '',
};

const STORAGE_KEY = 'nervd_workitem_highlight';

export function loadHighlightSettings(): WorkitemHighlightSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_HIGHLIGHT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_HIGHLIGHT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_HIGHLIGHT_SETTINGS;
}

export function saveHighlightSettings(settings: WorkitemHighlightSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

export interface WorkitemHighlightMatch {
  /** 是否由我负责（处理人命中） */
  isAssigned: boolean;
  /** 是否由我参与（关联人命中） */
  isRelated: boolean;
  /** 匹配到的有效目标姓名 */
  matchedName: string;
}

/**
 * 判定工作项是否与当前用户关联或由当前用户负责
 */
export function matchWorkitemUser(
  item: WorkitemRow,
  user: CurrentYunxiaoUser | null,
  settings: WorkitemHighlightSettings,
): WorkitemHighlightMatch {
  if (!settings.enabled) {
    return { isAssigned: false, isRelated: false, matchedName: '' };
  }

  const targetName = settings.customName?.trim() || user?.name?.trim() || '';
  const targetId = user?.id?.trim() || '';

  if (!targetName && !targetId) {
    return { isAssigned: false, isRelated: false, matchedName: '' };
  }

  const isAssigned = Boolean(
    settings.highlightAssignee && (
      (targetName && item.assignedTo && item.assignedTo === targetName) ||
      (targetId && item.assignedToId && item.assignedToId === targetId)
    ),
  );

  const isRelated = Boolean(
    settings.highlightRelated && (
      (targetName && item.relatedTo && item.relatedTo.includes(targetName)) ||
      (targetId && item.relatedToIds && item.relatedToIds.includes(targetId))
    ),
  );

  return {
    isAssigned,
    isRelated,
    matchedName: targetName,
  };
}
