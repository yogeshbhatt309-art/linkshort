export type LinkRecord = {
  id: string
  workspace_id: string
  campaign_id: string | null
  code: string
  destination_url: string
  title: string
  status: 'active' | 'disabled' | 'archived'
  expires_at: string | null
  max_clicks: number | null
  click_count: number
  qr_enabled: boolean
  is_demo: boolean
  created_at: string
}

export type CampaignRecord = {
  id: string
  name: string
  description: string | null
  starts_at: string | null
  ends_at: string | null
  created_at: string
}

export type Analytics = {
  total_links: number
  active_links: number
  total_clicks: number
  unique_visitors: number
  clicks_by_day: Array<{ day: string; clicks: number }>
  devices: Array<{ name: string; value: number }>
  browsers: Array<{ name: string; value: number }>
  referrers: Array<{ name: string; value: number }>
  top_links: Array<{ id: string; code: string; title: string; destination_url: string; clicks: number }>
  recent_clicks: Array<{ id: string; visited_at: string; device: string; browser: string; referrer: string | null; is_bot: boolean; code: string; title: string }>
}
