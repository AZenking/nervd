import { CheckIcon } from 'lucide-react';
import { Chip } from '@/components/ui/chip';
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
    bg: 'bg-primary/10',
    text: 'text-primary',
    border: 'border-primary/30',
  },
  后端: {
    bg: 'bg-(--sticker-purple-deep)/10',
    text: 'text-(--sticker-purple-deep) dark:text-(--sticker-purple)',
    border: 'border-(--sticker-purple-deep)/30',
  },
  自测: {
    bg: 'bg-success/10',
    text: 'text-success',
    border: 'border-success/30',
  },
  文档: {
    bg: 'bg-warning/10',
    text: 'text-warning',
    border: 'border-warning/30',
  },
  运维: {
    bg: 'bg-(--sticker-pink)/10',
    text: 'text-(--sticker-pink)',
    border: 'border-(--sticker-pink)/30',
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
            className="inline-flex cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => toggle(tag)}
          >
            <Chip
              size="sm"
              variant={isSelected ? 'soft' : 'secondary'}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono font-medium transition-all',
                isSelected
                  ? cn(color.bg, color.text, color.border, 'font-semibold')
                  : 'border-border/50 bg-background/50 text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {isSelected && <CheckIcon className="size-3" />}
              <span>{tag}</span>
            </Chip>
          </button>
        );
      })}
    </div>
  );
}
