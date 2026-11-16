// 预览专用 attribution API mock：与 src/lib/attribution-api.ts 同签名。
// 仅被 preview/vite.config.mts 通过 alias 注入，不参与生产构建。
import type {
  ActiveWorkitem,
  ActivityCandidate,
  ActivityPolicy,
  AttributionStatus,
  ChangeEvent,
  ChangePage,
  HookMode,
  HookStatus,
  LocalRepoBinding,
  LocalRepoInfo,
  ResolvedWorkitemRef,
  SyncReport,
  WorkitemChange,
} from '../src/types/attribution';
import type { BranchTrackTopology } from '../src/types/branch-topology';

const now = Date.now();

function event(partial: Partial<ChangeEvent> & Pick<ChangeEvent, 'id' | 'kind' | 'title'>): ChangeEvent {
  return {
    repoId: 101,
    repoName: 'platform/nervd',
    externalId: partial.id,
    occurredAt: now - 60 * 60 * 1000,
    source: 'remote',
    pushed: true,
    backfilled: false,
    payload: {},
    ...partial,
  } as ChangeEvent;
}

const changes: WorkitemChange[] = [
  {
    ...event({
      id: 'commit:101:a1b2c3d',
      kind: 'commit',
      externalId: 'a1b2c3d4',
      title: 'feat(login): add captcha validation',
      branch: 'feature/REQ-2048',
      author: '林默',
      occurredAt: now - 40 * 60 * 1000,
      payload: {
        sha: 'a1b2c3d4e5f6',
        shortSha: 'a1b2c3d',
        message: 'feat(login): add captcha validation',
        author: '林默',
        filesChanged: 4,
        additions: 86,
        deletions: 12,
        files: ['src/login/captcha.tsx', 'src/login/form.tsx'],
      },
    }),
    relation: 'primary',
    confidence: 'explicit',
    identifier: 'TASK-202',
    workitemId: 'wi-2048',
    activityStatus: 'posted',
  },
  {
    ...event({
      id: 'mr:101:128',
      kind: 'mr',
      externalId: '128',
      title: 'TASK-202 登录验证码',
      branch: 'feature/REQ-2048',
      targetBranch: 'iteration/2026-11',
      author: '林默',
      occurredAt: now - 30 * 60 * 1000,
      payload: {
        localId: 128,
        state: 'merged',
        sourceBranch: 'feature/REQ-2048',
        targetBranch: 'iteration/2026-11',
        author: '林默',
        webUrl: 'https://codeup.aliyun.com/demo/nervd/change/128',
      },
    }),
    relation: 'related',
    confidence: 'branch',
    identifier: 'REQ-2048',
    workitemId: 'wi-2048',
    activityStatus: 'pending',
  },
  {
    ...event({
      id: 'build:jenkins:101:4521',
      kind: 'build',
      externalId: '4521',
      title: 'build-and-deploy #4521',
      branch: 'feature/REQ-2048',
      occurredAt: now - 20 * 60 * 1000,
      payload: {
        runId: '4521',
        provider: 'jenkins',
        status: 'FAIL',
        durationMs: 186000,
        stage: 'unit-test',
        webUrl: 'https://jenkins.example.com/job/frontend/4521/',
      },
    }),
    relation: 'related',
    confidence: 'branch',
    identifier: 'REQ-2048',
    workitemId: 'wi-2048',
    activityStatus: 'failed',
  },
];

const unassigned: WorkitemChange[] = [
  {
    ...event({
      id: 'commit:101:deadbee',
      kind: 'commit',
      externalId: 'deadbee',
      title: 'chore: update lockfile',
      branch: 'feature/REQ-2048',
      author: '陈序',
      occurredAt: now - 10 * 60 * 1000,
      payload: {
        sha: 'deadbee123',
        shortSha: 'deadbee',
        message: 'chore: update lockfile',
        author: '陈序',
        filesChanged: 1,
        additions: 12,
        deletions: 8,
      },
    }),
    relation: 'primary',
    confidence: 'manual',
    identifier: 'REQ-2048',
  },
];

const policy: ActivityPolicy = {
  enabled: true,
  childMode: 'batch',
  parentMode: 'milestone',
  maxPerDay: 5,
};

const bindings: LocalRepoBinding[] = [
  {
    repoId: 101,
    path: '/Users/demo/Projects/nervd',
    remoteUrl: 'git@codeup.aliyun.com:demo/nervd.git',
    defaultBranch: 'master',
    hookInstalled: true,
    hookMode: 'fill',
    updatedAt: now - 86_400_000,
  },
];

const active: ActiveWorkitem = {
  repoId: 101,
  workitemId: 'wi-2048',
  identifier: 'TASK-202',
  category: 'Task',
  parentWorkitemId: 'wi-2048',
  parentIdentifier: 'REQ-2048',
  updatedAt: now - 5 * 60 * 1000,
};

const topology: BranchTrackTopology = {
  trackId: 'template-iteration',
  childPattern: 'bugfix/{identifier}',
  childBase: 'requirement',
  childMrTarget: 'parent',
};

export function isTauriRuntime(): boolean {
  // 浏览器预览没有 Tauri 事件桥；同步/回写 hook 应 no-op，避免 listen() 报错。
  return false;
}

export async function syncAttribution(): Promise<SyncReport> {
  return { startedAt: now - 1200, finishedAt: now, repos: [{ repoId: 101, ok: true, branches: 3, commits: 2, mergeRequests: 1 }] };
}

export async function getAttributionStatus(): Promise<AttributionStatus> {
  return { lastSyncAt: now - 60_000, syncing: false, repos: [{ repoId: 101, lastSyncAt: now - 60_000 }] };
}

