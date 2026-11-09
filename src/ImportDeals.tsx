import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Modal } from './components'
import { useCRM } from './crm-context'
import { readDeals, template } from './csv'
import type { Row } from './csv'

export default function ImportDeals({ onClose }: { onClose: () => void }) {
  const { command } = useCRM()
  const [rows, setRows] = useState<Row[]>([]), [problem, setProblem] = useState(''), [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ done: number; failed: { line: number; message: string }[] } | null>(null)
  const valid = rows.filter(r => !r.errors.length), invalid = rows.filter(r => r.errors.length)
  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setResult(null)
    if (!file) { setRows([]); setProblem(''); return }
    const read = readDeals(await file.text())
    setRows(read.rows); setProblem(read.problem)
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true)
    const failed: { line: number; message: string }[] = []
    let done = 0
    for (const row of valid) {
      try { await command('intake', row.payload); done++ } catch (e) { failed.push({ line: row.line, message: (e as Error).message }) }
    }
    setResult({ done, failed }); setRows([]); setBusy(false)
  }
  function download() {
    const url = URL.createObjectURL(new Blob(['\uFEFF' + template], { type: 'text/csv;charset=utf-8' })), link = document.createElement('a')
    link.href = url; link.download = 'plantilla-negocios.csv'; link.click(); URL.revokeObjectURL(url)
  }
  return <Modal title="Importar negocios" onClose={onClose} wide><form onSubmit={e => void submit(e)}><div className="form-body">
    <p className="form-intro">Sube un archivo CSV con un negocio por fila. Columnas: Empresa y Servicio son obligatorias; RUC, Contacto, Correo, Teléfono, Responsable, Origen y Notas son opcionales. Cada fila entra como cotización solicitada en la etapa Nuevo.</p>
    <p><button type="button" className="text-button" onClick={download}>Descargar plantilla</button></p>
    <label>Archivo CSV<input type="file" accept=".csv,text/csv" onChange={e => void pick(e)} disabled={busy} /></label>
    {problem && <p className="error" role="alert">{problem}</p>}
    {rows.length > 0 && <p role="status" className="hint">{valid.length} filas listas para importar{invalid.length ? ` · ${invalid.length} con errores que se omitirán` : ''}.</p>}
    {invalid.length > 0 && <ul className="import-errors">{invalid.slice(0, 8).map(r => <li key={r.line}>Fila {r.line}: {r.errors.join('; ')}</li>)}{invalid.length > 8 && <li>… y {invalid.length - 8} más</li>}</ul>}
    {result && <div role="status" className="info-strip">Se importaron {result.done} negocios{result.failed.length ? ` y ${result.failed.length} fallaron` : ''}.</div>}
    {result?.failed.map(f => <p className="error" key={f.line}>Fila {f.line}: {f.message}</p>)}
  </div><footer><button type="button" onClick={onClose} disabled={busy}>Cerrar</button><button className="primary" disabled={busy || !valid.length}>{busy ? 'Importando…' : `Importar ${valid.length} negocios`}</button></footer></form></Modal>
}
