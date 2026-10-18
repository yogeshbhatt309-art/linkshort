'use client'

import { useState } from 'react'
import { LogIn, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'

function authErrorMessage(error: { message: string; status?: number; code?: string }, mode: 'signin' | 'signup') {
  if (error.status === 429 || error.code?.includes('rate')) return 'Too many attempts. Please wait a moment before trying again.'
  if (mode === 'signin' && error.status === 400) return 'Invalid email or password.'
  if (mode === 'signup') {
    if (error.code?.includes('weak_password')) return 'Choose a stronger password with at least 8 characters.'
    if (error.code?.includes('email_address_invalid')) return 'Enter a valid email address.'
    return 'We could not create this account. Check your email and password, then try again.'
  }
  return 'Sign-in is temporarily unavailable. Please try again.'
}

export function AuthDialog({ open, onOpenChange, onAuthenticated }: { open: boolean; onOpenChange: (value: boolean) => void; onAuthenticated: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true)
    const supabase = createClient()
    const result = mode === 'signup'
      ? await supabase.auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback` } })
      : await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (result.error) return toast.error(authErrorMessage(result.error, mode))
    if (mode === 'signup' && !result.data.session) return toast.success('Check your email to confirm your account, then sign in.')
    toast.success(mode === 'signup' ? 'Your workspace is ready' : 'Welcome back')
    onOpenChange(false); onAuthenticated()
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="border-border/80 bg-card sm:max-w-md"><DialogHeader><div className="mb-2 grid size-10 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">{mode === 'signup' ? <UserPlus className="size-4" /> : <LogIn className="size-4" />}</div><DialogTitle>{mode === 'signup' ? 'Create your workspace' : 'Sign in to LinkPulse'}</DialogTitle><DialogDescription>{mode === 'signup' ? 'Save links privately and unlock campaign analytics.' : 'Access your private links and workspace analytics.'}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4 pt-2"><FieldGroup>{mode === 'signup' && <Field><FieldLabel htmlFor="auth-name">Your name</FieldLabel><Input id="auth-name" required maxLength={80} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Alex Morgan" /></Field>}<Field><FieldLabel htmlFor="auth-email">Email</FieldLabel><Input id="auth-email" type="email" required maxLength={254} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></Field><Field><FieldLabel htmlFor="auth-password">Password</FieldLabel><Input id="auth-password" type="password" required minLength={8} maxLength={128} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></Field></FieldGroup><Button className="h-10 w-full" disabled={loading}>{loading ? 'Please wait…' : mode === 'signup' ? 'Create free account' : 'Sign in'}</Button></form><p className="text-center text-xs text-muted-foreground">{mode === 'signup' ? 'Already have an account?' : 'New to LinkPulse?'} <button className="font-medium text-primary hover:underline" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>{mode === 'signup' ? 'Sign in' : 'Create an account'}</button></p></DialogContent></Dialog>
}
