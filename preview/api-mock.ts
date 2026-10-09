// 预览专用 api mock：与 src/lib/api.ts 同签名，返回静态演示数据。
// 仅被 preview/vite.config.mjs 通过 alias 注入，不参与生产构建。
import type {
  BranchInfo, BranchRuleTemplate, Category, IterationSummary, JenkinsConnection, JenkinsJobParameter,
  JenkinsJobSummary, MrSummary, OrgSummary, RepoCiBinding, RepoCiSnapshot, Settings, SettingsView,
  WorkitemPage, WorkitemStatusOption,
} from '../src/types';
import type { WorkitemChild, WorkitemRow } from '../src/lib/api';

export type { WorkitemRow };

const settings: SettingsView = {
  hasPat: true,
  organizationId: '60de7a689d5e4ab8b7be0c25',
  defaultSpaceIdentifier: 'a1b2c3d4e5f60718',
  linkPattern: '(?:REQ|BUG|TASK)[-_]?(\\d+)',
  watchedRepos: [101, 102],
  allowWriteOps: false,
  workitemRepos: {},
  branchRuleTemplates: [
    {
      id: 'template-site-a', name: 'A 局点', sourceBranch: 'master',
      baselineBranchPattern: 'iteration/{iteration}/site-a', workitemBranchPattern: 'feature/{identifier}',
    },
    {
      id: 'template-site-b', name: 'B 局点', sourceBranch: 'test',
      baselineBranchPattern: 'iteration/{iteration}/site-b', workitemBranchPattern: 'feature/{identifier}',
    },
    {
      id: 'template-hotfix', name: '临时 Hotfix', sourceBranch: 'master',
      baselineBranchPattern: 'hotfix/{iteration}', workitemBranchPattern: 'hotfix/{identifier}',
    },
  ],
  workitemRepoBranchTemplates: {},
  jenkinsConnections: [
    { id: 'jenkins-1', name: '研发 Jenkins', baseUrl: 'https://jenkins.example.com', username: 'charles', hasToken: true },
  ],
  repoCiBindings: {
    '101': {
      provider: 'jenkins', connectionId: 'jenkins-1', jobFullName: 'frontend/build-and-deploy',
      parameters: { ENVIRONMENT: 'test', BRANCH: 'feature/REQ-2048-trace' },
      environmentParameter: 'ENVIRONMENT', branchParameter: 'BRANCH',
    },
    '102': { provider: 'flow', pipelineId: 9021, pipelineName: 'nervd-core-build' },
  },
};

const items: WorkitemRow[] = [
  { identifier: 'REQ-2048', workitemId: 'wi-2048', subject: '支持需求链路一键回溯', status: '开发中', category: 'Req', assignedTo: '林默', spaceName: '平台工程', updatedAt: '2026-10-08 15:42' },
  { identifier: 'REQ-2039', workitemId: 'wi-2039', subject: '总览页增加仓库健康度', status: '待评审', category: 'Req', assignedTo: '周荻', spaceName: '平台工程', updatedAt: '2026-10-07 11:08' },
  { identifier: 'REQ-2051', workitemId: 'wi-2051', subject: '流水线通知接入系统通知中心', status: '开发中', category: 'Req', assignedTo: '陈序', spaceName: '平台工程', updatedAt: '2026-10-06 09:30' },
];

// ---- 迭代与分页列表（驱动迭代下拉 / 筛选栏 / 滚动加载的演示数据） ----

const iterations: IterationSummary[] = Array.from({ length: 9 }, (_, i) => {
  const start = new Date(2026, 6, 2 + i * 14);
  const end = new Date(2026, 6, 12 + i * 14);
  const now = new Date();
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return {
    id: `sprint-${100 + i}`,
    name: `Benz-2026${String(7 + i).padStart(2, '0')}16`,
    title: `演示迭代 #${100 + i}`,
    state: end < now ? '已结束' : start <= now ? '进行中' : '未开始',
    startDate: fmt(start),
    endDate: fmt(end),
  };
});

const people = ['林默', '周荻', '陈序', '杨阳', '顾青', '白帆'];
const statusPool = ['待评审', '开发中', '已提交', '已完成'];
const subjectPool = [
  '支持需求链路一键回溯', '总览页增加仓库健康度', '流水线通知接入系统通知中心',
  '迭代工作项滚动加载', '分支差异自动比对', '构建产物指纹校验', '需求模板批量导入',
  '缺陷趋势周报自动生成', 'Jenkins 凭证轮换提醒', 'MR 关联需求自动校验',
  '发布单生成器', '灰度环境流量染色',
];

