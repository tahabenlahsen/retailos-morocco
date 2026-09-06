"use client"

import { useTranslation } from "react-i18next"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/misc"
import { EmptyState } from "./empty-state"
import { cn } from "@/utils/cn"

export interface Column<T> {
  key: string
  header: React.ReactNode
  cell: (row: T) => React.ReactNode
  className?: string
  /** Hide on small screens */
  hideOnMobile?: boolean
  align?: "start" | "end" | "center"
}

interface Props<T> {
  columns: Column<T>[]
  rows: T[] | undefined
  rowKey: (row: T) => string
  loading?: boolean
  emptyTitle: string
  emptyDescription?: string
  emptyAction?: React.ReactNode
  onRowClick?: (row: T) => void
  pagination?: { page: number; pageSize: number; total: number; onPageChange: (p: number) => void }
  selectable?: { selected: Set<string>; onToggle: (id: string) => void; onToggleAll: (ids: string[]) => void }
  footer?: React.ReactNode
  dense?: boolean
}

export function DataTable<T>({ columns, rows, rowKey, loading, emptyTitle, emptyDescription, emptyAction, onRowClick, pagination, selectable, footer, dense }: Props<T>) {
  const { t } = useTranslation()
  const allIds = rows?.map(rowKey) ?? []
  const allSelected = selectable && allIds.length > 0 && allIds.every((id) => selectable.selected.has(id))
  const pad = dense ? "px-3 py-2" : "px-4 py-3"

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              {selectable ? (
                <th className={cn(pad, "w-10")}>
                  <input type="checkbox" className="h-4 w-4 accent-primary cursor-pointer" checked={!!allSelected} onChange={() => selectable.onToggleAll(allIds)} aria-label="Select all" />
                </th>
              ) : null}
              {columns.map((c) => (
                <th key={c.key} className={cn(pad, "text-start font-medium whitespace-nowrap", c.hideOnMobile && "hidden md:table-cell", c.align === "end" && "text-end", c.align === "center" && "text-center", c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && !rows
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {selectable ? <td className={pad}><Skeleton className="h-4 w-4" /></td> : null}
                    {columns.map((c) => (
                      <td key={c.key} className={cn(pad, c.hideOnMobile && "hidden md:table-cell")}><Skeleton className="h-4 w-full max-w-[160px]" /></td>
                    ))}
                  </tr>
                ))
              : rows?.map((row) => {
                  const id = rowKey(row)
                  return (
                    <tr key={id} className={cn("transition-colors", onRowClick && "cursor-pointer hover:bg-accent/50", selectable?.selected.has(id) && "bg-accent/40")} onClick={onRowClick ? () => onRowClick(row) : undefined}>
                      {selectable ? (
                        <td className={pad} onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" className="h-4 w-4 accent-primary cursor-pointer" checked={selectable.selected.has(id)} onChange={() => selectable.onToggle(id)} aria-label="Select row" />
                        </td>
                      ) : null}
                      {columns.map((c) => (
                        <td key={c.key} className={cn(pad, "align-middle", c.hideOnMobile && "hidden md:table-cell", c.align === "end" && "text-end", c.align === "center" && "text-center", c.className)}>
                          {c.cell(row)}
                        </td>
                      ))}
                    </tr>
                  )
                })}
          </tbody>
          {footer ? <tfoot className="bg-muted/30 font-medium">{footer}</tfoot> : null}
        </table>
      </div>
      {!loading && rows && rows.length === 0 ? <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} /> : null}
      {pagination && pagination.total > pagination.pageSize ? (
        <div className="flex items-center justify-between border-t px-4 py-2 text-sm text-muted-foreground">
          <span>{t("common.showing", { from: (pagination.page - 1) * pagination.pageSize + 1, to: Math.min(pagination.page * pagination.pageSize, pagination.total), total: pagination.total })}</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" disabled={pagination.page <= 1} onClick={() => pagination.onPageChange(pagination.page - 1)} aria-label={t("common.previous")}><ChevronLeft className="rtl:rotate-180" /></Button>
            <span className="px-2">{t("common.page", { page: pagination.page })}</span>
            <Button variant="ghost" size="icon-sm" disabled={pagination.page * pagination.pageSize >= pagination.total} onClick={() => pagination.onPageChange(pagination.page + 1)} aria-label={t("common.next")}><ChevronRight className="rtl:rotate-180" /></Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
