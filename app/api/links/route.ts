import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit, getAppContext, getRequestIp } from '@/lib/linkpulse/server'
import { createLinkSchema } from '@/lib/linkpulse/validation'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const context = await getAppContext('view')
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('links')
      .select('id, workspace_id, campaign_id, code, destination_url, title, status, expires_at, max_clicks, click_count, qr_enabled, is_demo, created_at, updated_at')
      .eq('workspace_id', context.workspaceId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw error
    return NextResponse.json({ links: data ?? [], demo: context.isDemo })
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 503 })
  }
}

export async function POST(request: Request) {
  try {
    const ip = getRequestIp(request.headers)
    await enforceRateLimit('link-create-ip', ip, 120, 3600)
    const context = await getAppContext('write')
    await enforceRateLimit(context.userId ? 'link-create-user' : 'link-create-guest', context.userId ?? ip, context.userId ? 60 : 8, 3600)
    const parsed = createLinkSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the link details.' }, { status: 400 })

    const input = parsed.data
    const admin = createAdminClient()
    if (input.campaign_id) {
      const { data: campaign } = await admin.from('campaigns').select('id').eq('id', input.campaign_id).eq('workspace_id', context.workspaceId).maybeSingle()
      if (!campaign) return NextResponse.json({ error: 'That campaign is not in this workspace.' }, { status: 400 })
    }

    const host = new URL(input.destination_url).hostname.toLowerCase()
    const { data: blocked } = await admin.from('blocked_domains').select('domain').limit(500)
    if (blocked?.some(({ domain }) => host === domain || host.endsWith(`.${domain}`))) {
      return NextResponse.json({ error: 'This destination domain is blocked by LinkPulse safety rules.' }, { status: 422 })
    }
    const { data: existing } = await admin.from('links').select('id').eq('code', input.code).maybeSingle()
    if (existing) return NextResponse.json({ error: 'That short alias is already taken.' }, { status: 409 })

    const { data: link, error } = await admin.from('links').insert({
      workspace_id: context.workspaceId,
      created_by: context.userId,
      campaign_id: input.campaign_id ?? null,
      code: input.code,
      destination_url: input.destination_url,
      title: input.title,
      expires_at: input.expires_at ?? null,
      max_clicks: input.max_clicks ?? null,
      password_hash: input.password ? await bcrypt.hash(input.password, 12) : null,
      device_destinations: input.device_destinations,
      qr_enabled: input.qr_enabled,
    }).select('id, workspace_id, campaign_id, code, destination_url, title, status, expires_at, max_clicks, click_count, qr_enabled, is_demo, created_at').single()

    if (error?.code === '23505') return NextResponse.json({ error: 'That short alias was just claimed. Try another one.' }, { status: 409 })
    if (error) throw error

    if (input.tags.length) {
      const { data: tags, error: tagError } = await admin.from('tags').upsert(
        input.tags.map((name) => ({ workspace_id: context.workspaceId, name })),
        { onConflict: 'workspace_id,name' },
      ).select('id')
      if (tagError) throw tagError
      const { error: relationError } = await admin.from('link_tags').insert((tags ?? []).map(({ id }) => ({ link_id: link.id, tag_id: id })))
      if (relationError) throw relationError
    }

    return NextResponse.json({ link, short_url: new URL(`/s/${link.code}`, request.url).toString() }, { status: 201 })
  } catch (error) {
    const text = message(error)
    const status = text.includes('Too many requests') ? 429 : text.includes('not ready') ? 401 : 503
    return NextResponse.json({ error: text }, { status })
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
