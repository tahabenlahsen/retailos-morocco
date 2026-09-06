"use client"

import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Sparkles, Send, User, Bot, ChevronDown, Info } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { RequirePermission } from "@/components/shared/require-permission"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/misc"
import { Card, CardContent } from "@/components/ui/card"
import { useLocale } from "@/components/providers/locale-provider"
import { useStore } from "@/components/providers/store-provider"
import { useApiError } from "@/hooks/use-api-error"
import { api } from "@/lib/api-client"
import { cn } from "@/utils/cn"

interface Answer { intent: string; period: { preset: string; from: string; to: string }; answer: string; data: unknown; source: "llm" | "template" }
interface Message { role: "user" | "assistant"; text: string; meta?: Answer }

export default function AiPage() {
  const { t } = useTranslation()
  const { locale, formatDate } = useLocale()
  const { storeId } = useStore()
  const { messageFor } = useApiError()
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [showData, setShowData] = useState<number | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const status = useQuery({ queryKey: ["ai", "status"], queryFn: () => api.get<{ llmConfigured: boolean; llmDegraded: boolean; lastErrorType: string | null }>("/api/ai") })
  const ask = useMutation({
    mutationFn: (question: string) => api.post<Answer>("/api/ai", { question, locale, storeId: storeId ?? undefined }),
    onSuccess: (a) => setMessages((m) => [...m, { role: "assistant", text: a.answer, meta: a }]),
    onError: (err) => setMessages((m) => [...m, { role: "assistant", text: messageFor(err) }]),
  })
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages, ask.isPending])

  const submit = (q?: string) => {
    const question = (q ?? input).trim()
    if (!question || ask.isPending) return
    setMessages((m) => [...m, { role: "user", text: question }])
    setInput("")
    ask.mutate(question)
  }
  const examples = ["ex1", "ex2", "ex3", "ex4", "ex5", "ex6"].map((k) => t(`ai.${k}`))

  return (
    <RequirePermission permission="ai.use">
      <PageHeader title={t("ai.title")} description={t("ai.subtitle")} />
      {status.data && (!status.data.llmConfigured || status.data.llmDegraded) ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-warning/15 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          {status.data.llmConfigured ? t("ai.llmDegraded", { reason: status.data.lastErrorType ?? "" }) : t("ai.llmNotConfigured")}
        </div>
      ) : null}

      <div className="flex flex-col h-[calc(100dvh-16rem)] min-h-[480px] rounded-xl border bg-card">
        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
          {!messages.length ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="rounded-full bg-primary/10 p-4 mb-4"><Sparkles className="h-8 w-8 text-primary" /></div>
              <p className="font-medium mb-4">{t("ai.examples")}</p>
              <div className="grid gap-2 sm:grid-cols-2 max-w-2xl w-full">{examples.map((ex) => <button key={ex} onClick={() => submit(ex)} className="rounded-lg border px-3 py-2 text-sm text-start hover:bg-accent transition-colors cursor-pointer">{ex}</button>)}</div>
            </div>
          ) : messages.map((m, i) => (
            <div key={i} className={cn("flex gap-3", m.role === "user" ? "justify-end" : "")}>
              {m.role === "assistant" ? <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center"><Bot className="h-4 w-4" /></div> : null}
              <div className={cn("max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap", m.role === "user" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm")}>
                {m.text}
                {m.meta ? (
                  <div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <Badge variant="outline" className="text-[10px]">{m.meta.intent}</Badge>
                    <span>{t("ai.period")}: {formatDate(m.meta.period.from)} → {formatDate(m.meta.period.to)}</span>
                    <span>· {t(`ai.source.${m.meta.source}`)}</span>
                    <button className="inline-flex items-center gap-0.5 hover:text-foreground cursor-pointer" onClick={() => setShowData(showData === i ? null : i)}>{t("ai.showData")} <ChevronDown className={cn("h-3 w-3 transition-transform", showData === i && "rotate-180")} /></button>
                  </div>
                ) : null}
                {m.meta && showData === i ? <pre className="mt-2 max-h-64 overflow-auto scrollbar-thin rounded-md bg-background p-2 text-[11px] text-foreground" dir="ltr">{JSON.stringify(m.meta.data, null, 2)}</pre> : null}
              </div>
              {m.role === "user" ? <div className="h-8 w-8 shrink-0 rounded-full bg-secondary flex items-center justify-center"><User className="h-4 w-4" /></div> : null}
            </div>
          ))}
          {ask.isPending ? <div className="flex gap-3"><div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center"><Bot className="h-4 w-4" /></div><div className="rounded-2xl bg-muted px-4 py-2.5 text-sm text-muted-foreground animate-pulse">{t("ai.thinking")}</div></div> : null}
          <div ref={endRef} />
        </div>
        <form className="border-t p-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <Textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={t("ai.placeholder")} rows={1} className="min-h-[44px] max-h-32 resize-none" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit() } }} />
          <Button type="submit" size="lg" disabled={!input.trim()} loading={ask.isPending}><Send className="h-4 w-4 rtl:rotate-180" /><span className="hidden sm:inline">{t("ai.ask")}</span></Button>
        </form>
      </div>
      {messages.length ? <Card className="mt-3"><CardContent className="p-3 flex flex-wrap gap-2">{examples.slice(0, 4).map((ex) => <Button key={ex} size="sm" variant="outline" onClick={() => submit(ex)} disabled={ask.isPending}>{ex}</Button>)}</CardContent></Card> : null}
    </RequirePermission>
  )
}
