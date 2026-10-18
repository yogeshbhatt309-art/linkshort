import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAppContext } from '@/lib/linkpulse/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const context = await getAppContext('view')
    const admin = createAdminClient()
    const url = new URL(request.url)
    const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days') ?? 7) || 7))
    const [{ data: analytics, error }, { data: campaigns }, { data: workspace }] = await Promise.all([
      admin.rpc('get_workspace_analytics', { p_workspace_id: context.workspaceId, p_days: days }),
      admin.from('campaigns').select('id, name, description, starts_at, ends_at, created_at').eq('workspace_id', context.workspaceId).order('created_at', { ascending: false }),
      admin.from('workspaces').select('name').eq('id', context.workspaceId).single(),
    ])
    if (error) throw error
    return NextResponse.json({ analytics, campaigns: campaigns ?? [], workspace: workspace?.name ?? 'Workspace', demo: context.isDemo, guest: context.isGuest, days })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Analytics are temporarily unavailable.' }, { status: 503 })
  }
}
