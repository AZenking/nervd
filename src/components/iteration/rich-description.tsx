import { useEffect, useMemo, useState } from 'react';
import * as api from '@/lib/api';
import { extractRichImageUrls, imagePlaceholderLine, richTextToPlain } from '@/lib/richtext';

/** 描述区：纯文本 + 附件图片内联直显（代理失败/未返回时保留 📎 占位行） */
export function RichDescription({ raw }: { raw: unknown }) {
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
    return () => { alive = false; };
  }, [images]);

  const resolvedPlaceholders = useMemo(
    () => new Set(images.filter((img) => resolved[img.url]).map((img) => imagePlaceholderLine(img.name))),
    [images, resolved],
  );
  const text = useMemo(() => {
    const t = richTextToPlain(raw);
    if (!resolvedPlaceholders.size) return t;
    return t.split('\n').filter((line) => !resolvedPlaceholders.has(line.trim())).join('\n');
  }, [raw, resolvedPlaceholders]);

  return (
    <div>
      <div className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground/85">{text || '（无描述）'}</div>
      {images.filter((img) => resolved[img.url]).length > 0 && (
        <div className="mt-4 flex flex-col items-start gap-3">
          {images.filter((img) => resolved[img.url]).map((img) => (
            <img key={img.url} src={resolved[img.url]} alt={img.name} title={img.name} className="h-auto max-h-64 w-auto max-w-full border border-border" />
          ))}
        </div>
      )}
    </div>
  );
}
