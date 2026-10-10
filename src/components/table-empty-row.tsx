import type { LucideIcon } from 'lucide-react';
import { InboxIcon } from 'lucide-react';
import { TableCell, TableRow } from '@/components/ui/table';
import { EmptyHint } from './empty-hint';

/** 表格空态行：colSpan 占满 + 统一 EmptyHint（compact）形态，取代各表格手写的 colSpan 空态单元格 */
export function TableEmptyRow({
  colSpan,
  title,
  description,
  icon = InboxIcon,
}: {
  colSpan: number;
  title?: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-6 text-center">
        <EmptyHint compact icon={icon} title={title} description={description} className="inline-flex" />
      </TableCell>
    </TableRow>
  );
}
