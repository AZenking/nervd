// 22 个 Tauri 命令的 invoke 包装（契约 §4）
import { invoke } from '@tauri-apps/api/core';
import type {
  Category, OrgSummary, Settings, SettingsView, WorkitemPage,
} from '../types';

export async function getSettings(): Promise<SettingsView> {
  return invoke('get_settings');
}
export async function saveSettings(settings: Settings): Promise<SettingsView> {
  return invoke('save_settings', { settings });
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

export async function listWorkitems(p: {
  category: Category; spaceIdentifier: string; nextToken?: string;
}): Promise<WorkitemPage> {
  return invoke('list_workitems', p);
}
export async function getWorkitem(workitemId: string): Promise<Record<string, unknown>> {
  return invoke('get_workitem', { workitemId });
}
export async function listWorkitemComments(workitemId: string): Promise<Record<string, unknown>> {
  return invoke('list_workitem_comments', { workitemId });
}
export async function updateWorkitemStatus(workitemId: string, statusIdentifier: string): Promise<unknown> {
  return invoke('update_workitem_status', { workitemId, statusIdentifier });
}

export async function listRepos(search?: string, page?: number): Promise<{ id: number; name: string; pathWithNamespace?: string; lastActivityAt?: string }[]> {
  return invoke('list_repos', { search, page });
}
export async function listBranches(repoId: number, search?: string): Promise<Record<string, unknown>> {
  return invoke('list_branches', { repoId, search });
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
export async function listPipelineRuns(pipelineId: number, maxResults?: number): Promise<{ pipelineRunId: number; status: string; startTime?: number; endTime?: number; executorAccountId?: string; triggerMode?: number }[]> {
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
