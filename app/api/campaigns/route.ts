import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit, getAppContext, getRequestIp } from '@/lib/linkpulse/server'

const schema = z.object({ name: z.string().trim().min(2).max(80), description: z.string().trim().max(500).optional(), starts_at: z.string().datetime().nullable().optional(), ends_at: z.string().datetime().nullable().optional() })
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const context = await getAppContext('view')
    const { data, error } = await createAdminClient().from('campaigns').select('id, name, description, starts_at, ends_at, created_at').eq('workspace_id', context.workspaceId).order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ campaigns: data ?? [] })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Campaigns are unavailable.' }, { status: 503 })
  }
}

export async function POST(request: Request) {
  try {
    const ip = getRequestIp(request.headers)
    await enforceRateLimit('campaign-create-ip', ip, 30, 3600)
    const context = await getAppContext('write')
    if (!context.userId) return NextResponse.json({ error: 'Sign in to create private campaigns.' }, { status: 401 })
    await enforceRateLimit('campaign-create-user', context.userId, 30, 3600)
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
    const { data, error } = await createAdminClient().from('campaigns').insert({ ...parsed.data, workspace_id: context.workspaceId, created_by: context.userId }).select('id, name, description, starts_at, ends_at, created_at').single()
    if (error?.code === '23505') return NextResponse.json({ error: 'A campaign with that name already exists.' }, { status: 409 })
    if (error) throw error
    return NextResponse.json({ campaign: data }, { status: 201 })
  } catch (error) {
    const text = error instanceof Error ? error.message : 'Campaign creation failed.'
    return NextResponse.json({ error: text }, { status: text.includes('Too many') ? 429 : 503 })
  }
}
