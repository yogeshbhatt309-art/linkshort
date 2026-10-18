import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit, getRequestIp } from '@/lib/linkpulse/server'

const reportSchema = z.object({ code: z.string().trim().min(3).max(48), reason: z.string().trim().min(3).max(80), details: z.string().trim().max(1000).optional(), email: z.string().email().max(200).optional() })

export async function POST(request: Request) {
  try {
    const ip = getRequestIp(request.headers)
    await enforceRateLimit('abuse-report', ip, 5, 3600)
    const parsed = reportSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
    const admin = createAdminClient()
    const { data: link } = await admin.from('links').select('id,code').eq('code', parsed.data.code).maybeSingle()
    const { error } = await admin.from('abuse_reports').insert({ link_id: link?.id ?? null, short_code: parsed.data.code, reason: parsed.data.reason, details: parsed.data.details ?? null, reporter_email: parsed.data.email ?? null })
    if (error) throw error
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Report submission failed.'
    return NextResponse.json({ error: message }, { status: message.includes('Too many') ? 429 : 503 })
  }
}
