"use client"

import { useEffect } from "react"
import { useForm, type DefaultValues, type FieldValues, type Path } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import type { z } from "zod"
import { useTranslation } from "react-i18next"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/misc"
import { FormField } from "./form-field"

export interface FieldDef<T extends FieldValues> {
  name: Path<T>
  label: string
  type?: "text" | "email" | "tel" | "number" | "url" | "date" | "textarea" | "select" | "switch" | "password"
  required?: boolean
  options?: { value: string; label: string }[]
  placeholder?: string
  hint?: string
  colSpan?: 1 | 2
  step?: string
  min?: number
  /** Parse number inputs */
  number?: boolean
}

interface Props<In extends FieldValues, Out> {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  schema: z.ZodType<Out, In>
  fields: FieldDef<In>[]
  defaultValues: DefaultValues<In>
  onSubmit: (values: Out) => Promise<unknown>
  submitting?: boolean
  size?: "sm" | "md" | "lg"
}

/** Schema-driven create/edit dialog for simple entities (suppliers, customers, stores, employees…). */
export function EntityDialog<In extends FieldValues, Out>({ open, onOpenChange, title, schema, fields, defaultValues, onSubmit, submitting, size = "md" }: Props<In, Out>) {
  const { t } = useTranslation()
  const form = useForm<In, unknown, Out>({ resolver: zodResolver(schema), defaultValues })
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = form
  useEffect(() => { if (open) reset(defaultValues) }, [open, defaultValues, reset])

  const errorFor = (name: Path<In>) => {
    const e = (errors as Record<string, { message?: string } | undefined>)[name as string]
    return e ? (typeof e.message === "string" && e.message && !/^(Invalid|Too|Required|Expected|mismatch)/i.test(e.message) ? e.message : t("common.required")) : undefined
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size={size}>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form id="entity-form" onSubmit={handleSubmit((v) => onSubmit(v))} className="grid gap-4 sm:grid-cols-2" noValidate>
          {fields.map((f, idx) => (
            <FormField key={String(f.name)} label={f.label} required={f.required} hint={f.hint} error={errorFor(f.name)} className={f.colSpan === 2 || f.type === "textarea" ? "sm:col-span-2" : undefined}>
              {(id, invalid) => {
                if (f.type === "textarea") return <Textarea id={id} rows={2} placeholder={f.placeholder} aria-invalid={invalid} {...register(f.name)} />
                if (f.type === "select") return (
                  <Select value={String(watch(f.name) ?? "")} onValueChange={(v) => setValue(f.name, v as never, { shouldValidate: true })}>
                    <SelectTrigger id={id} aria-invalid={invalid}><SelectValue placeholder={f.placeholder ?? t("common.select")} /></SelectTrigger>
                    <SelectContent>{f.options?.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                )
                if (f.type === "switch") return <div className="flex h-10 items-center"><Switch id={id} checked={!!watch(f.name)} onCheckedChange={(v) => setValue(f.name, v as never)} /></div>
                return <Input id={id} type={f.type ?? "text"} step={f.step} min={f.min} placeholder={f.placeholder} autoFocus={idx === 0} aria-invalid={invalid} {...register(f.name, f.number || f.type === "number" ? { setValueAs: (v) => (v === "" || v == null ? undefined : Number(v)) } : {})} />
              }}
            </FormField>
          ))}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button type="submit" form="entity-form" loading={submitting}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
