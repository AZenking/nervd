// 预览专用 api mock：与 src/lib/api.ts 同签名，返回静态演示数据。
// 仅被 preview/vite.config.mjs 通过 alias 注入，不参与生产构建。
import type {
  JenkinsConnection, OrgSummary, RepoCiSnapshot, Settings, SettingsView,
  WorkitemPage,
} from '../src/types';
import type { WorkitemRow, WorkitemStatusOption } from '../src/lib/api';

export type { WorkitemRow, WorkitemStatusOption };

const settings: SettingsView = {
  hasPat: true,
  organizationId: '60de7a689d5e4ab8b7be0c25',
  defaultSpaceIdentifier: 'a1b2c3d4e5f60718',
  linkPattern: '(?:REQ|BUG|TASK)[-_]?(\\d+)',
  watchedRepos: [101, 102],
  allowWriteOps: false,
  workitemRepos: {},
  jenkinsConnections: [
    { id: 'jenkins-1', name: '研发 Jenkins', baseUrl: 'https://jenkins.example.com', username: 'charles', hasToken: true },
  ],
  repoCiBindings: {
    '101': { provider: 'jenkins', connectionId: 'jenkins-1', jobFullName: 'frontend/build-and-deploy' },
    '102': { provider: 'flow', pipelineId: 9021, pipelineName: 'nervd-core-build' },
  },
};

const items: WorkitemRow[] = [
  { identifier: 'REQ-2048', workitemId: 'wi-2048', subject: '支持需求链路一键回溯', status: '开发中', category: 'Req', assignedTo: '林默', spaceName: '平台工程', updatedAt: '2026-10-08 15:42' },
  { identifier: 'REQ-2039', workitemId: 'wi-2039', subject: '总览页增加仓库健康度', status: '待评审', category: 'Req', assignedTo: '周荻', spaceName: '平台工程', updatedAt: '2026-10-07 11:08' },
  { identifier: 'REQ-2051', workitemId: 'wi-2051', subject: '流水线通知接入系统通知中心', status: '开发中', category: 'Req', assignedTo: '陈序', spaceName: '平台工程', updatedAt: '2026-10-06 09:30' },
];

const repositories = [
  { id: 101, name: 'nervd-web', pathWithNamespace: 'codeup/nervd-web', lastActivityAt: '2026-10-08T14:00:00Z' },
  { id: 102, name: 'nervd-core', pathWithNamespace: 'codeup/nervd-core', lastActivityAt: '2026-10-08T12:20:00Z' },
  { id: 103, name: 'nervd-docs', pathWithNamespace: 'docs/nervd-docs', lastActivityAt: '2026-10-05T08:00:00Z' },
];

const ciSnapshots: Record<number, RepoCiSnapshot> = {
  101: { provider: 'jenkins', name: 'frontend/build-and-deploy', status: 'SUCCESS', runs: [
    { runId: '1842', status: 'SUCCESS', startTime: Date.now() - 3600e3, durationMs: 258e3, trigger: 'charles' },
    { runId: '1841', status: 'FAIL', startTime: Date.now() - 7200e3, durationMs: 96e3 },
  ] },
  102: { provider: 'flow', name: 'nervd-core-build', status: 'RUNNING', runs: [
    { runId: '76', status: 'RUNNING', startTime: Date.now() - 300e3 },
  ] },
  103: { provider: 'flow', name: 'docs-deploy', runs: [] },
};

