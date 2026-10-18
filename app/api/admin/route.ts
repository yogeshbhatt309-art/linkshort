import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('block-domain'), domain: z.string().trim().toLowerCase().regex(/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/), reason: z.string().trim().min(4).max(300) }),
  z.object({ action: z.literal('report-status'), report_id: z.string().uuid(), status: z.enum(['reviewing', 'resolved', 'dismissed']) }),
  z.object({ action: z.literal('link-status'), link_id: z.string().uuid(), status: z.enum(['active', 'disabled']) }),
])

export const dynamic = 'force-dynamic'

async function getAdminActor() {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  const id = typeof claims?.sub === 'string' ? claims.sub : null
  if (!id) return null
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', id).maybeSingle()
  return profile?.role === 'admin' ? { id, admin } : null
}

export async function GET() {
  try {
    const actor = await getAdminActor()
    if (!actor) return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 })
    const [{ data: reports }, { data: domains }, { count: links }, { count: clicks }, { count: workspaces }] = await Promise.all([
      actor.admin.from('abuse_reports').select('id, short_code, reason, details, reporter_email, status, created_at').order('created_at', { ascending: false }).limit(100),
      actor.admin.from('blocked_domains').select('id, domain, reason, created_at').order('created_at', { ascending: false }).limit(200),
      actor.admin.from('links').select('*', { count: 'exact', head: true }).is('deleted_at', null),
      actor.admin.from('click_events').select('*', { count: 'exact', head: true }),
      actor.admin.from('workspaces').select('*', { count: 'exact', head: true }),
    ])
    return NextResponse.json({ reports: reports ?? [], domains: domains ?? [], metrics: { links: links ?? 0, clicks: clicks ?? 0, workspaces: workspaces ?? 0 } })
  } catch {
    return NextResponse.json({ error: 'Admin data is temporarily unavailable.' }, { status: 503 })
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getAdminActor()
    if (!actor) return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 })
    const parsed = actionSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid admin action.' }, { status: 400 })
    const action = parsed.data
    if (action.action === 'block-domain') {
      const { data, error } = await actor.admin.from('blocked_domains').upsert({ domain: action.domain, reason: action.reason, created_by: actor.id }, { onConflict: 'domain' }).select('id').single()
      if (error) throw error
      await actor.admin.from('audit_logs').insert({ actor_id: actor.id, action: 'block_domain', entity_type: 'blocked_domain', entity_id: data.id, metadata: { domain: action.domain, reason: action.reason } })
    }
    if (action.action === 'report-status') {
      const { data, error } = await actor.admin.from('abuse_reports').update({ status: action.status }).eq('id', action.report_id).select('id, short_code').single()
      if (error) throw error
      await actor.admin.from('audit_logs').insert({ actor_id: actor.id, action: 'update_abuse_report', entity_type: 'abuse_report', entity_id: data.id, metadata: { short_code: data.short_code, status: action.status } })
    }
    if (action.action === 'link-status') {
      const { data, error } = await actor.admin.from('links').update({ status: action.status, updated_at: new Date().toISOString() }).eq('id', action.link_id).select('id, workspace_id, code').single()
      if (error) throw error
      await actor.admin.from('audit_logs').insert({ workspace_id: data.workspace_id, actor_id: actor.id, action: `${action.status}_link`, entity_type: 'link', entity_id: data.id, metadata: { code: data.code } })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Admin action failed.' }, { status: 503 })
  }
}
