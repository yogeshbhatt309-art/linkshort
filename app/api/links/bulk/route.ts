import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit, getAppContext, getRequestIp } from '@/lib/linkpulse/server'
import { createLinkSchema } from '@/lib/linkpulse/validation'

const rowSchema = createLinkSchema.omit({ password: true, device_destinations: true }).extend({ campaign_name: z.string().trim().max(80).optional() })
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const ip = getRequestIp(request.headers)
    await enforceRateLimit('csv-import-ip', ip, 20, 3600)
    const context = await getAppContext('write')
    await enforceRateLimit(context.userId ? 'csv-import-user' : 'csv-import-guest', context.userId ?? ip, context.userId ? 20 : 3, 3600)
    const body = await request.json() as { rows?: unknown[] }
    if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 300) return NextResponse.json({ error: 'Import between 1 and 300 rows at a time.' }, { status: 400 })
    const admin = createAdminClient()
    const campaigns = new Map<string, string>()
    const { data: knownCampaigns } = await admin.from('campaigns').select('id,name').eq('workspace_id', context.workspaceId)
    knownCampaigns?.forEach((item) => campaigns.set(item.name.toLowerCase(), item.id))
    const imported: Array<{ row: number; code: string; title: string }> = []
    const errors: Array<{ row: number; error: string }> = []
    const seen = new Set<string>()

    for (const [index, raw] of body.rows.entries()) {
      const rowNumber = index + 2
      const parsed = rowSchema.safeParse(raw)
      if (!parsed.success) {
        errors.push({ row: rowNumber, error: parsed.error.issues[0]?.message ?? 'Invalid row.' })
        continue
      }
      const input = parsed.data
      if (seen.has(input.code.toLowerCase())) {
        errors.push({ row: rowNumber, error: 'Duplicate alias within this file.' })
        continue
      }
      seen.add(input.code.toLowerCase())
      if (input.campaign_id && !(knownCampaigns ?? []).some((campaign) => campaign.id === input.campaign_id)) {
        errors.push({ row: rowNumber, error: 'Campaign is not in this workspace.' })
        continue
      }
      if (input.campaign_name) {
        let campaignId = campaigns.get(input.campaign_name.toLowerCase())
        if (!campaignId) {
          const { data: campaign, error } = await admin.from('campaigns').insert({ workspace_id: context.workspaceId, name: input.campaign_name, created_by: context.userId }).select('id').single()
          if (error?.code === '23505') {
            const { data: existing } = await admin.from('campaigns').select('id').eq('workspace_id', context.workspaceId).eq('name', input.campaign_name).single()
            campaignId = existing?.id
          } else if (error) {
            errors.push({ row: rowNumber, error: 'Campaign could not be created.' })
            continue
          } else campaignId = campaign.id
          if (campaignId) campaigns.set(input.campaign_name.toLowerCase(), campaignId)
        }
        if (campaignId) input.campaign_id = campaignId
      }
      const host = new URL(input.destination_url).hostname.toLowerCase()
      const { data: blocked } = await admin.from('blocked_domains').select('domain').limit(500)
      if (blocked?.some(({ domain }) => host === domain || host.endsWith(`.${domain}`))) {
        errors.push({ row: rowNumber, error: 'Destination domain is blocked.' })
        continue
      }
      const { data: link, error } = await admin.from('links').insert({
        workspace_id: context.workspaceId,
        created_by: context.userId,
        campaign_id: input.campaign_id ?? null,
        code: input.code,
        destination_url: input.destination_url,
        title: input.title,
        expires_at: input.expires_at ?? null,
        max_clicks: input.max_clicks ?? null,
        qr_enabled: input.qr_enabled,
      }).select('id, code, title').single()
      if (error?.code === '23505') {
        errors.push({ row: rowNumber, error: 'Alias is already in use.' })
        continue
      }
      if (error) {
        errors.push({ row: rowNumber, error: 'Could not save this link.' })
        continue
      }
      if (input.tags.length) {
        const { data: tags } = await admin.from('tags').upsert(input.tags.map((name) => ({ workspace_id: context.workspaceId, name })), { onConflict: 'workspace_id,name' }).select('id')
        if (tags?.length) await admin.from('link_tags').insert(tags.map(({ id }) => ({ link_id: link.id, tag_id: id })))
      }
      imported.push({ row: rowNumber, code: link.code, title: link.title })
    }
    return NextResponse.json({ imported, errors, imported_count: imported.length, skipped_count: errors.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The import could not be completed.'
    return NextResponse.json({ error: message }, { status: message.includes('Too many') ? 429 : 503 })
  }
}
