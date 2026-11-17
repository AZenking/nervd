import * as React from "react"
import { Table as HeroUITable } from "@heroui/react"

/**
 * HeroUI Table 薄封装（DESIGN 第三部分 B：列表 / 表格唯一落地件）。
 *
 * 约定：
 * - 业务层只从这里取 `Table`，不再 `import { Table } from '@heroui/react'`；
 * - 行密度、表头微字阶、hover 底色统一由 `theme.css` 的 `.table__*` 承载，
 *   调用点不写 `px-3 py-2.5 / border-b / hover:bg-surface-secondary` 这类逐格样式；
 * - 空态优先用 `Table.Body renderEmptyState`，表格内保留行结构时用 `TableEmptyRow`。
 */
const Table = Object.assign(HeroUITable, {
  Root: HeroUITable,
  ScrollContainer: HeroUITable.ScrollContainer,
  Content: HeroUITable.Content,
  Header: HeroUITable.Header,
  Column: HeroUITable.Column,
  Body: HeroUITable.Body,
  Row: HeroUITable.Row,
  Cell: HeroUITable.Cell,
  Footer: HeroUITable.Footer,
})

const TableRoot = HeroUITable
const TableScrollContainer = HeroUITable.ScrollContainer
const TableContent = HeroUITable.Content
const TableHeader = HeroUITable.Header
const TableColumn = HeroUITable.Column
const TableBody = HeroUITable.Body
const TableRow = HeroUITable.Row
const TableCell = HeroUITable.Cell
const TableFooter = HeroUITable.Footer

export interface TableEmptyRowProps {
  /** 表头列数：空态行需跨满整行 */
  columns: number
  /** 空态文案（默认「暂无数据」） */
  children?: React.ReactNode
  className?: string
}

/**
 * 表格空态行：保持 `Table.Body > Row > Cell` 结构，避免整表被替换后表头抖动。
 * 需要整块空态（含图标/操作）时优先用 `Table.Body renderEmptyState` + `EmptyHint`。
 */
function TableEmptyRow({ columns, children, className }: TableEmptyRowProps) {
  return (
    <TableRow id="__empty__" className={className}>
      <TableCell
        colSpan={columns}
        className="h-20 text-center text-xs text-muted-foreground"
      >
        {children ?? "暂无数据"}
      </TableCell>
    </TableRow>
  )
}

export {
  Table,
  TableRoot,
  TableScrollContainer,
  TableContent,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  TableFooter,
  TableEmptyRow,
}

export type {
  TableRootProps,
  TableScrollContainerProps,
  TableContentProps,
  TableHeaderProps,
  TableColumnProps,
  TableBodyProps,
  TableRowProps,
  TableCellProps,
} from "@heroui/react"