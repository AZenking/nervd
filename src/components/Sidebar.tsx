import { useMemo, useState } from 'react';
import { useApp } from '../store/app';
import type { Category } from '../types';

const CATS: { key: Category; label: string }[] = [
  { key: 'Req', label: '需求' },
  { key: 'Bug', label: '缺陷' },
  { key: 'Task', label: '任务' },
];

export function Sidebar() {
  const { category, setCategory, items, nextToken, loadingList, loadList, select, selectedId } = useApp();
  const [kw, setKw] = useState('');

  const filtered = useMemo(() => {
    const k = kw.trim().toLowerCase();
    if (!k) return items;
    return items.filter(
      (i) => i.subject.toLowerCase().includes(k) || i.identifier.toLowerCase().includes(k),
    );
  }, [items, kw]);

  return (
    <div className="pane" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="cat-tabs">
        {CATS.map((c) => (
          <button
            key={c.key}
            className={`cat-tab ${category === c.key ? 'active' : ''}`}
            onClick={() => void setCategory(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div style={{ padding: '8px 10px' }}>
        <input className="input" placeholder="搜索编号/标题…" value={kw} onChange={(e) => setKw(e.target.value)} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.map((it) => (
          <div
            key={it.workitemId || it.identifier}
            className={`list-row ${selectedId === it.workitemId ? 'selected' : ''}`}
            onClick={() => void select(it.workitemId)}
          >
            <div className="id">{it.identifier}</div>
            <div className="subject">{it.subject}</div>
            <div className="sub">
              <span>{it.status || '—'}</span>
              <span>{it.spaceName || ''}</span>
            </div>
          </div>
        ))}
        {!filtered.length && !loadingList && <div className="empty">无匹配工作项</div>}
      </div>
      <div style={{ padding: 8, display: 'flex', gap: 8 }}>
        <button className="btn btn-sm" onClick={() => void loadList(false)}>刷新</button>
        {nextToken && (
          <button className="btn btn-sm" onClick={() => void loadList(true)}>下一页</button>
        )}
        {loadingList && <span className="mono muted" style={{ fontSize: 11 }}>加载中…</span>}
      </div>
    </div>
  );
}
