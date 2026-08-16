import { ChangeEvent, useMemo, useState } from 'react'

type ModuleId = 'inspector' | 'prompt' | 'output'

type Inspection = {
  filename: string
  format: string | null
  size_bytes: number
  width: number | null
  height: number | null
  mode: string | null
  generator: string
  metadata_keys: string[]
  comfyui: {
    workflow_found: boolean
    prompt_found: boolean
    workflow: unknown
    prompt: unknown
  }
  raw_metadata: Record<string, unknown>
}

const modules: Array<{ id: ModuleId; label: string; subtitle: string }> = [
  { id: 'inspector', label: 'Inspector', subtitle: 'Inspect metadata and embedded workflows' },
  { id: 'prompt', label: 'Prompt Architect', subtitle: 'Compose model-aware prompts' },
  { id: 'output', label: 'Output', subtitle: 'Crop, resize, clean and convert' },
]

function App() {
  const [active, setActive] = useState<ModuleId>('inspector')
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function inspect(file: File) {
    setBusy(true)
    setError('')
    setInspection(null)
    const body = new FormData()
    body.append('file', file)

    try {
      const response = await fetch('http://127.0.0.1:8000/api/inspect', { method: 'POST', body })
      if (!response.ok) throw new Error((await response.json()).detail ?? 'Inspection failed')
      setInspection(await response.json())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Inspection failed')
    } finally {
      setBusy(false)
    }
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) void inspect(file)
  }

  const dimensions = useMemo(() => {
    if (!inspection?.width || !inspection.height) return '—'
    return `${inspection.width} × ${inspection.height}`
  }, [inspection])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">R/</div>
          <div><strong>ReversenUI</strong><span>local workbench</span></div>
        </div>
        <nav>
          {modules.map((module) => (
            <button key={module.id} className={active === module.id ? 'nav-item active' : 'nav-item'} onClick={() => setActive(module.id)}>
              <strong>{module.label}</strong><span>{module.subtitle}</span>
            </button>
          ))}
        </nav>
        <div className="local-badge">127.0.0.1 · local only</div>
      </aside>

      <main>
        <header><div><span className="eyebrow">REVERSENUI / {active.toUpperCase()}</span><h1>{modules.find((module) => module.id === active)?.label}</h1></div></header>

        {active === 'inspector' && (
          <section className="workspace">
            <label className="dropzone">
              <input type="file" accept="image/*" onChange={onFile} />
              <span className="drop-title">{busy ? 'Inspecting…' : 'Drop an artifact or choose a file'}</span>
              <span>PNG, JPEG, WebP and other Pillow-readable images · max 64 MiB</span>
            </label>

            {error && <div className="error">{error}</div>}

            {inspection && (
              <div className="result-grid">
                <article className="card summary">
                  <span className="card-label">Artifact</span>
                  <h2>{inspection.filename}</h2>
                  <dl>
                    <div><dt>Format</dt><dd>{inspection.format ?? '—'}</dd></div>
                    <div><dt>Dimensions</dt><dd>{dimensions}</dd></div>
                    <div><dt>Mode</dt><dd>{inspection.mode ?? '—'}</dd></div>
                    <div><dt>Generator</dt><dd>{inspection.generator}</dd></div>
                  </dl>
                </article>

                <article className="card">
                  <span className="card-label">ComfyUI</span>
                  <div className="checks">
                    <div><span>Workflow</span><strong className={inspection.comfyui.workflow_found ? 'ok' : 'muted'}>{inspection.comfyui.workflow_found ? 'FOUND' : 'NOT FOUND'}</strong></div>
                    <div><span>API Prompt</span><strong className={inspection.comfyui.prompt_found ? 'ok' : 'muted'}>{inspection.comfyui.prompt_found ? 'FOUND' : 'NOT FOUND'}</strong></div>
                  </div>
                </article>

                <article className="card raw">
                  <span className="card-label">Raw metadata</span>
                  <pre>{JSON.stringify(inspection.raw_metadata, null, 2)}</pre>
                </article>
              </div>
            )}
          </section>
        )}

        {active === 'prompt' && <ModuleShell title="Prompt Architect" text="Base model + text encoder + parser profiles will drive ordered prompt drawers here." />}
        {active === 'output' && <ModuleShell title="Output Pipeline" text="One ordered pipeline will crop, resize, sanitize metadata and encode the selected output format." />}
      </main>
    </div>
  )
}

function ModuleShell({ title, text }: { title: string; text: string }) {
  return <section className="workspace"><div className="module-shell"><span className="card-label">v0.1 shell</span><h2>{title}</h2><p>{text}</p></div></section>
}

export default App
