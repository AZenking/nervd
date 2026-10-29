import { useEffect, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { markdownToHtml } from '@/lib/richtext';
import {
  BoldIcon,
  ItalicIcon,
  StrikethroughIcon,
  CodeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  UndoIcon,
  RedoIcon,
} from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

export interface RichEditorProps {
  content?: string;
  placeholder?: string;
  editable?: boolean;
  autofocus?: boolean;
  className?: string;
  editorClassName?: string;
  showToolbar?: boolean;
  onChange?: (html: string) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
}

/**
 * Linear 风格现代无头富文本编辑器（基于 Tiptap / ProseMirror）
 * 支持只读渲染、行内编辑、快捷键 (⌘+Enter)、原生 Markdown 快捷规则与多级排版
 */
export function RichEditor({
  content = '',
  placeholder = '输入内容，支持 Markdown 语法与快捷指令…',
  editable = false,
  autofocus = false,
  className,
  editorClassName,
  showToolbar = false,
  onChange,
  onSubmit,
  onCancel,
}: RichEditorProps) {
  const normalizedContent = useMemo(() => markdownToHtml(content), [content]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        codeBlock: {
          HTMLAttributes: {
            class: 'rounded-md bg-muted/60 p-3 my-2 font-mono text-xs border border-border overflow-x-auto text-foreground',
          },
        },
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: normalizedContent,
    editable,
    autofocus,
    editorProps: {
      attributes: {
        class: cn(
          'outline-none focus:outline-none text-sm leading-relaxed text-foreground/90 selection:bg-primary/20',
          editable ? 'min-h-[4rem]' : 'min-h-0',
          '[&_p]:mb-2 [&_p:last-child]:mb-0',
          '[&_h1]:text-lg [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-foreground',
          '[&_h2]:text-base [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-foreground',
          '[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:tracking-tight [&_h3]:mt-2.5 [&_h3]:mb-1 [&_h3]:text-foreground',
          '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ul]:space-y-1',
          '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_ol]:space-y-1',
          '[&_li]:leading-normal',
          '[&_blockquote]:border-l-2 [&_blockquote]:border-primary/50 [&_blockquote]:pl-3 [&_blockquote]:my-2 [&_blockquote]:text-muted-foreground [&_blockquote]:italic',
          '[&_code:not(pre_code)]:font-mono [&_code:not(pre_code)]:text-xs [&_code:not(pre_code)]:bg-muted [&_code:not(pre_code)]:px-1.5 [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:border [&_code:not(pre_code)]:border-border/60',
          '[&_hr]:my-4 [&_hr]:border-t [&_hr]:border-border/70',
          '[&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)] [&_.is-editor-empty:first-child]:before:text-muted-foreground/60 [&_.is-editor-empty:first-child]:before:float-left [&_.is-editor-empty:first-child]:before:pointer-events-none [&_.is-editor-empty:first-child]:before:h-0',
          editorClassName,
        ),
      },
      handleKeyDown: (_, event) => {
        if (event.isComposing) return false;
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          if (onSubmit) {
            event.preventDefault();
            event.stopPropagation();
            onSubmit();
            return true;
          }
        }
        if (event.key === 'Escape' && onCancel) {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
  });

  // 外部 content 属性变化且非用户编辑中时，平滑同步内容
  useEffect(() => {
    if (!editor) return;
    const currentHtml = editor.getHTML();
    if (normalizedContent !== currentHtml && !editor.isFocused) {
      editor.commands.setContent(normalizedContent || '', { emitUpdate: false });
    }
  }, [normalizedContent, editor]);

  // 同步可编辑态
  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editable, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className={cn('relative w-full', className)}>
      {editable && showToolbar && (
        <div className="flex flex-wrap items-center gap-0.5 pb-2 mb-2 border-b border-border/60">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={cn(editor.isActive('bold') && 'bg-accent text-accent-foreground')}
            title="加粗 (⌘+B)"
          >
            <BoldIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={cn(editor.isActive('italic') && 'bg-accent text-accent-foreground')}
            title="斜体 (⌘+I)"
          >
            <ItalicIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={cn(editor.isActive('strike') && 'bg-accent text-accent-foreground')}
            title="删除线"
          >
            <StrikethroughIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={cn(editor.isActive('code') && 'bg-accent text-accent-foreground')}
            title="行内代码"
          >
            <CodeIcon />
          </Button>

          <div className="h-3.5 w-px bg-border/60 mx-1" />

          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={cn(editor.isActive('heading', { level: 1 }) && 'bg-accent text-accent-foreground')}
            title="一级标题 (# + 空格)"
          >
            <Heading1Icon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={cn(editor.isActive('heading', { level: 2 }) && 'bg-accent text-accent-foreground')}
            title="二级标题 (## + 空格)"
          >
            <Heading2Icon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={cn(editor.isActive('heading', { level: 3 }) && 'bg-accent text-accent-foreground')}
            title="三级标题 (### + 空格)"
          >
            <Heading3Icon />
          </Button>

          <div className="h-3.5 w-px bg-border/60 mx-1" />

          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={cn(editor.isActive('bulletList') && 'bg-accent text-accent-foreground')}
            title="无序列表 (- + 空格)"
          >
            <ListIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={cn(editor.isActive('orderedList') && 'bg-accent text-accent-foreground')}
            title="有序列表 (1. + 空格)"
          >
            <ListOrderedIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={cn(editor.isActive('blockquote') && 'bg-accent text-accent-foreground')}
            title="引用块 (> + 空格)"
          >
            <QuoteIcon />
          </Button>

          <div className="h-3.5 w-px bg-border/60 mx-1 ml-auto" />

          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="撤销 (⌘+Z)"
          >
            <UndoIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="重做 (⌘+⇧+Z)"
          >
            <RedoIcon />
          </Button>
        </div>
      )}

      <EditorContent editor={editor} />
    </div>
  );
}