const pipelines = [
  { pipelineId: 9021, pipelineName: 'nervd-core-build', status: 'RUNNING', updateTime: '2026-10-08 16:00' },
  { pipelineId: 9022, pipelineName: 'nervd-web-release', status: 'SUCCESS', updateTime: '2026-10-08 10:12' },
  { pipelineId: 9023, pipelineName: 'regression-test', status: 'FAIL', updateTime: '2026-10-07 22:40' },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getSettings(): Promise<SettingsView> { return { ...settings }; }
export async function saveSettings(s: Settings): Promise<SettingsView> { Object.assign(settings, s); return { ...settings }; }
export async function saveWorkitemRepos(workitemId: string, repoIds: number[] | null): Promise<SettingsView> {
  if (repoIds == null) delete settings.workitemRepos[workitemId];
  else settings.workitemRepos[workitemId] = repoIds;
  return { ...settings };
}
export async function savePat(): Promise<boolean> { return true; }
export async function deletePat(): Promise<boolean> { return true; }
export async function checkConnection(): Promise<OrgSummary[]> {
  await sleep(300);
  return [{ organizationId: settings.organizationId, organizationName: '演示组织' }];
}
export async function listProjects(): Promise<{ id: string; name: string }[]> {
  return [{ id: settings.defaultSpaceIdentifier, name: '平台工程' }];
}
export async function listWorkitems(): Promise<WorkitemPage> { return { items, nextToken: null }; }
export async function getWorkitem(workitemId: string): Promise<Record<string, unknown>> {
  const cur = items.find((i) => i.workitemId === workitemId);
  return { workitem: { subject: cur?.subject, status: cur?.status, description: { raw_text: '让“需求 → 分支 → 提交 → MR → 流水线”在一个工作面内可解释、可操作。当前需求正在整理追溯链路展示。' } } };
}
export async function listWorkitemComments(): Promise<Record<string, unknown>> {
  return [{ author: { name: '周荻' }, createdAt: '2026-10-08 10:22', content: '追溯面板的 CI 状态建议加环境维度。' }] as unknown as Record<string, unknown>;
}
export async function updateWorkitemStatus(): Promise<unknown> { return null; }
export async function listWorkitemStatus(): Promise<WorkitemStatusOption[]> {
  return [
    { identifier: 'dev', name: '开发中', stageName: '进行中' },
    { identifier: 'review', name: '待评审', stageName: '进行中' },
    { identifier: 'done', name: '已完成', stageName: '已完成' },
  ];
}
export async function proxyWorkitemFile(): Promise<string> { throw new Error('preview 无附件代理'); }
export async function listRepos(): Promise<typeof repositories> { return repositories; }
export async function saveJenkinsToken(): Promise<boolean> { return true; }
export async function deleteJenkinsToken(): Promise<boolean> { return true; }
export async function testJenkinsConnection(c: JenkinsConnection): Promise<string> {
  await sleep(600);
  return `连接正常：${c.baseUrl}（mock）`;
}
export async function getJenkinsJob(_connectionId: string, jobFullName: string) {
  await sleep(400);
  return { fullName: jobFullName, color: 'blue' };
}
export async function getRepoCiSnapshot(repoId: number): Promise<RepoCiSnapshot> {
  await sleep(250);
  return ciSnapshots[repoId] ?? { provider: 'flow', name: '—', runs: [] };
}
export async function triggerRepoCi(): Promise<unknown> { await sleep(500); return null; }
export async function getRepoCiLogs(repoId: number, runId: string): Promise<string> {
  await sleep(300);
  return Array.from({ length: 24 }, (_, i) => `[mock] ${repoId}/${runId} step ${i + 1} … ok`).join('\n');
}
export async function listBranches(repoId: number): Promise<Record<string, unknown>> {
  if (repoId === 101) return { result: [
    { name: 'feature/REQ-2048-trace', commit: { id: 'ab12cd3', message: 'feat: trace panel' } },
    { name: 'master', commit: { id: '0000000' } },
  ] };
  if (repoId === 102) return { result: [{ name: 'feature/REQ-2048-core', commit: { id: '9988ff1' } }] };
  return { result: [] };
}
export async function createBranch(): Promise<unknown> { await sleep(400); return null; }
export async function listRepositoryCommits(repoId: number): Promise<unknown> {
  if (repoId === 101) return { result: [
    { sha: 'ab12cd3', message: 'feat: REQ-2048 trace panel', authorName: '林默', committedDate: '2026-10-08T09:00:00Z' },
    { sha: 'ef45ab6', message: 'chore: REQ-2048 tests', authorName: '林默', committedDate: '2026-10-07T18:00:00Z' },
  ] };
  return { result: [] };
}
export async function listMergeRequests(repoId: number): Promise<unknown> {
  if (repoId === 101) return { result: [
    { localId: 218, title: 'REQ-2048 支持需求链路一键回溯', state: 'open', sourceBranch: 'feature/REQ-2048-trace', targetBranch: 'dev', author: { name: '林默' }, createdAt: '2026-10-08T10:42:00Z' },
  ] };
  return { result: [] };
}
export async function createMergeRequest(): Promise<unknown> { await sleep(400); return null; }
export async function mergeMergeRequest(): Promise<unknown> { await sleep(400); return null; }
export async function listPipelines(): Promise<typeof pipelines> { return pipelines; }
export async function listPipelineRuns(pipelineId: number) {
  const p = pipelines.find((x) => x.pipelineId === pipelineId);
  return [
    { pipelineRunId: 76, status: p?.status ?? 'SUCCESS', startTime: Date.now() - 300e3, endTime: Date.now(), executorAccountId: 'charles', triggerMode: 1 },
  ];
}
export async function getPipelineRun() { return null; }
export async function startPipelineRun(): Promise<unknown> { await sleep(400); return null; }
export async function stopPipelineRun(): Promise<unknown> { await sleep(400); return null; }
export async function getJobLogs(): Promise<string> { return '[mock] job logs'; }
