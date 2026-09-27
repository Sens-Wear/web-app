export type CsvValue = string | number | bigint | boolean | null | undefined
export type CsvRow = Record<string, CsvValue>
export const CSV_LIMIT = 50_000

function cell(value: CsvValue): string {
  let text = value == null ? '' : String(value)
  // Neutralize spreadsheet formulas in text fields; retain signed numeric readings.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export class CsvLog {
  private rows: CsvRow[] = []
  dropped = 0
  constructor(
    readonly columns: readonly string[],
    readonly limit = CSV_LIMIT,
  ) {}
  get size() {
    return this.rows.length
  }
  append(row: CsvRow) {
    if (this.rows.length >= this.limit) {
      this.dropped++
      return
    }
    this.rows.push({ received_at_utc: new Date().toISOString(), ...row })
  }
  clear() {
    this.rows = []
    this.dropped = 0
  }
  toCsv() {
    return (
      [
        this.columns.join(','),
        ...this.rows.map((row) => this.columns.map((key) => cell(row[key])).join(',')),
      ].join('\r\n') + '\r\n'
    )
  }
  download(name: string, demo: boolean) {
    if (!this.size) return
    const url = URL.createObjectURL(
      new Blob(['\uFEFF', this.toCsv()], { type: 'text/csv;charset=utf-8' }),
    )
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `senswear-${demo ? 'demo-' : ''}${name}-${new Date().toISOString().replaceAll(':', '-')}.csv`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
