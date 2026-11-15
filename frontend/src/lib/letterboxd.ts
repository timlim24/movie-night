// Letterboxd export (Settings → Data → Export your data) is a ZIP with watched.csv and ratings.csv.
// We parse it in the browser and send only {title, year, rating} to the API in batches.
import Papa from 'papaparse'
import { unzipSync, strFromU8 } from 'fflate'

export type ImportEntry = { title: string; year?: string; rating?: string; watchedAt?: string }

function parseCsv(text: string): Record<string, string>[] {
  return Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true }).data
}

export async function readLetterboxdFile(file: File): Promise<ImportEntry[]> {
  const files: Record<string, string> = {}
  if (file.name.toLowerCase().endsWith('.zip')) {
    const unzipped = unzipSync(new Uint8Array(await file.arrayBuffer()))
    for (const [name, bytes] of Object.entries(unzipped)) {
      const base = name.split('/').pop()!.toLowerCase()
      if (base.endsWith('.csv')) files[base] = strFromU8(bytes)
    }
  } else {
    files[file.name.toLowerCase()] = await file.text()
  }

  const byKey = new Map<string, ImportEntry>()
  const add = (rows: Record<string, string>[]) => {
    for (const r of rows) {
      const title = (r.Name || r.Title || '').trim()
      if (!title) continue
      const key = `${title.toLowerCase()}|${r.Year || ''}`
      const prev = byKey.get(key)
      byKey.set(key, {
        title,
        year: r.Year || prev?.year,
        rating: r.Rating || prev?.rating,
        watchedAt: r['Watched Date'] || r.Date || prev?.watchedAt,
      })
    }
  }
  // watched.csv = everything seen; ratings.csv adds stars; diary.csv as a fallback.
  for (const name of ['watched.csv', 'diary.csv', 'ratings.csv']) if (files[name]) add(parseCsv(files[name]))
  if (byKey.size === 0) for (const text of Object.values(files)) add(parseCsv(text))
  return [...byKey.values()]
}
