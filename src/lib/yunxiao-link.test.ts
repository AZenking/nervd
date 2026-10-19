import { describe, it, expect } from 'vitest';
import { buildCodeupMergeRequestUrl, buildYunxiaoWorkitemUrl } from './yunxiao-link';

describe('buildCodeupMergeRequestUrl', () => {
  it('优先使用 API 返回的真实合法 webUrl', () => {
    const url = buildCodeupMergeRequestUrl({
      webUrl: 'https://codeup.aliyun.com/custom-team/custom-repo/change/42',
      organizationId: '60de7a6852743a5162b5f957',
      repoPathWithNamespace: '60de7a6852743a5162b5f957/custom-repo',
      repoId: 101,
      localId: 42,
    });
    expect(url).toBe('https://codeup.aliyun.com/custom-team/custom-repo/change/42');
  });

  it('当 pathWithNamespace 已包含 organizationId 时，不会重复拼接组织 ID 且使用 /change/:id', () => {
    const url = buildCodeupMergeRequestUrl({
      organizationId: '60de7a6852743a5162b5f957',
      repoPathWithNamespace: '60de7a6852743a5162b5f957/nervd-web',
      repoId: 101,
      localId: 218,
    });
    // 之前错误地生成了 60de7a.../60de7a.../nervd-web/merge_requests/218，导致 404
    expect(url).toBe('https://codeup.aliyun.com/60de7a6852743a5162b5f957/nervd-web/change/218');
  });

  it('当 pathWithNamespace 包含多级命名空间路径时直接映射并加 /change/:id', () => {
    const url = buildCodeupMergeRequestUrl({
      organizationId: '60de7a6852743a5162b5f957',
      repoPathWithNamespace: 'org-slug/team-backend/service-auth',
      localId: 15,
    });
    expect(url).toBe('https://codeup.aliyun.com/org-slug/team-backend/service-auth/change/15');
  });

  it('当 pathWithNamespace 只有单层且存在 organizationId 时，前置补充组织前缀', () => {
    const url = buildCodeupMergeRequestUrl({
      organizationId: '60de7a6852743a5162b5f957',
      repoPathWithNamespace: 'standalone-repo',
      localId: 8,
    });
    expect(url).toBe('https://codeup.aliyun.com/60de7a6852743a5162b5f957/standalone-repo/change/8');
  });

  it('安全清理首尾斜杠与空白字符', () => {
    const url = buildCodeupMergeRequestUrl({
      organizationId: '  /60de7a6852743a5162b5f957/  ',
      repoPathWithNamespace: ' /60de7a6852743a5162b5f957/nervd-web/ ',
      localId: 99,
    });
    expect(url).toBe('https://codeup.aliyun.com/60de7a6852743a5162b5f957/nervd-web/change/99');
  });

  it('缺失 pathWithNamespace 仅有 repoId 时的兜底路由', () => {
    const url = buildCodeupMergeRequestUrl({
      organizationId: '60de7a6852743a5162b5f957',
      repoId: 101,
      localId: 1,
    });
    expect(url).toBe('https://codeup.aliyun.com/60de7a6852743a5162b5f957/101/change/1');
  });

  it('若 webUrl 传入的是仓库根路径，自动补全 /change/:id', () => {
    const url = buildCodeupMergeRequestUrl({
      webUrl: 'https://codeup.aliyun.com/f6car/F6-saas-independence/foton-workspace/foton-fed/mobile-view',
      localId: 481,
    });
    expect(url).toBe('https://codeup.aliyun.com/f6car/F6-saas-independence/foton-workspace/foton-fed/mobile-view/change/481');
  });
});

describe('buildYunxiaoWorkitemUrl', () => {
  it('生成 Projex 工作项独立详情页路由', () => {
    const url = buildYunxiaoWorkitemUrl({
      spaceIdentifier: 'space-alpha',
      workitemId: 'uuid-1234',
      organizationId: 'org-666',
    });
    expect(url).toBe('https://devops.aliyun.com/projex/project/space-alpha/workitem/uuid-1234?organizationId=org-666');
  });
});
