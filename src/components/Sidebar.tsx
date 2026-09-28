import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { useApp } from '../store/app';
import type { Category } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
    <div className="flex h-full min-h-0 flex-col overflow-y-auto border-r border-line">
      <Tabs
        value={category}
        onValueChange={(v) => void setCategory(v as Category)}
        className="flex shrink-0 flex-col"
      >
        <TabsList variant="line" className="h-auto w-full border-b border-line bg-transparent p-0">
          {CATS.map((c) => (
            <TabsTrigger
              key={c.key}
              value={c.key}
              className="h-auto flex-1 justify-center py-2 text-xs text-ink-1 after:bg-sig-run hover:bg-bg-2 hover:text-ink-0 data-active:bg-bg-1 data-active:text-sig-run"
            >
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="shrink-0 px-2.5 py-2">
        <Input placeholder="搜索编号/标题…" value={kw} onChange={(e) => setKw(e.target.value)} className="h-7" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" role="list">
        {filtered.map((it) => (
          <div
            key={it.workitemId || it.identifier}
            role="listitem"
            className={cn(
              'cursor-pointer border-b border-line px-3 py-2 transition-colors',
              selectedId === it.workitemId
                ? 'bg-bg-3 shadow-[inset_2px_0_0_var(--primary)]'
                : 'hover:bg-bg-2',
            )}
            onClick={() => void select(it.workitemId)}
          >
            <div className="font-mono text-[11px] text-sig-run">{it.identifier}</div>
            <div className="truncate text-[12.5px] text-ink-0">{it.subject}</div>
            <div className="flex gap-2.5 font-mono text-[11px] text-ink-2">
              <span>{it.status || '—'}</span>
              <span>{it.spaceName || ''}</span>
            </div>
          </div>
        ))}
        {!filtered.length && !loadingList && (
          <div className="py-10 text-center font-mono text-xs text-ink-2">无匹配工作项</div>
        )}
      </div>

      <div className="flex shrink-0 gap-2 p-2">
        <Button variant="outline" size="sm" onClick={() => void loadList(false)}>
          刷新
        </Button>
        {nextToken && (
          <Button variant="outline" size="sm" onClick={() => void loadList(true)}>
            下一页
          </Button>
        )}
        {loadingList && <span className="self-center font-mono text-[11px] text-ink-2">加载中…</span>}
      </div>
    </div>
  );
}
