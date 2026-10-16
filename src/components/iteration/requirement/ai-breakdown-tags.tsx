import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AiBreakdownTagsProps {
  availableTags?: string[];
  selectedTags: string[];
  onChange: (tags: string[]) => void;
  className?: string;
}

const DEFAULT_AVAILABLE_TAGS = ['前端', '后端', '自测', '文档', '运维'];

export const TAG_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  前端: {
    bg: 'bg-blue-500/10 dark:bg-blue-500/15',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-500/30',
  },
  后端: {
    bg: 'bg-purple-500/10 dark:bg-purple-500/15',
    text: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-500/30',
  },
  自测: {
    bg: 'bg-emerald-500/10 dark:bg-emerald-500/15',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-500/30',
  },
  文档: {
    bg: 'bg-amber-500/10 dark:bg-amber-500/15',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-500/30',
  },
  运维: {
    bg: 'bg-rose-500/10 dark:bg-rose-500/15',
    text: 'text-rose-600 dark:text-rose-400',
    border: 'border-rose-500/30',
  },
};

export function AiBreakdownTags({
  availableTags = DEFAULT_AVAILABLE_TAGS,
  selectedTags,
  onChange,
  className,
}: AiBreakdownTagsProps) {
  const toggle = (tag: string) => {
    if (selectedTags.includes(tag)) {
      if (selectedTags.length <= 1) return; // 至少保留一个
      onChange(selectedTags.filter((t) => t !== tag));
    } else {
      onChange([...selectedTags, tag]);
    }
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <span className="text-xs text-muted-foreground mr-1">拆解维度:</span>
      {availableTags.map((tag) => {
        const isSelected = selectedTags.includes(tag);
        const color = TAG_COLORS[tag] || {
          bg: 'bg-muted/50',
          text: 'text-foreground',
          border: 'border-border',
        };

        return (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-mono font-medium transition-all cursor-pointer border',
              isSelected
                ? cn(color.bg, color.text, color.border, 'shadow-xs font-semibold')
                : 'border-border/50 bg-background/50 text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {isSelected && <CheckIcon className="size-3" />}
            {tag}
          </button>
        );
      })}
    </div>
  );
}
