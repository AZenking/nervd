// Tauri 命令的 invoke 包装（契约 §4）
import { invoke } from '@tauri-apps/api/core';
import type {
  Category, IterationSummary, JenkinsConnection, OrgSummary, PipelineRunSummary, RepoCiSnapshot,
  JenkinsJobParameter, JenkinsJobSummary, JenkinsLogChunk, RepoCiBinding, Settings, SettingsView, WorkitemPage,
  WorkitemStatusOption, WorkitemSummary, BranchRuleTemplate,
} from '../types';

/** 列表行 = WorkitemSummary + 后端增补字段 */
export interface WorkitemRow extends WorkitemSummary {
  relatedTo?: string[]; // 关联人姓名（commands.rs names_of 防御式提取）
  sprintId?: string; // 所属迭代（search 行 sprint.id，空串=未分配迭代）
  sprintName?: string;
}

/** PipelineRunSummary 扩展行（types.ts 不可改，扩展字段在 api.ts 内定义）：
 *  branches 由 Rust list_pipeline_runs 映射；pipelineId/pipelineName 由追溯链路增补 */
export interface TracePipelineRun extends PipelineRunSummary {
  branches?: string[];
  pipelineId?: number;
  pipelineName?: string;
}

export async function getSettings(): Promise<SettingsView> {
  return invoke('get_settings');
}
export async function saveSettings(settings: Settings): Promise<SettingsView> {
  return invoke('save_settings', { settings });
}
export async function saveWorkitemRepos(workitemId: string, repoIds: number[] | null): Promise<SettingsView> {
  return invoke('save_workitem_repos', { workitemId, repoIds });
}
export async function saveBranchRuleTemplates(templates: BranchRuleTemplate[]): Promise<SettingsView> {
  return invoke('save_branch_rule_templates', { templates });
}
export async function saveWorkitemRepoBranchTemplate(
  workitemId: string,
  repoId: number,
  templateId: string | null,
): Promise<SettingsView> {
  return invoke('save_workitem_repo_branch_template', { workitemId, repoId, templateId });
}
export async function saveRepoCiBinding(repoId: number, binding: RepoCiBinding | null): Promise<SettingsView> {
  return invoke('save_repo_ci_binding', { repoId, binding });
}
export async function savePat(pat: string): Promise<boolean> {
  return invoke('save_pat', { pat });
}
export async function deletePat(): Promise<boolean> {
  return invoke('delete_pat');
}
export async function checkConnection(): Promise<OrgSummary[]> {
  return invoke('check_connection');
}
export async function listProjects(search?: string): Promise<{ id: string; name: string }[]> {
  return invoke('list_projects', { search });
}

/** 迭代列表（后端 sprints OpenAPI 防御式封装；不可用时抛 UNSUPPORTED，由 UI 回退占位数据） */
export async function listIterations(): Promise<IterationSummary[]> {
  return invoke('list_iterations');
}

export async function listWorkitems(p: {
  category: Category; spaceIdentifier: string; nextToken?: string;
}): Promise<WorkitemPage & { items: WorkitemRow[] }> {
  return invoke('list_workitems', p);
}
export async function getWorkitem(workitemId: string): Promise<Record<string, unknown>> {
  return invoke('get_workitem', { workitemId });
}
export async function listWorkitemComments(workitemId: string): Promise<Record<string, unknown>> {
  return invoke('list_workitem_comments', { workitemId });
}

/** 子工作项（workitems:search 行级 parentId 过滤的映射产物） */
export interface WorkitemChild {
  workitemId: string;
  identifier: string;
  subject: string;
  category?: string;
  statusId?: string;
  status?: string;
  assignedTo?: string;
  gmtModified?: string;
}

export interface WorkitemChildrenResult {
  items: WorkitemChild[];
  /** 空结果时后端带回的原始响应片段（诊断包装形态用） */
  rawSample?: string;
}

export async function listWorkitemChildren(workitemId: string): Promise<WorkitemChildrenResult> {
  const resp = await invoke('list_workitem_children', { workitemId }) as {
    items?: unknown;
    rawSample?: unknown;
  };
  return {
    items: Array.isArray(resp?.items) ? (resp.items as WorkitemChild[]) : [],
    rawSample: typeof resp?.rawSample === 'string' && resp.rawSample ? resp.rawSample : undefined,
  };
}
export async function getWorkitemWorkflowStatuses(workitemId: string): Promise<WorkitemStatusOption[]> {
  return invoke('get_workitem_workflow_statuses', { workitemId });
}
export async function updateWorkitem(workitemId: string, update: { subject?: string; statusId?: string }): Promise<unknown> {
  return invoke('update_workitem', { workitemId, ...update });
}

/** 项目内某类别的工作项类型（list_workitem_types 归一化产物） */
export interface WorkitemTypeOption {
  id: string;
  name: string;
  category?: string;
  /** 云效标记的默认类型（创建对话框预选） */
  defaultType?: boolean;
}

/** 工作项类型列表：oapi/v1 GET projects/{defaultSpace}/workitemTypes?category=… */
export async function listWorkitemTypes(category: string): Promise<WorkitemTypeOption[]> {
  return invoke('list_workitem_types', { category });
}

