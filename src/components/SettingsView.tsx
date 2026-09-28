import { useEffect, useState } from 'react';
import * as api from '../lib/api';
import { useApp } from '../store/app';
import type { Settings } from '../types';

export function SettingsView({ embedded = false }: { embedded?: boolean }) {
  const { settings, saveAll, setToast, connection } = useApp();
  const [pat, setPat] = useState('');
  const [form, setForm] = useState<Settings>({
    organizationId: '',
    defaultSpaceIdentifier: '',
    linkPattern: '(?:REQ|BUG|TASK)[-_]?(\\d+)',
    watchedRepos: [],
    allowWriteOps: false,
  });
  const [repos, setRepos] = useState<{ id: number; name: string; pathWithNamespace?: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      const { hasPat: _hasPat, ...rest } = settings;
      setForm(rest);
    }
  }, [settings]);

  const loadRepos = async () => {
    try {
      const list = await api.listRepos();
      setRepos(list);
    } catch (e) {
      setTestResult(`仓库列表获取失败：${String(e)}`);
    }
  };

  const test = async () => {
    setTestResult('测试中…');
    try {
      const orgs = await api.checkConnection();
      setTestResult(orgs.length
        ? `连接正常，可见组织：${orgs.map((o) => o.organizationName).slice(0, 3).join('、')}${orgs.length > 3 ? '…' : ''}`
        : '连接正常，但未返回组织（检查令牌权限）');
    } catch (e) {
      setTestResult(`连接失败：${String(e)}`);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveAll(form, pat.trim() || undefined);
      setToast({ text: '设置已保存', kind: 'ok' });
    } catch (e) {
      setToast({ text: `保存失败：${String(e)}`, kind: 'fail' });
    } finally {
      setSaving(false);
    }
  };

  const toggleRepo = (id: number) => {
    setForm((f) => ({
      ...f,
      watchedRepos: f.watchedRepos.includes(id)
        ? f.watchedRepos.filter((x) => x !== id)
        : [...f.watchedRepos, id],
    }));
  };

  const card = (
    <div className="settings-card">
      <h1>nervd 设置</h1>
      <p className="hint">
        个人访问令牌：云效网页 → 个人设置 → 个人访问令牌；组织 ID 在 devops.aliyun.com/organization/&lt;此处&gt;
      </p>

      <div className="field">
        <label>个人访问令牌 {settings?.hasPat && <span style={{ color: 'var(--sig-ok)' }}>[已保存]</span>}</label>
        <input className="input" type="password" value={pat} onChange={(e) => setPat(e.target.value)}
          placeholder={settings?.hasPat ? '已保存（留空则不修改）' : 'agp_…'} />
      </div>
      <div className="field">
        <label>组织 ID</label>
        <input className="input" value={form.organizationId} onChange={(e) => setForm({ ...form, organizationId: e.target.value })} placeholder="60de7a68…" />
      </div>
      <div className="field">
        <label>默认项目空间</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" value={form.defaultSpaceIdentifier} onChange={(e) => setForm({ ...form, defaultSpaceIdentifier: e.target.value })} placeholder="先保存令牌后拉取，或手填项目标识" />
          <button className="btn btn-sm" onClick={async () => {
            try {
              const list = await api.listProjects();
              setProjects(list);
              if (!list.length) setTestResult('未返回项目（检查令牌权限/组织）');
            } catch (e) { setTestResult(`项目拉取失败：${String(e)}`); }
          }}>拉取项目</button>
        </div>
        {projects.length > 0 && (
          <select className="select" style={{ marginTop: 6 }} value={form.defaultSpaceIdentifier}
            onChange={(e) => setForm({ ...form, defaultSpaceIdentifier: e.target.value })}>
            <option value="">— 选择项目 —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}（{p.id}）</option>)}
          </select>
        )}
      </div>
      <div className="field">
        <label>关联正则（分支/commit/MR 标题 → 工作项）</label>
        <input className="input" value={form.linkPattern} onChange={(e) => setForm({ ...form, linkPattern: e.target.value })} />
      </div>

      <div className="field">
        <label>追溯仓库（勾选后参与需求关联扫描）</label>
        <button className="btn btn-sm" onClick={() => void loadRepos()}>拉取仓库列表</button>
        <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--line)', padding: 6, marginTop: 6 }}>
          {repos.map((r) => (
            <label key={r.id} className="checkline">
              <input type="checkbox" checked={form.watchedRepos.includes(r.id)} onChange={() => toggleRepo(r.id)} />
              <span className="mono" style={{ fontSize: 11 }}>{r.pathWithNamespace || r.name}</span>
            </label>
          ))}
          {!repos.length && <div className="muted" style={{ fontSize: 11 }}>先保存令牌后拉取</div>}
        </div>
      </div>

      <label className="checkline">
        <input type="checkbox" checked={form.allowWriteOps} onChange={(e) => setForm({ ...form, allowWriteOps: e.target.checked })} />
        允许写操作（建分支 / MR / 合并 / 触发流水线 / 回写状态 —— 需写权限令牌）
      </label>

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="btn btn-primary" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存'}</button>
        <button className="btn" onClick={() => void test()}>测试连接</button>
        {connection === 'ok' && <span className="mono" style={{ color: 'var(--sig-ok)', alignSelf: 'center', fontSize: 11 }}>● 已连接</span>}
      </div>
      {testResult && <p className="mono" style={{ fontSize: 11, marginTop: 10, color: 'var(--ink-1)' }}>{testResult}</p>}
    </div>
  );

  if (embedded) return card;
  return (
    <>
      <div className="topbar">
        <span className="brand">nervd</span>
        <span className="meta">初始配置</span>
      </div>
      <div className="settings-wrap">{card}</div>
    </>
  );
}
