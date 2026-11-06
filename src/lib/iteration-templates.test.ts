import { describe, it, expect, vi, beforeEach } from 'vitest';

// 在 Tauri invoke 原语层拦截：iteration-templates 的读写最终都落到 api 层的 invoke 调用，
// 拦截 @tauri-apps/api/core 即可让 api 模块保持真实导出（避免大范围 mock api 命名导出破坏 import 链）
const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

import {
  getFusedBranchTemplates,
  migrateIterationTemplatesToDb,
  __resetIterationTemplatesMigrationForTest,
} from './iteration-templates';
import type { BranchRuleTemplate } from '@/types';

const tpl = (id: string, name: string): BranchRuleTemplate => ({
  id,
  name,
  sourceBranch: 'master',
  baselineBranchPattern: `iteration/{iteration}/${id}`,
  workitemBranchPattern: 'feature/{identifier}',
});

describe('getFusedBranchTemplates 融合排序', () => {
  it('迭代专属模板优先于全局模板', () => {
    const fused = getFusedBranchTemplates([tpl('g1', '全局A')], [tpl('i1', '迭代专属')], 'sprint-1');

    expect(fused.map((t) => t.id)).toEqual(['i1', 'g1']);
    expect(fused[0]).toMatchObject({ id: 'i1', scope: 'iteration', iterationId: 'sprint-1' });
    expect(fused[1]).toMatchObject({ id: 'g1', scope: 'global' });
    expect(fused[1].iterationId).toBeUndefined();
  });

  it('同 id 模板去重：迭代专属胜出且只出现一次', () => {
    const shared = tpl('shared', '同名轨道');
    const fused = getFusedBranchTemplates(
      [shared, tpl('g2', '全局B')],
      [{ ...shared, name: '迭代覆盖版' }],
      'sprint-1',
    );

    expect(fused.filter((t) => t.id === 'shared')).toHaveLength(1);
    expect(fused[0]).toMatchObject({ id: 'shared', name: '迭代覆盖版', scope: 'iteration' });
    expect(fused.map((t) => t.id)).toEqual(['shared', 'g2']);
  });

  it('无迭代专属模板时透传全局模板', () => {
    const fused = getFusedBranchTemplates([tpl('g1', '全局A')]);

    expect(fused.map((t) => t.id)).toEqual(['g1']);
    expect(fused.every((t) => t.scope === 'global')).toBe(true);
  });
});

describe('migrateIterationTemplatesToDb 迁移守卫', () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(true);
    __resetIterationTemplatesMigrationForTest();
  });

  it('存在遗留数据时导入 → 写备份键并删除原键，模块级防重入只导入一次', async () => {
    const legacy = { 'sprint-107': [tpl('i1', '迭代专属')] };
    const legacyJson = JSON.stringify(legacy);
    localStorage.setItem('nervd:iteration-branch-templates', legacyJson);

    await migrateIterationTemplatesToDb();

    expect(invokeMock).toHaveBeenCalledWith('import_iteration_tracks', { map: legacy });
    expect(localStorage.getItem('nervd:iteration-branch-templates.bak')).toBe(legacyJson);
    expect(localStorage.getItem('nervd:iteration-branch-templates')).toBeNull();

    // 防重入：守卫命中后再次调用不再触发 IPC
    await migrateIterationTemplatesToDb();
    expect(invokeMock.mock.calls.filter(([cmd]) => cmd === 'import_iteration_tracks')).toHaveLength(1);
  });

  it('导入失败时保留原键，守卫放行下次重试', async () => {
    invokeMock.mockRejectedValue(new Error('db locked'));
    localStorage.setItem('nervd:iteration-branch-templates', JSON.stringify({ 'sprint-107': [tpl('i1', 'x')] }));

    // 失败被内部吞掉（迁移不向上抛，等待下次重试），不写备份不删原键
    await migrateIterationTemplatesToDb();
    expect(localStorage.getItem('nervd:iteration-branch-templates')).not.toBeNull();
    expect(localStorage.getItem('nervd:iteration-branch-templates.bak')).toBeNull();

    // 守卫已放行：下次调用重试并成功
    invokeMock.mockResolvedValue(true);
    await migrateIterationTemplatesToDb();
    expect(localStorage.getItem('nervd:iteration-branch-templates')).toBeNull();
    expect(invokeMock.mock.calls.filter(([cmd]) => cmd === 'import_iteration_tracks')).toHaveLength(2);
  });

  it('空字典不触发导入 IPC，但同样归档备份并删除原键', async () => {
    localStorage.setItem('nervd:iteration-branch-templates', '{}');
    await migrateIterationTemplatesToDb();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('nervd:iteration-branch-templates.bak')).toBe('{}');
    expect(localStorage.getItem('nervd:iteration-branch-templates')).toBeNull();
  });

  it('损坏 JSON 移入备份键后删除原键（不触发导入，避免每次启动空转）', async () => {
    localStorage.setItem('nervd:iteration-branch-templates', '{not-json');

    await migrateIterationTemplatesToDb();

    expect(invokeMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('nervd:iteration-branch-templates.bak')).toBe('{not-json');
    expect(localStorage.getItem('nervd:iteration-branch-templates')).toBeNull();
  });
});
