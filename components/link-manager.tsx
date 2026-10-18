'use client'

import { useMemo, useState } from 'react'
import { ArrowUpRight, Copy, ExternalLink, Link2, MoreHorizontal, Search, ShieldAlert, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { CampaignRecord, LinkRecord } from '@/lib/linkpulse/types'

export function LinkManager({ links, campaigns, onCreate, onChanged, demo }: { links: LinkRecord[]; campaigns: CampaignRecord[]; onCreate: () => void; onChanged: () => void; demo: boolean }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [selected, setSelected] = useState<LinkRecord | null>(null)
  const [page, setPage] = useState(0)
  const filtered = useMemo(() => links.filter((link) => {
    const query = search.toLowerCase()
    const campaign = campaigns.find((item) => item.id === link.campaign_id)?.name ?? ''
    const matched = !query || `${link.title} ${link.code} ${link.destination_url} ${campaign}`.toLowerCase().includes(query)
    const current = resolveStatus(link)
    return matched && (status === 'all' || current.toLowerCase().replaceAll(' ', '-') === status)
  }), [links, search, status, campaigns])
  const pageSize = 8
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const rows = filtered.slice(page * pageSize, (page + 1) * pageSize)

  async function toggle(link: LinkRecord) {
    const next = link.status === 'active' ? 'disabled' : 'active'
    const response = await fetch(`/api/links/${link.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) })
    const result = await response.json()
    if (!response.ok) return toast.error(result.error ?? 'Could not update this link.')
    toast.success(next === 'active' ? 'Link enabled' : 'Link disabled'); onChanged()
  }
  async function remove(link: LinkRecord) {
    if (!window.confirm(`Archive “${link.title}”? Existing analytics history will be retained.`)) return
    const response = await fetch(`/api/links/${link.id}`, { method: 'DELETE' })
    const result = await response.json()
    if (!response.ok) return toast.error(result.error ?? 'Could not archive this link.')
    toast.success('Link archived'); onChanged()
  }
  async function copy(code: string) { await navigator.clipboard.writeText(`${window.location.origin}/s/${code}`); toast.success('Short URL copied') }
  function exportRows() { const content = ['title,code,destination_url,status,click_count,created_at', ...filtered.map((link) => [link.title, link.code, link.destination_url, resolveStatus(link), link.click_count, link.created_at].map(csvEscape).join(','))].join('\n'); download(content, 'linkpulse-links.csv', 'text/csv') }

  return <div className="space-y-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="text-lg font-semibold tracking-tight">Your links</h2><p className="mt-1 text-xs text-muted-foreground">Search, filter, and manage your short URLs.</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={exportRows}><ArrowUpRight className="size-4" />Export CSV</Button><Button size="sm" onClick={onCreate}><Link2 className="size-4" />New link</Button></div></div>
    {demo && <p className="rounded-lg border border-sky-400/20 bg-sky-400/[0.05] px-3 py-2 text-[11px] text-sky-100">Showing labelled demo links. Sign in to keep links private in your own workspace.</p>}
    <Card className="border-white/[0.07] bg-card/80"><CardHeader className="gap-3 border-b border-border/70 pb-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><CardTitle className="text-sm">All short links <span className="ml-1 text-xs font-normal text-muted-foreground">{filtered.length}</span></CardTitle><CardDescription className="mt-1 text-xs">Search by title, alias, destination, or campaign</CardDescription></div><div className="flex gap-2"><div className="relative min-w-0 flex-1 sm:w-64"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} placeholder="Search links…" aria-label="Search links" /></div><Select value={status} onValueChange={(value) => { if (!value) return; setStatus(value); setPage(0) }}><SelectTrigger className="w-[125px]" aria-label="Filter links by status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="expired">Expired</SelectItem><SelectItem value="disabled">Disabled</SelectItem><SelectItem value="limit-reached">Limit reached</SelectItem></SelectContent></Select></div></div></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[710px] text-left text-xs"><thead className="bg-muted/25 text-[10px] uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Link</th><th className="px-4 py-3 font-medium">Campaign</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Clicks</th><th className="px-4 py-3 font-medium">Created</th><th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th></tr></thead><tbody>{rows.map((link) => <tr key={link.id} className="border-t border-border/60 hover:bg-muted/20"><td className="px-5 py-3.5"><p className="max-w-64 truncate text-sm font-medium">{link.title}</p><a href={`/s/${link.code}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline">/s/{link.code}<ExternalLink className="size-3" /></a><p className="mt-1 max-w-64 truncate text-[10px] text-muted-foreground">{link.destination_url}</p></td><td className="px-4 py-3 text-muted-foreground">{campaigns.find((campaign) => campaign.id === link.campaign_id)?.name ?? '—'}</td><td className="px-4 py-3"><StatusBadge link={link} /></td><td className="px-4 py-3 font-medium tabular-nums">{link.click_count.toLocaleString()}</td><td className="px-4 py-3 text-muted-foreground">{new Date(link.created_at).toLocaleDateString()}</td><td className="px-4 py-3"><div className="flex items-center justify-end gap-1"><Button size="icon-sm" variant="ghost" onClick={() => copy(link.code)} aria-label={`Copy ${link.title}`}><Copy className="size-3.5" /></Button><Button size="icon-sm" variant="ghost" onClick={() => setSelected(link)} aria-label={`More actions for ${link.title}`}><MoreHorizontal className="size-4" /></Button></div></td></tr>)}</tbody></table>{rows.length === 0 && <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center"><span className="mb-3 grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground"><Link2 className="size-5" /></span><h3 className="text-sm font-medium">{links.length ? 'No links match those filters' : 'No links yet'}</h3><p className="mt-1 max-w-xs text-xs text-muted-foreground">{links.length ? 'Try another search or status filter.' : 'Create your first short link to start tracking real visits.'}</p>{!links.length && <Button className="mt-4" size="sm" onClick={onCreate}>Create your first link</Button>}</div>}</div><div className="flex items-center justify-between border-t border-border/60 px-5 py-3 text-xs text-muted-foreground"><span>Page {page + 1} of {pageCount}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page >= pageCount - 1} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div></CardContent></Card>
    <Dialog open={!!selected} onOpenChange={(value) => { if (!value) setSelected(null) }}><DialogContent className="border-border/80 bg-card sm:max-w-md"><DialogHeader><DialogTitle>{selected?.title}</DialogTitle><DialogDescription>Link details and lifecycle controls</DialogDescription></DialogHeader>{selected && <div className="space-y-3 text-xs"><div className="rounded-lg bg-background p-3"><p className="font-mono text-primary">{window.location.origin}/s/{selected.code}</p><p className="mt-2 break-all text-muted-foreground">{selected.destination_url}</p></div><div className="grid grid-cols-2 gap-2"><Info label="Clicks" value={selected.click_count.toLocaleString()} /><Info label="Click limit" value={selected.max_clicks?.toLocaleString() ?? 'Unlimited'} /><Info label="Expires" value={selected.expires_at ? new Date(selected.expires_at).toLocaleString() : 'Never'} /><Info label="Created" value={new Date(selected.created_at).toLocaleDateString()} /></div><p className="flex items-center gap-2 text-muted-foreground"><ShieldAlert className="size-3.5 text-primary" />Disabled and deleted links retain historic click records.</p></div>}<DialogFooter className="flex-row flex-wrap justify-between"><Button size="sm" variant="outline" onClick={() => selected && toggle(selected)}>{selected?.status === 'active' ? <ToggleRight className="size-4" /> : <ToggleLeft className="size-4" />}{selected?.status === 'active' ? 'Disable' : 'Enable'}</Button><div className="flex gap-2"><Button size="sm" variant="destructive" onClick={() => { if (selected) void remove(selected); setSelected(null) }}><Trash2 className="size-4" />Archive</Button><Button size="sm" onClick={() => selected && copy(selected.code)}>Copy URL</Button></div></DialogFooter></DialogContent></Dialog>
  </div>
}

function resolveStatus(link: LinkRecord) { if (link.status !== 'active') return 'Disabled'; if (link.expires_at && new Date(link.expires_at) <= new Date()) return 'Expired'; if (link.max_clicks && link.click_count >= link.max_clicks) return 'Limit reached'; return 'Active' }
function StatusBadge({ link }: { link: LinkRecord }) { const status = resolveStatus(link); const styles = status === 'Active' ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : status === 'Expired' ? 'border-amber-400/20 bg-amber-400/10 text-amber-200' : status === 'Limit reached' ? 'border-violet-400/20 bg-violet-400/10 text-violet-200' : 'border-slate-400/20 bg-slate-400/10 text-slate-300'; return <Badge variant="outline" className={`whitespace-nowrap ${styles}`}><span className="mr-1 size-1.5 rounded-full bg-current" />{status}</Badge> }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-border/70 bg-background p-3"><p className="text-[10px] text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div> }
function csvEscape(value: string | number) { return `"${String(value).replaceAll('"', '""')}"` }
function download(content: string, filename: string, type: string) { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url) }
