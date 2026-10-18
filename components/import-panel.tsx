'use client'

import { useMemo, useState } from 'react'
import { Check, Download, FileSpreadsheet, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { CampaignRecord, LinkRecord } from '@/lib/linkpulse/types'

type Row = { destination_url: string; code: string; title: string; campaign_name?: string; tags: string[]; valid: boolean; error?: string }

export function ImportPanel({ campaigns, onImported }: { campaigns: CampaignRecord[]; onImported: (links: LinkRecord[]) => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const [filename, setFilename] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ imported: Array<{ row: number; code: string; title: string }>; errors: Array<{ row: number; error: string }> } | null>(null)
  const validRows = useMemo(() => rows.filter((row) => row.valid), [rows])
  const invalidRows = useMemo(() => rows.filter((row) => !row.valid), [rows])

  async function parseFile(file?: File) {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) return toast.error('CSV files must be smaller than 2 MB.')
    setFilename(file.name); setResult(null)
    const text = await file.text()
    const matrix = parseCsv(text)
    if (matrix.length < 2) return toast.error('Add a header row and at least one link to import.')
    if (matrix.length > 301) return toast.error('Import is limited to 300 rows at a time.')
    const headers = matrix[0].map((value) => value.trim().toLowerCase())
    const get = (values: string[], key: string) => values[headers.indexOf(key)]?.trim() ?? ''
    if (!headers.includes('destination_url')) return toast.error('CSV must include a destination_url column.')
    const aliases = new Set<string>()
    const mapped = matrix.slice(1).map((values) => {
      const destination_url = get(values, 'destination_url')
      let code = get(values, 'alias') || get(values, 'code')
      const title = get(values, 'title')
      const campaign_name = get(values, 'campaign')
      const tags = get(values, 'tags').split(/[|;]/).map((value) => value.trim()).filter(Boolean).slice(0, 8)
      let error = ''
      try { const url = new URL(destination_url); if (!['http:', 'https:'].includes(url.protocol)) error = 'Use an HTTP or HTTPS destination.' } catch { error = 'Enter a valid destination URL.' }
      if (!code) code = `${slug(title || hostname(destination_url)).slice(0, 34)}-${crypto.randomUUID().slice(0, 5)}`
      if (!/^[A-Za-z0-9_-]{3,48}$/.test(code)) error ||= 'Alias must be 3–48 letters, numbers, hyphens, or underscores.'
      if (aliases.has(code.toLowerCase())) error ||= 'Duplicate alias in this file.'
      aliases.add(code.toLowerCase())
      if (campaign_name && !campaigns.some((campaign) => campaign.name.toLowerCase() === campaign_name.toLowerCase())) error ||= 'Campaign will be created during import.'
      return { destination_url, code, title: title || hostname(destination_url), campaign_name: campaign_name || undefined, tags, valid: !error || error.startsWith('Campaign will'), error: error.startsWith('Campaign will') ? undefined : error }
    }).filter((row) => row.destination_url || row.code || row.title)
    setRows(mapped)
  }

  async function importLinks() {
    setLoading(true)
    const response = await fetch('/api/links/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: validRows.map(({ valid: _valid, error: _error, ...row }) => row) }) })
    const data = await response.json(); setLoading(false)
    if (!response.ok) return toast.error(data.error ?? 'The import could not be completed.')
    setResult(data); toast.success(`${data.imported_count} links imported`); onImported([])
  }

  function downloadTemplate() { const anchor = document.createElement('a'); anchor.href = '/linkpulse-import-template.csv'; anchor.download = 'linkpulse-import-template.csv'; anchor.click() }
  return <div className="space-y-5"><div><h2 className="text-lg font-semibold tracking-tight">Import links</h2><p className="mt-1 text-xs text-muted-foreground">Bulk create links from a UTF-8 CSV, with row-by-row validation.</p></div><Card className="border-white/[0.07] bg-card/80"><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><FileSpreadsheet className="size-4 text-primary" />CSV import</CardTitle><CardDescription className="text-xs">Maximum 2 MB and 300 rows. Invalid rows are skipped, with row numbers and reasons returned.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-background/50 px-5 py-10 text-center"><span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><Upload className="size-5" /></span><div><p className="text-sm font-medium">{filename || 'Choose a CSV file'}</p><p className="mt-1 text-xs text-muted-foreground">Columns: destination_url, alias, title, campaign, tags</p></div><label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-medium transition-colors hover:bg-muted"><Upload className="size-3.5" />Browse CSV<input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void parseFile(event.target.files?.[0])} /></label><Button size="sm" variant="link" onClick={downloadTemplate}><Download className="size-3.5" />Download sample template</Button></div>{rows.length > 0 && <><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="border-emerald-400/20 bg-emerald-400/10 text-emerald-200"><Check className="mr-1 size-3" />{validRows.length} ready</Badge><Badge variant="outline" className="border-rose-400/20 bg-rose-400/10 text-rose-200"><X className="mr-1 size-3" />{invalidRows.length} invalid</Badge><span className="ml-auto text-[11px] text-muted-foreground">{rows.length} rows found</span></div><div className="max-h-80 overflow-auto rounded-lg border border-border"><table className="w-full min-w-[640px] text-left text-xs"><thead className="sticky top-0 bg-muted text-[10px] uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Title</th><th className="px-3 py-2">Alias</th><th className="px-3 py-2">Campaign</th><th className="px-3 py-2">Validation</th></tr></thead><tbody>{rows.map((row, index) => <tr className="border-t border-border/60" key={`${index}-${row.code}`}><td className="px-3 py-2.5">{index + 2}</td><td className="max-w-40 truncate px-3 py-2.5">{row.title}</td><td className="px-3 py-2.5 font-mono text-primary">{row.code}</td><td className="px-3 py-2.5">{row.campaign_name || '—'}</td><td className={`max-w-56 px-3 py-2.5 ${row.valid ? 'text-emerald-300' : 'text-rose-300'}`}>{row.error || 'Ready'}</td></tr>)}</tbody></table></div><Button disabled={!validRows.length || loading} onClick={importLinks}>{loading ? 'Importing…' : `Import ${validRows.length} valid ${validRows.length === 1 ? 'link' : 'links'}`}</Button></>}{result && <div className="rounded-xl border border-border bg-background p-4"><p className="text-sm font-medium">Import finished</p><p className="mt-1 text-xs text-muted-foreground">{result.imported.length} saved · {result.errors.length} skipped</p><div className="mt-3 space-y-1">{result.imported.slice(0, 8).map((link) => <p key={link.code} className="text-xs text-emerald-200">/s/{link.code} · {link.title}</p>)}{result.errors.slice(0, 8).map((item) => <p key={`${item.row}-${item.error}`} className="text-xs text-rose-200">Row {item.row}: {item.error}</p>)}</div></div>}</CardContent></Card><Card className="border-white/[0.07] bg-card/80"><CardHeader><CardTitle className="text-sm">CSV format</CardTitle><CardDescription className="text-xs">Destination is required. Alias, title, campaign and tags are optional. Tags may be separated with a pipe or semicolon.</CardDescription></CardHeader></Card></div>
}

function parseCsv(value: string) { const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false; const text = value.replace(/^\uFEFF/, ''); for (let index = 0; index < text.length; index++) { const character = text[index]; if (quoted && character === '"' && text[index + 1] === '"') { field += '"'; index++ } else if (character === '"') quoted = !quoted; else if (!quoted && character === ',') { row.push(field); field = '' } else if (!quoted && (character === '\n' || character === '\r')) { if (character === '\r' && text[index + 1] === '\n') index++; row.push(field); if (row.some((cell) => cell.trim())) rows.push(row); row = []; field = '' } else field += character } row.push(field); if (row.some((cell) => cell.trim())) rows.push(row); return rows }
function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) }
function hostname(value: string) { try { return new URL(value).hostname.replace(/^www\./, '') } catch { return 'new-link' } }
