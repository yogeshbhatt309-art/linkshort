import 'server-only'

import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export type AppContext = {
  userId: string | null
  workspaceId: string
  isDemo: boolean
  isGuest: boolean
}

const GUEST_COOKIE = 'linkpulse_guest'
const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

export async function getAppContext(mode: 'view' | 'write' = 'view'): Promise<AppContext> {
  const supabase = await createServerSupabaseClient()
  const { data: { claims } } = await supabase.auth.getClaims()
  const userId = typeof claims?.sub === 'string' ? claims.sub : null
  const admin = createAdminClient()

  if (userId) {
    const { data: membership } = await admin
      .from('workspace_members')
      .select('workspace_id, workspaces!inner(id, is_demo, is_public_guest)')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    const workspace = membership?.workspaces as unknown as { id: string; is_demo: boolean; is_public_guest: boolean } | null
    if (workspace && !workspace.is_demo && !workspace.is_public_guest) {
      return { userId, workspaceId: workspace.id, isDemo: false, isGuest: false }
    }
    if (mode === 'write') throw new Error('Your private workspace is not ready yet.')
  }

  if (mode === 'write' || !userId) {
    const cookieStore = await cookies()
    const guestId = verifyGuestCookie(cookieStore.get(GUEST_COOKIE)?.value)
    if (guestId) {
      const { data: guestWorkspace } = await admin.from('workspaces').select('id').eq('slug', `guest-${guestId}`).eq('is_public_guest', true).maybeSingle()
      if (guestWorkspace) return { userId: null, workspaceId: guestWorkspace.id, isDemo: false, isGuest: true }
    }
    if (mode === 'write') {
      const id = randomUUID()
      const { data: workspace, error } = await admin.from('workspaces').insert({ name: 'Guest workspace', slug: `guest-${id}`, is_public_guest: true }).select('id').single()
      if (error || !workspace) throw new Error('Could not create an isolated guest workspace.')
      cookieStore.set(GUEST_COOKIE, signGuestId(id), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: GUEST_COOKIE_MAX_AGE })
      return { userId: null, workspaceId: workspace.id, isDemo: false, isGuest: true }
    }
  }

  const { data: workspace, error } = await admin.from('workspaces').select('id, is_demo, is_public_guest').eq('slug', 'linkpulse-demo').single()
  if (error || !workspace) throw new Error('LinkPulse is temporarily unavailable. Please try again shortly.')
  return { userId: null, workspaceId: workspace.id, isDemo: true, isGuest: false }
}

function signGuestId(id: string) {
  const signature = createHmac('sha256', serverSecret()).update(id).digest('hex')
  return `${id}.${signature}`
}

function verifyGuestCookie(value?: string) {
  if (!value) return null
  const [id, signature] = value.split('.')
  if (!id || !signature || !/^[0-9a-f-]{36}$/i.test(id)) return null
  const expected = createHmac('sha256', serverSecret()).update(id).digest('hex')
  if (signature.length !== expected.length) return null
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? id : null
}

function serverSecret() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
  if (!secret) throw new Error('Supabase server credentials are not configured.')
  return secret
}

export function getRequestIp(headers: Headers) {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'unknown'
}

export function hashValue(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export async function enforceRateLimit(scope: string, key: string, maxHits: number, windowSeconds: number) {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('consume_rate_limit', {
    p_scope: scope,
    p_key_hash: hashValue(key),
    p_limit: maxHits,
    p_window_seconds: windowSeconds,
  })
  if (error) throw new Error('Rate limiting is temporarily unavailable.')
  if (!data) throw new Error('Too many requests. Please wait a moment and try again.')
}