export async function listWorkitemChanges(input: { workitemId: string; limit?: number; before?: number; includeRollup?: boolean }): Promise<ChangePage> {
  if (input.workitemId !== 'wi-2048') {
    return { items: [], nextBefore: undefined };
  }
  return { items: changes, nextBefore: undefined };
}

export async function listUnattributedChanges(input: { repoId?: number; limit?: number } = {}): Promise<ChangePage> {
  void input;
  return { items: unassigned, nextBefore: undefined };
}

export async function assignChangeWorkitem(input: { eventId: string; workitemId: string; relation?: string }): Promise<boolean> {
  const hit = unassigned.find((item) => item.id === input.eventId);
  if (hit) {
    hit.workitemId = input.workitemId;
    hit.confidence = 'manual';
    unassigned.splice(unassigned.indexOf(hit), 1);
    changes.push(hit);
  }
  return true;
}

export async function resolveWorkitemIdentifiers(input: { identifiers: string[] }): Promise<ResolvedWorkitemRef[]> {
  return input.identifiers.map((identifier) => ({
    identifier,
    workitemId: identifier.startsWith('REQ') ? 'wi-2048' : 'wi-2048',
    category: identifier.startsWith('REQ') ? 'Req' : 'Task',
    subject: '支持需求链路一键回溯',
    parentIdentifier: 'REQ-2048',
    parentWorkitemId: 'wi-2048',
  }));
}

export async function listActivityCandidates(): Promise<ActivityCandidate[]> {
  return [];
}

export async function markActivity(): Promise<boolean> {
  return true;
}

export async function getActivityPolicy(): Promise<ActivityPolicy> {
  return policy;
}

export async function saveActivityPolicy(input: { policy: ActivityPolicy }): Promise<ActivityPolicy> {
  return input.policy;
}

export async function listLocalRepoBindings(): Promise<LocalRepoBinding[]> {
  return bindings;
}

export async function saveLocalRepoBinding(input: { repoId: number; path: string }): Promise<LocalRepoBinding> {
  const existing = bindings.find((item) => item.repoId === input.repoId);
  if (existing) {
    existing.path = input.path;
    existing.updatedAt = Date.now();
    return existing;
  }
  const created: LocalRepoBinding = {
    repoId: input.repoId,
    path: input.path,
    hookInstalled: false,
    hookMode: 'fill',
    updatedAt: Date.now(),
  };
  bindings.push(created);
  return created;
}

export async function deleteLocalRepoBinding(input: { repoId: number }): Promise<boolean> {
  const index = bindings.findIndex((item) => item.repoId === input.repoId);
  if (index >= 0) bindings.splice(index, 1);
  return true;
}

export async function pickRepoDirectory(): Promise<string | null> {
  return '/Users/demo/Projects/nervd';
}

export async function readLocalRepoCode(input: {
  repoId: number;
  refName?: string;
  paths?: string[];
  keywords?: string[];
}): Promise<{ gitRef: string; tree: string[]; files: Array<{ path: string; content: string; truncated: boolean }> }> {
  void input;
  return {
    gitRef: 'HEAD',
    tree: ['src/App.vue', 'src/api/payment.js', 'src/views/Cashier/index.vue'],
    files: [
      {
        path: 'src/api/payment.js',
        content: "// 收银台支付接口\nexport const createPayment = () => {};\n",
        truncated: false,
      },
    ],
  };
}

export async function inspectLocalRepo(input: { path: string }): Promise<LocalRepoInfo> {
  return {
    path: input.path,
    isGit: true,
    remoteUrl: 'git@codeup.aliyun.com:demo/nervd.git',
    currentBranch: 'feature/REQ-2048',
    headSha: 'a1b2c3d4',
    dirty: false,
    hookInstalled: true,
    hookMode: 'fill',
  };
}

export async function syncLocalRepo(): Promise<SyncReport> {
  return syncAttribution();
}

export async function getActiveWorkitem(input: { repoId?: number } = {}): Promise<ActiveWorkitem | null> {
  if (input.repoId != null && input.repoId !== active.repoId) return null;
  return active;
}

export async function listActiveWorkitems(): Promise<ActiveWorkitem[]> {
  return active ? [active] : [];
}

export async function setActiveWorkitem(input: { repoId: number; workitemId?: string; parentWorkitemId?: string }): Promise<boolean> {
  if (input.workitemId) {
    active.repoId = input.repoId;
    active.workitemId = input.workitemId;
    active.parentWorkitemId = input.parentWorkitemId;
    active.updatedAt = Date.now();
  }
  return true;
}

export async function installCommitMsgHook(input: { repoId: number; mode?: HookMode }): Promise<HookStatus> {
  const binding = bindings.find((item) => item.repoId === input.repoId);
  const mode = input.mode ?? 'fill';
  if (binding) {
    binding.hookInstalled = true;
    binding.hookMode = mode;
  }
  return { installed: true, mode, path: '.git/hooks/commit-msg' };
}

export async function uninstallCommitMsgHook(input: { repoId: number }): Promise<HookStatus> {
  const binding = bindings.find((item) => item.repoId === input.repoId);
  if (binding) binding.hookInstalled = false;
  return { installed: false, mode: 'off' };
}

export async function getBranchTrackTopology(): Promise<BranchTrackTopology> {
  return topology;
}

export async function saveBranchTrackTopology(input: { trackId: string; topology: BranchTrackTopology }): Promise<BranchTrackTopology> {
  topology.trackId = input.trackId;
  topology.childPattern = input.topology.childPattern;
  topology.childBase = input.topology.childBase;
  topology.childMrTarget = input.topology.childMrTarget;
  return topology;
}