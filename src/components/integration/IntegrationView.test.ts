import { describe, expect, it } from 'vitest';
import type { BranchInfo } from '@/types';
import {
  deriveInitialBranchRow,
  matchPatterns,
  type ComparisonCacheEntry,
} from './IntegrationView';

describe('IntegrationView 性能与算法核心逻辑测试', () => {
  describe('matchPatterns (通配匹配模式)', () => {
    it('支持 * 通配匹配 release/* integration/* temp/* hotfix/*', () => {
      const patterns = 'release/* integration/* temp/* hotfix/*';

      expect(matchPatterns('release/2026.10', patterns)).toBe(true);
      expect(matchPatterns('integration/login-fix', patterns)).toBe(true);
      expect(matchPatterns('temp/test-branch', patterns)).toBe(true);
      expect(matchPatterns('hotfix/bug-123', patterns)).toBe(true);

      // 非匹配分支
      expect(matchPatterns('feature/user-profile', patterns)).toBe(false);
      expect(matchPatterns('dev', patterns)).toBe(false);
      expect(matchPatterns('master', patterns)).toBe(false);
    });

    it('空模式应允许匹配任意分支', () => {
      expect(matchPatterns('feature/test', '')).toBe(true);
      expect(matchPatterns('feature/test', '   ')).toBe(true);
    });

    it('多连续空格与首尾空格能正确解析', () => {
      expect(matchPatterns('release/v1.0', '   release/*    hotfix/*   ')).toBe(true);
      expect(matchPatterns('dev', '   release/*    hotfix/*   ')).toBe(false);
    });
  });

  describe('deriveInitialBranchRow (Fast-Path 与渐进比对推导)', () => {
    const linkPattern = '(?:REQ|BUG|TASK)[-_]?(\\d+)';

    const mockBaseBranch: BranchInfo = {
      name: 'master',
      commit: {
        id: 'sha-base-123456',
        message: 'chore: merge release\n\nbody message',
        committedDate: '2026-10-25T10:00:00Z',
      },
    };

    it('基准分支自身应直接判定落差为 0，无需异步比对', () => {
      const row = deriveInitialBranchRow(
        mockBaseBranch,
        'master',
        'sha-base-123456',
        linkPattern,
      );

      expect(row.name).toBe('master');
      expect(row.ahead).toBe(0);
      expect(row.behind).toBe(0);
      expect(row.comparing).toBe(false);
      expect(row.commitMessage).toBe('chore: merge release');
    });

    it('Fast-Path: 与基准分支最新 Commit SHA 完全相同的集成分支，直接判定落差为 0，省去 2 次网络请求', () => {
      const sameShaReleaseBranch: BranchInfo = {
        name: 'release/REQ-101-v1.0',
        commit: {
          id: 'sha-base-123456', // 与 base 相同的 commit id
          message: 'feat(REQ-101): user login implementation',
          committedDate: '2026-10-25T10:00:00Z',
        },
      };

      const row = deriveInitialBranchRow(
        sameShaReleaseBranch,
        'master',
        'sha-base-123456',
        linkPattern,
      );

      expect(row.ahead).toBe(0);
      expect(row.behind).toBe(0);
      expect(row.comparing).toBe(false);
      expect(row.keys).toContain('101');
    });

    it('Cache 命中: 若缓存存在且两端 Head SHA 均未变，直接复用缓存结果', () => {
      const cachedBranch: BranchInfo = {
        name: 'release/REQ-202-cached',
        commit: {
          id: 'sha-branch-789',
          message: 'fix(REQ-202): resolved issue',
          committedDate: '2026-10-24T08:00:00Z',
        },
      };

      const cachedEntry: ComparisonCacheEntry = {
        baseSha: 'sha-base-123456',
        branchSha: 'sha-branch-789',
        ahead: 3,
        behind: 1,
      };

      const row = deriveInitialBranchRow(
        cachedBranch,
        'master',
        'sha-base-123456',
        linkPattern,
        cachedEntry,
      );

      expect(row.ahead).toBe(3);
      expect(row.behind).toBe(1);
      expect(row.comparing).toBe(false);
      expect(row.keys).toContain('202');
    });

    it('Cache 失效: 若 Commit SHA 发生改变，重新标记 comparing=true 进行异步后台比对', () => {
      const staleBranch: BranchInfo = {
        name: 'release/stale',
        commit: {
          id: 'sha-new-branch-999', // 新 commit
          message: 'new commits pushed',
          committedDate: '2026-10-26T12:00:00Z',
        },
      };

      const staleCache: ComparisonCacheEntry = {
        baseSha: 'sha-base-123456',
        branchSha: 'sha-old-branch-000', // 旧 SHA
        ahead: 2,
        behind: 0,
      };

      const row = deriveInitialBranchRow(
        staleBranch,
        'master',
        'sha-base-123456',
        linkPattern,
        staleCache,
      );

      expect(row.ahead).toBeNull();
      expect(row.behind).toBeNull();
      expect(row.comparing).toBe(true);
    });

    it('未缓存且 SHA 不同的分支，首屏先返回基本信息并标记 comparing=true', () => {
      const newBranch: BranchInfo = {
        name: 'hotfix/BUG-999-crash',
        commit: {
          id: 'sha-bug-111',
          message: 'fix(BUG-999): crash on startup\nextra line',
          committedDate: '2026-10-27T01:00:00Z',
        },
      };

      const row = deriveInitialBranchRow(
        newBranch,
        'master',
        'sha-base-123456',
        linkPattern,
      );

      expect(row.name).toBe('hotfix/BUG-999-crash');
      expect(row.commitMessage).toBe('fix(BUG-999): crash on startup');
      expect(row.keys).toContain('999');
      expect(row.ahead).toBeNull();
      expect(row.behind).toBeNull();
      expect(row.comparing).toBe(true);
    });
  });
});
