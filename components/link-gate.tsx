'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowLeft, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

export function LinkGate({ code, title, description, passwordRequired = false }: { code?: string; title: string; description: string; passwordRequired?: boolean }) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reason, setReason] = useState('')
  const router = useRouter()

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!code) return
    setLoading(true)
    const response = await fetch(`/api/links/${encodeURIComponent(code)}/password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
    const result = await response.json()
    setLoading(false)
    if (!response.ok) return toast.error(result.error ?? 'Password could not be verified.')
    toast.success('Password verified')
    router.refresh()
  }

  async function report(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!code) return
    const response = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, reason, details: 'Submitted from the short-link access page.' }) })
    const result = await response.json()
    if (!response.ok) return toast.error(result.error ?? 'Report could not be submitted.')
    toast.success('Report sent to the safety team')
    setReportOpen(false)
  }

  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <section className="w-full max-w-md rounded-3xl border border-border/80 bg-card p-7 shadow-[0_24px_80px_rgba(0,0,0,.3)]">
        <div className="mb-6 grid size-12 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary"><ShieldCheck className="size-5" /></div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        {passwordRequired && <form onSubmit={verify} className="mt-6 space-y-4"><FieldGroup><Field><FieldLabel htmlFor="link-password">Link password</FieldLabel><Input id="link-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></Field></FieldGroup><Button className="h-10 w-full" disabled={loading}>{loading ? 'Checking…' : 'Continue securely'}</Button></form>}
        {code && <div className="mt-7 border-t border-border pt-5">{reportOpen ? <form className="space-y-3" onSubmit={report}><Field><FieldLabel htmlFor="report-reason">Why are you reporting this link?</FieldLabel><Input id="report-reason" required minLength={3} maxLength={80} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Phishing, spam, malware…" /></Field><Button size="sm" type="submit">Send report</Button></form> : <button className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={() => setReportOpen(true)}><AlertTriangle className="mr-1 inline size-3.5" />Report this link</button>}</div>}
        <a href="/" className="mt-7 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />Back to LinkPulse</a>
      </section>
    </main>
  )
}
