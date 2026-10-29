import { describe, expect, it } from 'vitest';
import {
  ciStatusInfo,
  ciStatusText,
  isBranchParameterName,
  isEnvironmentParameterName,
  sortJenkinsJobsWithRecommendation,
} from './ci';
import type { JenkinsJobSummary } from '@/types';

describe('ci utilities', () => {
  describe('ciStatusInfo & ciStatusText', () => {
    it('translates English CI status to Chinese enum labels', () => {
      expect(ciStatusText('RUNNING')).toBe('运行中');
      expect(ciStatusText('running')).toBe('运行中');
      expect(ciStatusText('BUILDING')).toBe('构建中');
      expect(ciStatusText('IN_PROGRESS')).toBe('运行中');
      expect(ciStatusText('WAITING')).toBe('等待中');
      expect(ciStatusText('QUEUED')).toBe('排队中');

      expect(ciStatusText('SUCCESS')).toBe('成功');
      expect(ciStatusText('FINISH')).toBe('成功');
      expect(ciStatusText('PASSED')).toBe('成功');

      expect(ciStatusText('FAIL')).toBe('失败');
      expect(ciStatusText('FAILURE')).toBe('失败');
      expect(ciStatusText('FAILED')).toBe('失败');
      expect(ciStatusText('ERROR')).toBe('失败');
      expect(ciStatusText('UNSTABLE')).toBe('不稳定');
      expect(ciStatusText('TIMEOUT')).toBe('超时');

      expect(ciStatusText('ABORTED')).toBe('已中止');
      expect(ciStatusText('CANCELED')).toBe('已取消');
      expect(ciStatusText('CANCELLED')).toBe('已取消');
    });

    it('falls back correctly when status is empty or loading/error', () => {
      expect(ciStatusText(null, { loading: true })).toBe('加载中');
      expect(ciStatusText(undefined, { error: '查询失败 500' })).toBe('查询失败');
      expect(ciStatusText(null, null)).toBe('—');
      expect(ciStatusText('', null)).toBe('—');
      expect(ciStatusText('—', null)).toBe('—');
    });

    it('maps tones accurately for status badges and spinners', () => {
      expect(ciStatusInfo('RUNNING').tone).toBe('run');
      expect(ciStatusInfo('BUILDING').tone).toBe('run');
      expect(ciStatusInfo('WAITING').tone).toBe('run');

      expect(ciStatusInfo('SUCCESS').tone).toBe('ok');

      expect(ciStatusInfo('FAILURE').tone).toBe('fail');
      expect(ciStatusInfo('UNSTABLE').tone).toBe('fail');
      expect(ciStatusInfo('TIMEOUT').tone).toBe('fail');

      expect(ciStatusInfo('ABORTED').tone).toBe('idle');
      expect(ciStatusInfo('CANCELED').tone).toBe('idle');
    });

    it('handles already translated Chinese status gracefully', () => {
      expect(ciStatusInfo('运行中')).toEqual({ label: '运行中', tone: 'run' });
      expect(ciStatusInfo('成功')).toEqual({ label: '成功', tone: 'ok' });
      expect(ciStatusInfo('构建失败')).toEqual({ label: '构建失败', tone: 'fail' });
    });
  });

  describe('parameter name inference', () => {
    it('identifies branch parameter names correctly', () => {
      expect(isBranchParameterName('branch')).toBe(true);
      expect(isBranchParameterName('git_branch')).toBe(true);
      expect(isBranchParameterName('BRANCH_NAME')).toBe(true);
      expect(isBranchParameterName('target_branch')).toBe(true);
      expect(isBranchParameterName('env')).toBe(false);
    });

    it('identifies environment parameter names correctly', () => {
      expect(isEnvironmentParameterName('env')).toBe(true);
      expect(isEnvironmentParameterName('deploy_env')).toBe(true);
      expect(isEnvironmentParameterName('TARGET_ENVIRONMENT')).toBe(true);
      expect(isEnvironmentParameterName('git_branch')).toBe(false);
    });
  });

  describe('sortJenkinsJobsWithRecommendation', () => {
    const mockJobs: JenkinsJobSummary[] = [
      { name: 'account-book-shop-fed-lib', fullName: 'account-book-shop-fed-lib' },
      { name: 'achievement-coverage-pipeline', fullName: 'achievement-coverage-pipeline' },
      { name: 'foton-mobile-view-sit-fed-isd', fullName: 'foton-mobile-view-sit-fed-isd' },
      { name: 'foton-mobile-view-sst-fed-isd', fullName: 'foton-mobile-view-sst-fed-isd' },
      { name: 'foton-mobile-view-prod-fed-isd', fullName: 'foton-mobile-view-prod-fed-isd' },
      { name: 'other-unrelated-pipeline', fullName: 'other-unrelated-pipeline' },
    ];

    it('places matching repository jobs at the top with isRecommended=true', () => {
      const sorted = sortJenkinsJobsWithRecommendation(mockJobs, 'mobile-view');

      // First 3 items should be the mobile-view jobs
      expect(sorted[0]?.fullName).toBe('foton-mobile-view-prod-fed-isd');
      expect(sorted[0]?.isRecommended).toBe(true);
      expect(sorted[1]?.fullName).toBe('foton-mobile-view-sit-fed-isd');
      expect(sorted[1]?.isRecommended).toBe(true);
      expect(sorted[2]?.fullName).toBe('foton-mobile-view-sst-fed-isd');
      expect(sorted[2]?.isRecommended).toBe(true);

      // Remaining items follow alphabetically
      expect(sorted[3]?.fullName).toBe('account-book-shop-fed-lib');
      expect(sorted[3]?.isRecommended).toBe(false);
      expect(sorted[4]?.fullName).toBe('achievement-coverage-pipeline');
      expect(sorted[4]?.isRecommended).toBe(false);
      expect(sorted[5]?.fullName).toBe('other-unrelated-pipeline');
      expect(sorted[5]?.isRecommended).toBe(false);
    });

    it('places previously saved job at highest priority (score=100) with isSaved=true', () => {
      const sorted = sortJenkinsJobsWithRecommendation(
        mockJobs,
        'mobile-view',
        'foton-mobile-view-sst-fed-isd',
      );

      // foton-mobile-view-sst-fed-isd was saved, so it must be first
      expect(sorted[0]?.fullName).toBe('foton-mobile-view-sst-fed-isd');
      expect(sorted[0]?.isSaved).toBe(true);
      expect(sorted[0]?.isRecommended).toBe(true);

      // Other mobile-view jobs come next
      expect(sorted[1]?.fullName).toBe('foton-mobile-view-prod-fed-isd');
      expect(sorted[1]?.isSaved).toBe(false);
      expect(sorted[1]?.isRecommended).toBe(true);

      expect(sorted[2]?.fullName).toBe('foton-mobile-view-sit-fed-isd');
      expect(sorted[2]?.isSaved).toBe(false);
      expect(sorted[2]?.isRecommended).toBe(true);
    });

    it('handles repository paths with namespace (e.g. group/repo)', () => {
      const sorted = sortJenkinsJobsWithRecommendation(mockJobs, 'fed-group/mobile-view');
      expect(sorted[0]?.isRecommended).toBe(true);
      expect(sorted[0]?.fullName).toContain('mobile-view');
    });

    it('matches normalized names and word tokens', () => {
      const jobsWithVariations: JenkinsJobSummary[] = [
        { name: 'unrelated', fullName: 'unrelated-job' },
        { name: 'foton_mobileview_pipeline', fullName: 'foton_mobileview_pipeline' },
      ];
      const sorted = sortJenkinsJobsWithRecommendation(jobsWithVariations, 'mobile-view');
      expect(sorted[0]?.fullName).toBe('foton_mobileview_pipeline');
      expect(sorted[0]?.isRecommended).toBe(true);
    });

    it('handles empty jobs gracefully', () => {
      const sorted = sortJenkinsJobsWithRecommendation([], 'mobile-view');
      expect(sorted).toEqual([]);
    });
  });
});
