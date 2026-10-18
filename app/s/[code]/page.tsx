import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { headers, cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { UAParser } from 'ua-parser-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashValue } from '@/lib/linkpulse/server'
import { LinkGate } from '@/components/link-gate'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ source?: string }> }

export default async function ShortLinkPage({ params, searchParams }: Props) {
  const [{ code }, query] = await Promise.all([params, searchParams])
  const admin = createAdminClient()
  const { data: link } = await admin.from('links').select('id, code, destination_url, title, status, expires_at, max_clicks, click_count, password_hash, device_destinations, deleted_at').eq('code', code).maybeSingle()
  if (!link || link.deleted_at) notFound()
  if (link.status !== 'active') return <LinkGate code={code} title={link.status === 'archived' ? 'This link is unavailable' : 'This link is paused'} description={link.status === 'archived' ? 'This short link has been archived by its owner.' : 'The owner has disabled this short link.'} />
  if (link.expires_at && new Date(link.expires_at) <= new Date()) return <LinkGate title="This link has expired" description="Its scheduled end date has passed." />
  if (link.max_clicks && link.click_count >= link.max_clicks) return <LinkGate title="This link reached its limit" description="The maximum number of visits has been reached." />

  const cookieStore = await cookies()
  if (link.password_hash) {
    const access = cookieStore.get(`lp_access_${code}`)?.value
    if (!access || !verifyAccessToken(code, access)) return <LinkGate code={code} title="Password protected" description="Enter the password provided by the link owner." passwordRequired />
  }

  const requestHeaders = await headers()
  const userAgent = requestHeaders.get('user-agent') ?? ''
  const parser = new UAParser(userAgent)
  const device = parser.getDevice().type === 'mobile' || parser.getDevice().type === 'tablet' ? 'mobile' : 'desktop'
  const targeted = (link.device_destinations as Record<string, string> | null)?.[device]
  const destination = targeted || link.destination_url
  const ua = parser.getResult()
  const isBot = /bot|crawler|spider|preview|slack|discord|whatsapp/i.test(userAgent)
  const forwarded = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const visitorHash = createHash('sha256').update(`${forwarded}:${userAgent}:${new Date().toISOString().slice(0, 10)}`).digest('hex')

  try {
    const { data: recorded, error } = await admin.rpc('record_click', {
      p_link_id: link.id,
      p_event: {
        referrer: requestHeaders.get('referer'),
        user_agent: userAgent.slice(0, 1000),
        device,
        browser: ua.browser.name ?? 'unknown',
        operating_system: ua.os.name ?? 'unknown',
        is_bot: isBot,
        qr_source: query.source === 'qr',
        visitor_hash: hashValue(visitorHash),
      },
    })
    if (error && link.max_clicks) return <LinkGate code={code} title="This link is temporarily unavailable" description="We could not safely verify the click limit. Please try again in a moment." />
    if (recorded === false) return <LinkGate code={code} title="This link reached its limit" description="The maximum number of visits has been reached." />
  } catch {
    if (link.max_clicks) return <LinkGate code={code} title="This link is temporarily unavailable" description="We could not safely verify the click limit. Please try again in a moment." />
  }
  redirect(destination)
}

function verifyAccessToken(code: string, token: string) {
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return false
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
  if (!secret) return false
  const expected = createHmac('sha256', secret).update(`${code}:${payload}`).digest('hex')
  if (signature.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) && Number(payload) > Date.now()
}
