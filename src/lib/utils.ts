import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 文件系统路径的紧凑展示：只保留末 N 段，前面用 `…/` 省略。
 *
 * 用于「同名仓库克隆到不同父目录」的场景（如 chery/maintain-view 与
 * foton/maintain-view 都在本机叫 maintain-view），完整路径靠 title 兜底。
 */
export function compactFsPath(path: string, segments = 2): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= segments) return path;
  return `…/${parts.slice(-segments).join('/')}`;
}
