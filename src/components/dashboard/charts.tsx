"use client"

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { useTranslation } from "react-i18next"
import { useLocale } from "@/components/providers/locale-provider"

const COLORS = ["oklch(0.52 0.16 155)", "oklch(0.6 0.15 250)", "oklch(0.75 0.16 75)", "oklch(0.58 0.2 27)", "oklch(0.6 0.12 300)"]

function useFmt() {
  const { formatMoney, formatNumber, formatDate } = useLocale()
  return { money: (v: number) => formatMoney(v), num: (v: number) => formatNumber(v), day: (d: string) => formatDate(new Date(d + "T00:00:00"), { day: "2-digit", month: "short" }) }
}

const tooltipStyle = { contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--popover-foreground)" }, labelStyle: { color: "var(--muted-foreground)" } }

export function SalesTrendChart({ data }: { data: { date: string; revenue: number; profit: number; expenses: number; count: number }[] }) {
  const { t } = useTranslation()
  const f = useFmt()
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.35} /><stop offset="95%" stopColor={COLORS[0]} stopOpacity={0} /></linearGradient>
          <linearGradient id="prof" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS[1]} stopOpacity={0.3} /><stop offset="95%" stopColor={COLORS[1]} stopOpacity={0} /></linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={f.day} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" minTickGap={24} />
        <YAxis tickFormatter={(v) => f.num(v)} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={56} />
        <Tooltip {...tooltipStyle} formatter={(v, name) => [f.money(Number(v)), String(name)]} labelFormatter={(l) => f.day(String(l))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="revenue" name={t("dashboard.revenue")} stroke={COLORS[0]} fill="url(#rev)" strokeWidth={2} />
        <Area type="monotone" dataKey="profit" name={t("dashboard.grossProfit")} stroke={COLORS[1]} fill="url(#prof)" strokeWidth={2} />
        <Area type="monotone" dataKey="expenses" name={t("dashboard.expenses")} stroke={COLORS[3]} fill="transparent" strokeWidth={1.5} strokeDasharray="4 3" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function PaymentMethodsChart({ data }: { data: { method: string; amount: number; count: number }[] }) {
  const { t } = useTranslation()
  const f = useFmt()
  const rows = data.map((d) => ({ ...d, name: t(`pos.methods.${d.method}`) }))
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={rows} dataKey="amount" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3} strokeWidth={0}>
          {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip {...tooltipStyle} formatter={(v, name) => [f.money(Number(v)), String(name)]} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function TopProductsChart({ data }: { data: { product: { name: string }; revenue: number; quantity: number }[] }) {
  const { t } = useTranslation()
  const f = useFmt()
  const rows = data.map((d) => ({ name: d.product.name.length > 18 ? d.product.name.slice(0, 17) + "…" : d.product.name, revenue: d.revenue, quantity: d.quantity }))
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 34)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tickFormatter={(v) => f.num(v)} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
        <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
        <Tooltip {...tooltipStyle} formatter={(v, name) => [name === t("dashboard.revenue") ? f.money(Number(v)) : f.num(Number(v)), String(name)]} />
        <Bar dataKey="revenue" name={t("dashboard.revenue")} fill={COLORS[0]} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function SimpleBarChart({ data, xKey, yKey, name, money = true, color = COLORS[0] }: { data: Record<string, unknown>[]; xKey: string; yKey: string; name: string; money?: boolean; color?: string }) {
  const f = useFmt()
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" interval="preserveStartEnd" />
        <YAxis tickFormatter={(v) => f.num(v)} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={56} />
        <Tooltip {...tooltipStyle} formatter={(v) => [money ? f.money(Number(v)) : f.num(Number(v)), name]} />
        <Bar dataKey={yKey} name={name} fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
