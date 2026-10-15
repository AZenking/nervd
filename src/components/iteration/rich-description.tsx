import { useEffect, useMemo, useState } from 'react';
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
}

/**
 * 需求描述区：
 * - 结合 Tiptap 渲染高质量排版（标题、段落、列表、代码块、引用）
 * - 附件图片内联直显（走 Rust PAT 鉴权代理）
 * - 支持 Linear 风格行内原地编辑（受控于写操作门控，⌘+Enter 快速保存）
 */
export function RichDescription({ raw, workitemId, className }: RichDescriptionProps) {
  const { settings, setToast, select, selectedId } = useApp();
  const allowWrite = settings?.allowWriteOps ?? false;

  const initialHtml = useMemo(() => extractRichHtml(raw), [raw]);
  const [isEditing, setIsEditing] = useState(false);
  const [draftHtml, setDraftHtml] = useState(initialHtml);
  const [saving, setSaving] = useState(false);

  // 外部 raw 更新时同步重置编辑草稿
  useEffect(() => {
    setDraftHtml(initialHtml);
    setIsEditing(false);
  }, [initialHtml, workitemId]);

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
    setDraftHtml(initialHtml);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!workitemId || saving) return;
    if (!allowWrite) {
      setToast({ text: '保存失败：未开启写操作权限', kind: 'fail' });
      return;
    }
    setSaving(true);
    try {
      await api.updateWorkitem(workitemId, {
        description: draftHtml,
        formatType: 'RICHTEXT',
      });
      setToast({ text: '需求描述已保存', kind: 'ok' });
      setIsEditing(false);
      // 刷新详情
      if (selectedId === workitemId) {
        void select(workitemId);
      }
    } catch (e) {
      setToast({ text: `保存失败：${String(e)}`, kind: 'fail' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn('group/desc relative w-full', className)}>
      {isEditing ? (
        <div className="flex flex-col gap-3 rounded-md border border-border/80 bg-background/50 p-3">
          <RichEditor
            content={draftHtml}
            editable={true}
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
          {workitemId && allowWrite && (
            <div className="absolute right-0 -top-7 opacity-0 group-hover/desc:opacity-100 transition-opacity">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={handleStartEdit}
                className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                title="编辑描述"
              >
                <PencilIcon className="size-3 mr-1" />
                编辑
              </Button>
            </div>
          )}
          {initialHtml ? (
            <RichEditor
              content={initialHtml}
              editable={false}
              className="cursor-default"
            />
          ) : (
            <div
              className={cn(
                'text-sm text-muted-foreground/70 py-2',
                workitemId && allowWrite && 'cursor-pointer hover:text-foreground/80',
              )}
              onClick={workitemId && allowWrite ? handleStartEdit : undefined}
            >
              {workitemId && allowWrite ? '点击此处添加详细需求描述…' : '（无描述）'}
            </div>
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
