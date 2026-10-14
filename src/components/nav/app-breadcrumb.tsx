import React from 'react';
import { ArrowLeftIcon } from 'lucide-react';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { SETTINGS_SECTIONS } from '../settings/sections';

/** 应用面包屑（UX A2）：可点层级 + 需求详情的 父 › 子 链；页头（breadcrumb 槽）与顶栏共用 */
export function AppBreadcrumb() {
  const { view, iterationKey, chain, history, setView, back, settingsSection } = useUi();

  const crumbLink = (label: string, onClick: () => void) => (
    <BreadcrumbItem key={`link-${label}`}>
      <BreadcrumbLink className="cursor-pointer" render={<button type="button" onClick={onClick} />}>
        {label}
      </BreadcrumbLink>
    </BreadcrumbItem>
  );
  const crumbPage = (label: string) => (
    <BreadcrumbItem key={`page-${label}`}>
      <BreadcrumbPage className="max-w-48 truncate font-medium">{label}</BreadcrumbPage>
    </BreadcrumbItem>
  );
  const sep = (key: string) => <BreadcrumbSeparator key={`separator-${key}`} />;

  const items: React.ReactNode[] = [];
  if (view === 'iteration' || view === 'requirement') {
    items.push(crumbLink('迭代', () => setView('iteration')), sep('root'));
    if (view === 'iteration') {
      items.push(crumbPage(iterationKey));
    } else {
      // 层级链：父 › 当前（末位）；点击父级面包屑回到对应详情
      if (!chain.length) {
        items.push(crumbPage('详情'));
      } else {
        chain.forEach((crumb, index) => {
          if (index > 0) items.push(sep(String(index)));
          if (index === chain.length - 1) {
            items.push(crumbPage(crumb.identifier));
          } else {
            items.push(crumbLink(crumb.identifier, () => {
              const nextChain = chain.slice(0, index + 1);
              useUi.setState({ chain: nextChain });
              void useApp.getState().select(crumb.workitemId);
            }));
          }
        });
      }
    }
  } else if (view === 'integration') {
    items.push(crumbPage('集成分支'));
  } else if (view === 'overview') {
    items.push(crumbPage('总览'));
  } else {
    items.push(crumbPage('设置'));
    // 设置页 breadcrumb 追加当前分区，与左侧设置菜单联动
    const section = SETTINGS_SECTIONS.find((s) => s.value === settingsSection);
    if (section) {
      items.push(sep('settings-section'));
      items.push(crumbPage(section.label));
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-6 text-muted-foreground"
              aria-label="后退（⌘←）"
              disabled={!history.length}
              onClick={back}
            />
          }
        >
          <ArrowLeftIcon data-icon="inline-start" />
        </TooltipTrigger>
        <TooltipContent>后退（⌘←）</TooltipContent>
      </Tooltip>
      <Breadcrumb>
        <BreadcrumbList>{items}</BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
