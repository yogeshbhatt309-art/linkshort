import { NextResponse } from 'next/server'
import { createHmac } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { createAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit, getRequestIp } from '@/lib/linkpulse/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params
    await enforceRateLimit('password-attempt', `${getRequestIp(request.headers)}:${code}`, 8, 900)
    const body = await request.json() as { password?: string }
    if (typeof body.password !== 'string' || body.password.length > 128) return NextResponse.json({ error: 'Enter the link password.' }, { status: 400 })
    const { data: link } = await createAdminClient().from('links').select('id, password_hash').eq('code', code).is('deleted_at', null).maybeSingle()
    if (!link?.password_hash || !(await bcrypt.compare(body.password, link.password_hash))) return NextResponse.json({ error: 'That password did not match.' }, { status: 401 })
    const payload = String(Date.now() + 15 * 60 * 1000)
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
    if (!secret) throw new Error('Link security is temporarily unavailable.')
    const signature = createHmac('sha256', secret).update(`${code}:${payload}`).digest('hex')
    const response = NextResponse.json({ ok: true })
    response.cookies.set(`lp_access_${code}`, `${payload}.${signature}`, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: `/s/${code}`, maxAge: 900 })
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Password check failed.'
    return NextResponse.json({ error: message }, { status: message.includes('Too many') ? 429 : 503 })
  }
}
