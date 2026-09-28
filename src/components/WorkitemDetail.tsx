import { useState } from 'react';
import * as api from '../lib/api';
import { useApp } from '../store/app';
import type { WorkitemSummary } from '../types';
import { StatusDot } from './StatusDot';
import { WriteOpButton } from './WriteOpButton';

export function WorkitemDetail() {
  const { selectedId, detail, comments, loadingDetail, items, settings } = useApp();
  const cur: WorkitemSummary | undefined = items.find((i) => i.workitemId === selectedId);

  const wi = (detail?.workitem ?? detail ?? {}) as Record<string, unknown>;
  const s = (k: string): string => {
    const v = wi[k];
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      return typeof o.name === 'string' ? o.name : '';
    }
    return '';
  };

  if (!selectedId) return <div className="empty">← 选择一个工作项</div>;
  if (loadingDetail) return <div className="empty">加载详情…</div>;

  return (
    <div className="pane" style={{ overflowY: 'auto' }}>
      <div className="detail-head">
        <h2>
          <span className="mono" style={{ color: 'var(--sig-run)', fontSize: 12, marginRight: 8 }}>
            {cur?.identifier}
          </span>
          {s('subject') || cur?.subject}
        </h2>
      </div>
      <div className="kv">
        <div><div className="k">状态</div><div className="v"><StatusDot status={cur?.status} /> {cur?.status || s('status') || '—'}</div></div>
        <div><div className="k">处理人</div><div className="v">{cur?.assignedTo || s('assignedTo') || '—'}</div></div>
        <div><div className="k">项目</div><div className="v">{cur?.spaceName || s('spaceName') || '—'}</div></div>
        <div><div className="k">更新</div><div className="v">{cur?.updatedAt || s('updatedAt') || '—'}</div></div>
      </div>
      <div className="desc">
        {s('description') || s('content') || '（无描述）'}
      </div>

      <div className="panel">
        <div className="panel-title">代码操作</div>
        <BranchForm identifier={cur?.identifier ?? ''} />
        <MrForm identifier={cur?.identifier ?? ''} subject={cur?.subject ?? ''} />
        <StatusForm workitemId={selectedId} />
      </div>

      <div className="panel">
        <div className="panel-title">评论 <span className="count">{comments.length}</span></div>
        {(comments as Record<string, unknown>[]).map((c, i) => (
          <div key={i} className="trace-item">
            <div className="grow">
              <span style={{ color: 'var(--ink-0)' }}>{String((c.author as Record<string, unknown>)?.name ?? c.creator ?? '—')}</span>
              <span style={{ color: 'var(--ink-2)' }}> · {String(c.createdAt ?? c.gmtCreate ?? '')}</span>
              <div style={{ color: 'var(--ink-1)', whiteSpace: 'pre-wrap' }}>{String(c.content ?? '')}</div>
            </div>
          </div>
        ))}
        {!comments.length && <div className="empty" style={{ padding: 12 }}>无评论</div>}
      </div>
      {settings?.allowWriteOps === false && (
        <div className="mono muted" style={{ padding: '0 16px 16px', fontSize: 11 }}>
          写操作未开启：设置 → 允许写操作
        </div>
      )}
    </div>
  );
}

function RepoSelect({ repos, value, onChange }: { repos: number[]; value: number; onChange: (v: number) => void }) {
  if (repos.length < 2) return null;
  return (
    <select className="select" value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ marginBottom: 8 }}>
      {repos.map((id) => (
        <option key={id} value={id}>仓库 #{id}</option>
      ))}
    </select>
  );
}

function BranchForm({ identifier }: { identifier: string }) {
  const { settings, setToast, loadTrace } = useApp();
  const repos = settings?.watchedRepos ?? [];
  const [repoId, setRepoId] = useState(repos[0] ?? 0);
  const [name, setName] = useState(identifier ? `feature/${identifier}` : '');
  const [refName, setRefName] = useState('master');
  return (
    <details className="trace-sec">
      <summary style={{ cursor: 'pointer', fontSize: 12, margin: '6px 0' }}>从需求创建分支</summary>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '8px 0' }}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="feature/REQ-xxx" />
        <input className="input" value={refName} onChange={(e) => setRefName(e.target.value)} placeholder="基准分支" />
      </div>
      <RepoSelect repos={repos} value={repoId} onChange={setRepoId} />
      <WriteOpButton
        label="建分支"
        onAction={async () => {
          try {
            await api.createBranch(repoId, name, refName);
            setToast({ text: `分支已创建：${name}`, kind: 'ok' });
            void loadTrace();
          } catch (e) { setToast({ text: String(e), kind: 'fail' }); }
        }}
      />
    </details>
  );
}

function MrForm({ identifier, subject }: { identifier: string; subject: string }) {
  const { settings, setToast, loadTrace } = useApp();
  const repos = settings?.watchedRepos ?? [];
  const [repoId, setRepoId] = useState(repos[0] ?? 0);
  const [src, setSrc] = useState(identifier ? `feature/${identifier}` : '');
  const [tgt, setTgt] = useState('master');
  return (
    <details className="trace-sec">
      <summary style={{ cursor: 'pointer', fontSize: 12, margin: '6px 0' }}>发起合并请求</summary>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '8px 0' }}>
        <input className="input" value={src} onChange={(e) => setSrc(e.target.value)} placeholder="源分支" />
        <input className="input" value={tgt} onChange={(e) => setTgt(e.target.value)} placeholder="目标分支" />
      </div>
      <RepoSelect repos={repos} value={repoId} onChange={setRepoId} />
      <WriteOpButton
        label="建 MR"
        onAction={async () => {
          try {
            await api.createMergeRequest({
              repoId, title: `${identifier} ${subject}`.trim(), sourceBranch: src, targetBranch: tgt,
              description: `关联工作项：${identifier}`,
            });
            setToast({ text: 'MR 已创建', kind: 'ok' });
            void loadTrace();
          } catch (e) { setToast({ text: String(e), kind: 'fail' }); }
        }}
      />
    </details>
  );
}

function StatusForm({ workitemId }: { workitemId: string }) {
  const { setToast } = useApp();
  const [st, setSt] = useState('');
  return (
    <details className="trace-sec">
      <summary style={{ cursor: 'pointer', fontSize: 12, margin: '6px 0' }}>回写工作项状态</summary>
      <div style={{ display: 'flex', gap: 8, padding: '8px 0' }}>
        <input className="input" value={st} onChange={(e) => setSt(e.target.value)} placeholder="statusIdentifier" />
      </div>
      <WriteOpButton
        label="回写状态"
        onAction={async () => {
          try {
            await api.updateWorkitemStatus(workitemId, st);
            setToast({ text: '状态已回写', kind: 'ok' });
          } catch (e) { setToast({ text: String(e), kind: 'fail' }); }
        }}
      />
    </details>
  );
}
