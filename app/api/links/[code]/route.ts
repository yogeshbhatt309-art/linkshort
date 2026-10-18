import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAppContext } from '@/lib/linkpulse/server'

const updateSchema = z.object({ title: z.string().trim().min(1).max(120).optional(), destination_url: z.string().url().optional(), status: z.enum(['active', 'disabled', 'archived']).optional(), expires_at: z.string().datetime().nullable().optional() })
export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const context = await getAppContext('write')
    const { code: id } = await params
    const parsed = updateSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
    const { data, error } = await createAdminClient().from('links').update({ ...parsed.data, updated_at: new Date().toISOString() }).eq('id', id).eq('workspace_id', context.workspaceId).is('deleted_at', null).select('id, code, title, destination_url, status, expires_at, click_count, max_clicks').maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Link not found in this workspace.' }, { status: 404 })
    return NextResponse.json({ link: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Link update failed.' }, { status: 401 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const context = await getAppContext('write')
    const { code: id } = await params
    const { data, error } = await createAdminClient().from('links').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', id).eq('workspace_id', context.workspaceId).is('deleted_at', null).select('id').maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Link not found in this workspace.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Link deletion failed.' }, { status: 401 })
  }
}