/** 在需求下创建子工作项（写操作）：parentId 挂到父项，返回与子项列表同形态的行 */
export async function createWorkitemChild(
  parentWorkitemId: string,
  p: { subject: string; workitemTypeId: string },
): Promise<WorkitemChild> {
  return invoke('create_workitem_child', { parentWorkitemId, ...p });
}
/** 附件图片代理：Rust 侧校验 host 白名单 / image/* / ≤5MB，成功返回 data: URL */
export async function proxyWorkitemFile(url: string): Promise<string> {
  return invoke('proxy_workitem_file', { url });
}

export async function listRepos(search?: string, page?: number): Promise<{ id: number; name: string; pathWithNamespace?: string; lastActivityAt?: string }[]> {
  return invoke('list_repos', { search, page });
}

export async function saveJenkinsToken(connectionId: string, token: string): Promise<boolean> {
  return invoke('save_jenkins_token', { connectionId, token });
}
export async function deleteJenkinsToken(connectionId: string): Promise<boolean> {
  return invoke('delete_jenkins_token', { connectionId });
}
export async function testJenkinsConnection(connection: JenkinsConnection, token?: string): Promise<string> {
  return invoke('test_jenkins_connection', { connection, token });
}
export async function getJenkinsJob(connectionId: string, jobFullName: string): Promise<{
  name: string; fullName: string; color: string; lastBuild?: { runId: string; status: string };
}> {
  return invoke('get_jenkins_job', { connectionId, jobFullName });
}
export async function listJenkinsJobs(connectionId: string): Promise<JenkinsJobSummary[]> {
  return invoke('list_jenkins_jobs', { connectionId });
}
export async function getJenkinsJobParameters(
  connectionId: string,
  jobFullName: string,
): Promise<JenkinsJobParameter[]> {
  return invoke('get_jenkins_job_parameters', { connectionId, jobFullName });
}
export async function triggerJenkinsJob(
  repoId: number,
  connectionId: string,
  jobFullName: string,
  parameters: Record<string, string>,
): Promise<unknown> {
  return invoke('trigger_jenkins_job', { repoId, connectionId, jobFullName, parameters });
}
export async function getRepoCiSnapshot(repoId: number, maxResults = 5): Promise<RepoCiSnapshot> {
  return invoke('get_repo_ci_snapshot', { repoId, maxResults });
}
export async function triggerRepoCi(repoId: number): Promise<unknown> {
  return invoke('trigger_repo_ci', { repoId });
}
export async function getRepoCiLogs(repoId: number, runId: string): Promise<string> {
  return invoke('get_repo_ci_logs', { repoId, runId });
}
export async function getRepoCiLogChunk(
  repoId: number,
  runId: string,
  startOffset: number,
): Promise<JenkinsLogChunk> {
  return invoke('get_repo_ci_log_chunk', { repoId, runId, startOffset });
}

export async function listBranches(
  repoId: number,
  search?: string,
  page?: number,
  perPage?: number,
): Promise<unknown> {
  return invoke('list_branches', { repoId, search, page, perPage });
}
export async function compareBranches(repoId: number, fromBranch: string, toBranch: string): Promise<unknown> {
  return invoke('compare_branches', { repoId, fromBranch, toBranch });
}
export async function createBranch(repoId: number, branchName: string, refName: string): Promise<unknown> {
  return invoke('create_branch', { repoId, branchName, refName });
}

export async function listRepositoryCommits(repoId: number, page?: number): Promise<Record<string, unknown>> {
  return invoke('list_repository_commits', { repoId, page });
}

export async function listMergeRequests(repoId: number, state?: string): Promise<Record<string, unknown>> {
  return invoke('list_merge_requests', { repoId, state });
}
export async function createMergeRequest(p: {
  repoId: number; title: string; sourceBranch: string; targetBranch: string; description?: string;
}): Promise<unknown> {
  return invoke('create_merge_request', p);
}
export async function mergeMergeRequest(repoId: number, localId: number): Promise<unknown> {
  return invoke('merge_merge_request', { repoId, localId });
}

export async function listPipelines(maxResults?: number): Promise<{ pipelineId: number; pipelineName: string; status?: string; updateTime?: string }[]> {
  return invoke('list_pipelines', { maxResults });
}
export async function listPipelineRuns(pipelineId: number, maxResults?: number): Promise<TracePipelineRun[]> {
  return invoke('list_pipeline_runs', { pipelineId, maxResults });
}
export async function getPipelineRun(pipelineId: number, runId: number): Promise<Record<string, unknown>> {
  return invoke('get_pipeline_run', { pipelineId, runId });
}
export async function startPipelineRun(pipelineId: number): Promise<unknown> {
  return invoke('start_pipeline_run', { pipelineId });
}
export async function stopPipelineRun(pipelineId: number, runId: number): Promise<unknown> {
  return invoke('stop_pipeline_run', { pipelineId, runId });
}
export async function getJobLogs(pipelineId: number, runId: number, jobId: number): Promise<string> {
  return invoke('get_job_logs', { pipelineId, runId, jobId });
}