/** 生成行缓存：getWorkitem 等详情接口可回查滚动加载出来的行 */
const generatedRows = new Map<string, WorkitemRow>();

const sprintIds = iterations.map((it) => it.id);

function generatedPage(category: Category, page: number, perPage: number): WorkitemRow[] {
  return Array.from({ length: perPage }, (_, i) => {
    const n = (page - 1) * perPage + i;
    const prefix = category === 'Req' ? 'REQ' : category === 'Bug' ? 'BUG' : 'TASK';
    const sprintId = n % 13 === 0 ? '' : sprintIds[n % 9];
    const row: WorkitemRow = {
      identifier: `${prefix}-${2100 - n}`,
      workitemId: `wi-${prefix.toLowerCase()}-${2100 - n}`,
      subject: subjectPool[n % subjectPool.length],
      status: statusPool[n % statusPool.length],
      category,
      assignedTo: n % 7 === 0 ? undefined : people[n % people.length],
      relatedTo: n % 3 === 0 ? undefined : [people[(n + 1) % people.length], ...(n % 4 === 0 ? [people[(n + 3) % people.length]] : [])],
      sprintId,
      sprintName: sprintId ? iterations.find((it) => it.id === sprintId)?.name : undefined,
      spaceName: '平台工程',
      updatedAt: `2026-10-${String(1 + (n % 8)).padStart(2, '0')} ${String(8 + (n % 12)).padStart(2, '0')}:${String((n * 7) % 60).padStart(2, '0')}`,
    };
    generatedRows.set(row.workitemId, row);
    return row;
  });
}

const repositories = [
  { id: 101, name: 'nervd-web', pathWithNamespace: 'codeup/nervd-web', lastActivityAt: '2026-10-08T14:00:00Z' },
  { id: 102, name: 'nervd-core', pathWithNamespace: 'codeup/nervd-core', lastActivityAt: '2026-10-08T12:20:00Z' },
  { id: 103, name: 'nervd-docs', pathWithNamespace: 'docs/nervd-docs', lastActivityAt: '2026-10-05T08:00:00Z' },
];

