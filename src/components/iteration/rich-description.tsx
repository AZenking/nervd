import { useEffect, useMemo, useRef, useState } from 'react';
import { PencilIcon, CheckIcon, XIcon, Loader2Icon } from 'lucide-react';
import * as api from '@/lib/api';
import { extractRichHtml, extractRichImageUrls } from '@/lib/richtext';
import { RichEditor } from '@/components/ui/rich-editor';
import { Button } from '@/components/ui/button';
import { useApp } from '@/store/app';
import { cn } from '@/lib/utils';

export interface RichDescriptionProps {
  raw: unknown;
  workitemId?: string;
  className?: string;
  isEditing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  onSaved?: (newHtml: string) => void;
}

/**
 * 需求描述区：
 * - 结合 Tiptap 渲染高质量排版（标题、段落、列表、代码块、引用）
 * - 附件图片内联直显（走 Rust PAT 鉴权代理）
 * - 支持 Linear 风格行内原地编辑（受控于写操作门控，⌘+Enter 快速保存，乐观更新无大刷）
 */
export function RichDescription({
  raw,
  workitemId,
  className,
  isEditing: isEditingProp,
  onEditingChange,
  onSaved,
}: RichDescriptionProps) {
  const { settings, setToast, updateWorkitemDescriptionOptimistic } = useApp();
  const allowWrite = settings?.allowWriteOps ?? false;

  const initialHtml = useMemo(() => extractRichHtml(raw), [raw]);
  const [internalEditing, setInternalEditing] = useState(false);
  const isEditing = isEditingProp !== undefined ? isEditingProp : internalEditing;

  const setIsEditing = (val: boolean) => {
    setInternalEditing(val);
    onEditingChange?.(val);
  };

  const [draftHtml, setDraftHtml] = useState(initialHtml);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const currentId = useRef(workitemId);
  currentId.current = workitemId;

  // Only changing workitems discards the edit session. Optimistic raw updates must not.
  useEffect(() => {
    setDraftHtml(initialHtml);
    setIsEditing(false);
  }, [workitemId]);

  useEffect(() => {
    if (!isEditing) setDraftHtml(initialHtml);
  }, [initialHtml, isEditing]);

  // 当外部 isEditing 变为 true 时同步当前最新 initialHtml
  useEffect(() => {
    if (isEditing) {
      setDraftHtml(initialHtml);
    }
  }, [isEditing]);

  // 附件图片代理加载（devops 鉴权）
  const images = useMemo(() => extractRichImageUrls(raw), [raw]);
  const [resolved, setResolved] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    setResolved({});
    if (!images.length) return;
    void Promise.all(
      images.map(async (img): Promise<[string, string] | null> => {
        try {
          const dataUrl = await api.proxyWorkitemFile(img.url);
          return [img.url, dataUrl];
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (!alive) return;
      const next: Record<string, string> = {};
      for (const r of results) if (r) next[r[0]] = r[1];
      setResolved(next);
    });
    return () => {
      alive = false;
    };
  }, [images]);

  const handleStartEdit = () => {
    if (!workitemId) return;
    if (!allowWrite) {
      setToast({ text: '当前处于只读模式，请在「设置 → 安全」中开启允许写操作', kind: 'fail' });
      return;
    }
    setDraftHtml(initialHtml);
    setIsEditing(true);
  };

  const handleCancel = () => {
    if (savingRef.current) return;
    setDraftHtml(initialHtml);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!workitemId || savingRef.current) return;
    if (!allowWrite) {
      setToast({ text: '保存失败：未开启写操作权限', kind: 'fail' });
      return;
    }
    savingRef.current = true;
    setSaving(true);
    const submittedId = workitemId;
    try {
      const ok = await updateWorkitemDescriptionOptimistic(workitemId, draftHtml);
      if (ok && currentId.current === submittedId) {
        setToast({ text: '需求描述已保存', kind: 'ok' });
        setIsEditing(false);
        onSaved?.(draftHtml);
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className={cn('group/desc relative w-full', className)}>
      {isEditing ? (
        <div className="flex flex-col gap-3 rounded-md border border-border/80 bg-background/50 p-3">
          <RichEditor
            content={draftHtml}
            editable={!saving}
            showToolbar={true}
            autofocus={true}
            placeholder="输入需求描述，支持 Markdown 语法与快捷指令…"
            onChange={setDraftHtml}
            onSubmit={handleSave}
            onCancel={handleCancel}
          />
          <div className="flex items-center justify-between pt-2 border-t border-border/60">
            <span className="text-[11px] text-muted-foreground">
              按 <kbd className="font-mono px-1 py-0.5 rounded bg-muted text-[10px]">⌘ + Enter</kbd> 保存，
              <kbd className="font-mono px-1 py-0.5 rounded bg-muted text-[10px]">Esc</kbd> 取消
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={handleCancel}
                disabled={saving}
              >
                <XIcon className="size-3 mr-1" />
                取消
              </Button>
              <Button
                type="button"
                variant="default"
                size="xs"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <Loader2Icon className="size-3 mr-1 animate-spin" />
                ) : (
                  <CheckIcon className="size-3 mr-1" />
                )}
                保存描述
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative">
          {initialHtml ? (
            <div className="group/desc relative">
              {workitemId && allowWrite && isEditingProp === undefined && (
                <div className="absolute right-0 top-0 flex items-center gap-1 opacity-60 group-hover/desc:opacity-100 transition-opacity">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={handleStartEdit}
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground bg-background/80 backdrop-blur-xs border border-border/60 shadow-2xs"
                    title="编辑描述 (双击正文亦可快速编辑)"
                  >
                    <PencilIcon className="size-3 mr-1" />
                    编辑
                  </Button>
                </div>
              )}
              <div
                className={cn(
                  'rounded-md transition-colors p-1.5 -m-1.5',
                  workitemId && allowWrite && 'hover:bg-muted/15 cursor-text',
                )}
                onDoubleClick={workitemId && allowWrite ? handleStartEdit : undefined}
                title={workitemId && allowWrite ? '双击快速编辑描述' : undefined}
              >
                <RichEditor
                  content={initialHtml}
                  editable={false}
                  className="cursor-default"
                />
              </div>
            </div>
          ) : (
            workitemId && allowWrite ? (
              <div
                role="button"
                tabIndex={0}
                onClick={handleStartEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleStartEdit();
                  }
                }}
                className="flex items-center gap-2 rounded-md border border-dashed border-border/80 px-3 py-2 text-xs text-muted-foreground/80 hover:border-primary/50 hover:bg-muted/15 hover:text-foreground transition-all cursor-pointer group/placeholder focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                title="点击添加需求描述"
              >
                <PencilIcon className="size-3 shrink-0 group-hover/placeholder:text-primary transition-colors" />
                <span>暂无描述，点击添加…</span>
              </div>
            ) : (
              <div className="py-0.5 text-xs text-muted-foreground/50">暂无描述</div>
            )
          )}

          {images.filter((img) => resolved[img.url]).length > 0 && (
            <div className="mt-4 flex flex-col items-start gap-3">
              {images.filter((img) => resolved[img.url]).map((img) => (
                <img
                  key={img.url}
                  src={resolved[img.url]}
                  alt={img.name}
                  title={img.name}
                  className="h-auto max-h-80 w-auto max-w-full rounded border border-border shadow-xs"
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