const ciSnapshots: Record<number, RepoCiSnapshot> = {
  101: { provider: 'jenkins', name: 'frontend/build-and-deploy', status: 'SUCCESS', runs: [
    { runId: '1842', status: 'SUCCESS', startTime: Date.now() - 3600e3, durationMs: 258e3, trigger: 'charles', parameters: { ENVIRONMENT: 'test', BRANCH: 'feature/REQ-2048-trace' } },
    { runId: '1841', status: 'FAIL', startTime: Date.now() - 7200e3, durationMs: 96e3, parameters: { ENVIRONMENT: 'staging', BRANCH: 'feature/REQ-2039-layout' } },
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
const mockJenkinsLogOffsets = new Map<string, number>();

export async function getSettings(): Promise<SettingsView> { return { ...settings }; }
export async function saveSettings(s: Settings): Promise<SettingsView> {
  Object.assign(settings, s, {
    branchRuleTemplates: s.branchRuleTemplates ?? [],
    workitemRepoBranchTemplates: s.workitemRepoBranchTemplates ?? {},
  });
  return { ...settings };
}
export async function saveWorkitemRepos(workitemId: string, repoIds: number[] | null): Promise<SettingsView> {
  if (repoIds == null) {
    delete settings.workitemRepos[workitemId];
    delete settings.workitemRepoBranchTemplates[workitemId];
  } else {
    settings.workitemRepos[workitemId] = repoIds;
    const selected = settings.workitemRepoBranchTemplates[workitemId] ?? {};
    settings.workitemRepoBranchTemplates[workitemId] = Object.fromEntries(
      Object.entries(selected).filter(([repoId]) => repoIds.includes(Number(repoId))),
    );
  }
  return { ...settings };
}
export async function saveBranchRuleTemplates(templates: BranchRuleTemplate[]): Promise<SettingsView> {
  await sleep(150);
  const ids = new Set(templates.map((template) => template.id));
  settings.branchRuleTemplates = templates.map((template) => ({ ...template }));
  for (const [workitemId, selected] of Object.entries(settings.workitemRepoBranchTemplates)) {
    const next = Object.fromEntries(Object.entries(selected).filter(([, templateId]) => ids.has(templateId)));
    if (Object.keys(next).length) settings.workitemRepoBranchTemplates[workitemId] = next;
    else delete settings.workitemRepoBranchTemplates[workitemId];
  }
  return { ...settings };
}
export async function saveWorkitemRepoBranchTemplate(
  workitemId: string,
  repoId: number,
  templateId: string | null,
): Promise<SettingsView> {
  await sleep(120);
  if (!workitemId.trim() || repoId <= 0) throw new Error('需求 ID 或仓库 ID 无效');
  if (templateId && !settings.branchRuleTemplates.some((template) => template.id === templateId)) {
    throw new Error('所选分支模板不存在');
  }
  const selected = { ...(settings.workitemRepoBranchTemplates[workitemId] ?? {}) };
  if (templateId) selected[String(repoId)] = templateId;
  else delete selected[String(repoId)];
  if (Object.keys(selected).length) settings.workitemRepoBranchTemplates[workitemId] = selected;
  else delete settings.workitemRepoBranchTemplates[workitemId];
  return { ...settings };
}
export async function saveRepoCiBinding(repoId: number, binding: RepoCiBinding | null): Promise<SettingsView> {
  await sleep(120);
  if (binding) settings.repoCiBindings[String(repoId)] = binding;
  else delete settings.repoCiBindings[String(repoId)];
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
export async function listIterations(): Promise<IterationSummary[]> {
  await sleep(200);
  return iterations;
}

export async function listWorkitems(p: {
  category: Category; nextToken?: string; sprintId?: string;
}): Promise<WorkitemPage & { items: WorkitemRow[] }> {
  await sleep(350);
  const category = p.category ?? 'Req';
  const perPage = 12;
  const total = 57; // 5 页（12×4 + 9），驱动滚动加载演示
  const page = Math.max(1, Number(p.nextToken) || 1);
  const start = (page - 1) * perPage;
  if (start >= total) return { items: [], nextToken: null };
  const rows = generatedPage(category, page, Math.min(perPage, total - start));
  return { items: rows, nextToken: start + perPage < total ? String(page + 1) : null };
}
export async function getWorkitem(workitemId: string): Promise<Record<string, unknown>> {
  const cur = items.find((i) => i.workitemId === workitemId)
    ?? generatedRows.get(workitemId)
    ?? items.map((i) => ({ ...i, subject: '（mock 子工作项）完善交付链路' })).find((i) => i.workitemId === workitemId);
  return { workitem: { subject: cur?.subject, status: cur?.status, description: { raw_text: '让“需求 → 分支 → 提交 → MR → 流水线”在一个工作面内可解释、可操作。当前需求正在整理追溯链路展示。' } } };
}
export async function listWorkitemComments(): Promise<Record<string, unknown>> {
  return [{ author: { name: '周荻' }, createdAt: '2026-10-08 10:22', content: '追溯面板的 CI 状态建议加环境维度。' }] as unknown as Record<string, unknown>;
}
const mockSubtaskStatuses: WorkitemStatusOption[] = [
  { id: 'status-todo', name: '待处理' },
  { id: 'status-doing', name: '处理中' },
  { id: 'status-done', name: '已完成' },
];
const mockRequirementChildren: WorkitemChild[] = [
    { workitemId: 'wi-2049', identifier: 'BENZ-6214', subject: '完成追溯面板 UI 联调', category: 'Task', statusId: 'status-doing', status: '处理中', assignedTo: '杨阳', gmtModified: '2026-10-08 12:40' },
    { workitemId: 'wi-2050', identifier: 'BENZ-6220', subject: '追溯规则正则回归测试', category: 'Task', statusId: 'status-done', status: '已完成', assignedTo: '杨阳', gmtModified: '2026-10-07 17:05' },
    { workitemId: 'wi-2055', identifier: 'BENZ-6216', subject: '追溯面板 CI 状态在弱网下显示为空', category: 'Bug', statusId: 'status-todo', status: '待处理', assignedTo: '周荻', gmtModified: '2026-10-08 18:22' },
];
const mockChildren: Record<string, WorkitemChild[]> = {
  'wi-2048': mockRequirementChildren,
  'wi-req-2084': mockRequirementChildren,
};
export async function listWorkitemChildren(workitemId: string) {
  return { items: (mockChildren[workitemId] ?? []).map((child) => ({ ...child })), rawSample: '' };
}
export async function getWorkitemWorkflowStatuses(): Promise<WorkitemStatusOption[]> {
  await sleep(100);
  return mockSubtaskStatuses;
}
export async function updateWorkitem(workitemId: string, update: { subject?: string; statusId?: string }): Promise<unknown> {
  const child = Object.values(mockChildren).flat().find((item) => item.workitemId === workitemId);
  if (!child) throw new Error('找不到预览子任务');
  if (update.subject) child.subject = update.subject;
  if (update.statusId) {
    const status = mockSubtaskStatuses.find((item) => item.id === update.statusId);
    if (!status) throw new Error('未知状态');
    child.statusId = status.id;
    child.status = status.name;
  }
  return { success: true };
}
export async function proxyWorkitemFile(): Promise<string> { throw new Error('preview 无附件代理'); }
export async function listRepos(search?: string, page = 1): Promise<typeof repositories> {
  const filtered = search
    ? repositories.filter((repo) => (repo.pathWithNamespace + ' ' + repo.name).toLowerCase().includes(search.toLowerCase()))
    : repositories;
  const start = (Math.max(1, page) - 1) * REPO_PAGE_SIZE;
  return filtered.slice(start, start + REPO_PAGE_SIZE);
}
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
const jenkinsJobs: JenkinsJobSummary[] = [
  { name: 'build-and-deploy', fullName: 'frontend/build-and-deploy' },
  { name: 'test-suite', fullName: 'frontend/test-suite' },
  { name: 'backend-build', fullName: 'backend/backend-build' },
];
const jenkinsParameters: JenkinsJobParameter[] = [
  { name: 'ENVIRONMENT', type: 'ChoiceParameterDefinition', defaultValue: 'test', choices: ['dev', 'test', 'staging', 'prod'] },
  { name: 'BRANCH', type: 'StringParameterDefinition', defaultValue: 'master', choices: [] },
  { name: 'RUN_TESTS', type: 'BooleanParameterDefinition', defaultValue: 'true', choices: ['true', 'false'] },
];
export async function listJenkinsJobs(): Promise<JenkinsJobSummary[]> {
  await sleep(180);
  return jenkinsJobs;
}
export async function getJenkinsJobParameters(): Promise<JenkinsJobParameter[]> {
  await sleep(180);
  return jenkinsParameters;
}
export async function triggerJenkinsJob(
  repoId: number,
  _connectionId: string,
  jobFullName: string,
  parameters: Record<string, string>,
): Promise<unknown> {
  await sleep(500);
  const previous = ciSnapshots[repoId] ?? { provider: 'jenkins' as const, name: jobFullName, runs: [] };
  const runId = String(Date.now()).slice(-5);
  ciSnapshots[repoId] = {
    provider: 'jenkins', name: jobFullName, status: 'RUNNING',
    runs: [{ runId, status: 'RUNNING', startTime: Date.now(), trigger: '预览构建', parameters: { ...parameters } }, ...previous.runs].slice(0, 5),
  };
  return { queueUrl: 'mock://queue/' + runId };
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
export async function getRepoCiLogChunk(repoId: number, runId: string, startOffset: number) {
  await sleep(250);
  const key = `${repoId}/${runId}`;
  const fullText = Array.from({ length: 24 }, (_, i) => `[mock] ${repoId}/${runId} step ${i + 1} … ok`).join('\n') + '\n';
  const run = ciSnapshots[repoId]?.runs.find((item) => item.runId === runId);
  const isBuilding = run?.status === 'RUNNING';
  let available = mockJenkinsLogOffsets.get(key) ?? Math.min(220, fullText.length);
  if (isBuilding) available = Math.min(fullText.length, available + 220);
  else available = fullText.length;
  mockJenkinsLogOffsets.set(key, available);
  const endOffset = Math.min(available, startOffset + 280);
  const text = fullText.slice(startOffset, endOffset);
  const buildContinues = Boolean(isBuilding && available < fullText.length);
  if (isBuilding && available >= fullText.length && run) {
    run.status = 'SUCCESS';
    run.durationMs = Date.now() - (run.startTime ?? Date.now());
    const snapshot = ciSnapshots[repoId];
    if (snapshot) snapshot.status = 'SUCCESS';
  }
  return { text, nextOffset: endOffset, hasMore: endOffset < fullText.length || buildContinues };
}
const createdBranches: Record<number, BranchInfo[]> = {};
const createdMergeRequests: Record<number, MrSummary[]> = {};
const REPO_PAGE_SIZE = 50;

export async function listBranches(repoId: number, search?: string, page = 1, perPage = 100): Promise<Record<string, unknown>> {
  const baseBranches = repoId === 101 ? [
    { name: 'feature/REQ-2048-trace', commit: { id: 'ab12cd3', message: 'feat: trace panel' } },
    { name: 'master', commit: { id: '0000000' } },
    { name: 'test', commit: { id: 't357001', message: 'test baseline' } },
    { name: 'dev', commit: { id: 'de00d00' } },
    { name: 'iteration/Benz-20261016', commit: { id: 'ab12cd3', message: 'iteration baseline' } },
  ] : repoId === 102 ? [
    { name: 'feature/REQ-2048-core', commit: { id: '9988ff1' } },
    { name: 'master', commit: { id: '0000000' } },
    { name: 'test', commit: { id: 't357002', message: 'test baseline' } },
    { name: 'dev', commit: { id: 'de00d00' } },
  ] : [];
  const branches = [...baseBranches, ...(createdBranches[repoId] ?? [])];
  const filtered = search ? branches.filter((branch) => branch.name.includes(search)) : branches;
  const size = Math.max(1, perPage);
  const start = (Math.max(1, page) - 1) * size;
  return { result: filtered.slice(start, start + size), total: filtered.length };
}
export async function compareBranches(repoId: number, fromBranch: string, toBranch: string): Promise<Record<string, unknown>> {
  await sleep(250);
  const knownBranches = (await listBranches(repoId)).result as BranchInfo[];
  if (!knownBranches.some((branch) => branch.name === fromBranch)) throw new Error(`来源分支不存在：${fromBranch}`);
  if (!knownBranches.some((branch) => branch.name === toBranch)) throw new Error(`目标分支不存在：${toBranch}`);
  return { commits: [] };
}
export async function createBranch(repoId: number, branchName: string, refName: string): Promise<unknown> {
  await sleep(400);
  const current = await listBranches(repoId);
  const branches = (current.result as BranchInfo[]) ?? [];
  if (branches.some((branch) => branch.name === branchName)) throw new Error('目标分支已存在');
  if (!branches.some((branch) => branch.name === refName)) throw new Error('来源分支不存在');
  createdBranches[repoId] = [
    ...(createdBranches[repoId] ?? []),
    { name: branchName, commit: { id: 'mock-' + Date.now().toString(16), message: 'created from ' + refName } },
  ];
  return { name: branchName };
}
export async function listRepositoryCommits(repoId: number): Promise<unknown> {
  if (repoId === 101) return { result: [
    { sha: 'ab12cd3', message: 'feat: REQ-2048 trace panel', authorName: '林默', committedDate: '2026-10-08T09:00:00Z' },
    { sha: 'ef45ab6', message: 'chore: REQ-2048 tests', authorName: '林默', committedDate: '2026-10-07T18:00:00Z' },
  ] };
  return { result: [] };
}
export async function listMergeRequests(repoId: number): Promise<unknown> {
  const existing: MrSummary[] = repoId === 101 ? [
    { localId: 218, title: 'REQ-2048 支持需求链路一键回溯', state: 'open', sourceBranch: 'feature/REQ-2048-trace', targetBranch: 'dev', author: { name: '林默' }, createdAt: '2026-10-08T10:42:00Z' },
  ] : [];
  return { result: [...existing, ...(createdMergeRequests[repoId] ?? [])] };
}
export async function createMergeRequest(input: {
  repoId: number; title: string; sourceBranch: string; targetBranch: string; description?: string;
}): Promise<unknown> {
  await sleep(400);
  const current = await listMergeRequests(input.repoId) as { result?: MrSummary[] };
  if (current.result?.some((request) =>
    request.sourceBranch === input.sourceBranch && request.targetBranch === input.targetBranch,
  )) throw new Error('此源分支和目标分支的 MR 已存在');
  const request: MrSummary = {
    localId: Date.now(),
    title: input.title,
    state: 'open',
    sourceBranch: input.sourceBranch,
    targetBranch: input.targetBranch,
    author: { name: '预览用户' },
    createdAt: new Date().toISOString(),
  };
  createdMergeRequests[input.repoId] = [...(createdMergeRequests[input.repoId] ?? []), request];
  return request;
}
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
