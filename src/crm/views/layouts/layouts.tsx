// ============================================================
//  CONTEO DE LAYOUT — sube el PDF del plano y el sistema cuenta marcos y vigas
//  en la hoja de PLANTA. Total de vigas = vigas contadas en planta × niveles.
//  Si el PDF trae una hoja de ALZADO, de ahí se proponen los niveles y la altura
//  del marco. El plano se muestra con cada pieza resaltada para revisarlo: clic
//  en una pieza la quita del conteo (o incluye una dudosa). Herramienta de
//  cálculo: no guarda nada en la base.
// ============================================================
import * as React from 'react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { Icon } from '../../core/icons'
import { Field, Input, KPI } from '../../core/ui'
import { extractPageGeometry } from './extract'
import { detectLayout, elevationLevels, groupBeams, type BeamGroup, type Detection, type Line } from './detect'

type PageInfo = { n: number; det: Detection; w: number; h: number; m: number[] }

// pdf.js (~1 MB) se carga solo al entrar a esta vista.
let pdfjsReady: Promise<typeof import('pdfjs-dist')> | null = null
const loadPdfjs = () => (pdfjsReady ??= Promise.all([
  import('pdfjs-dist'),
  import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
]).then(([pdfjs, worker]) => {
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs
}).catch(e => { pdfjsReady = null; throw e }))

// Colores del resaltado (distintos del rojo/azul del plano).
const C = { beam: '#16a34a', loose: '#f59e0b', frame: '#7c3aed', doubtful: '#f59e0b', off: '#94a3b8', level: '#0891b2' }

const KIND_LABEL: Record<Detection['kind'], string> = { planta: 'planta', alzado: 'alzado', none: 'sin conteo' }

/** Extremos de una línea del PDF en coordenadas de la vista (matriz del viewport a escala 1). */
const ends = (l: Line, m: number[]) => {
  const [ax, ay, bx, by] = l.axis === 'h' ? [l.a0, l.pos, l.a1, l.pos] : [l.pos, l.a0, l.pos, l.a1]
  return {
    x1: m[0] * ax + m[2] * ay + m[4], y1: m[1] * ax + m[3] * ay + m[5],
    x2: m[0] * bx + m[2] * by + m[4], y2: m[1] * bx + m[3] * by + m[5],
  }
}

/** Pieza resaltada sobre el plano, con un trazo invisible más ancho para atinarle al clic. */
function Piece({ l, m, color, dashed, title, onClick }: { l: Line; m: number[]; color: string; dashed?: boolean; title: string; onClick?: () => void }) {
  const p = ends(l, m)
  return (
    <g className={onClick ? 'cursor-pointer' : undefined} onClick={onClick}>
      <title>{title}</title>
      <line {...p} stroke={color} strokeWidth={5} strokeOpacity={0.8} strokeLinecap="round"
        strokeDasharray={dashed ? '5 4' : undefined} vectorEffect="non-scaling-stroke" />
      {onClick && <line {...p} stroke="transparent" strokeWidth={14} vectorEffect="non-scaling-stroke" pointerEvents="stroke" />}
    </g>
  )
}

function LegendItem({ color, dashed, children }: { color: string; dashed?: boolean; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className="inline-block w-4" style={{ borderTop: `3px ${dashed ? 'dashed' : 'solid'} ${color}` }} />
      {children}
    </span>
  )
}

export function LayoutsPage() {
  const [fileName, setFileName] = React.useState('')
  const [doc, setDoc] = React.useState<PDFDocumentProxy | null>(null)
  const [loadingTask, setLoadingTask] = React.useState<PDFDocumentLoadingTask | null>(null)
  const [pages, setPages] = React.useState<PageInfo[]>([])
  const [pageIdx, setPageIdx] = React.useState(0)   // hoja que se está viendo
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [meta, setMeta] = React.useState<{ cliente?: string; plano?: string; nivelesCuadro?: string }>({})
  const [levels, setLevels] = React.useState('')
  const [frameH, setFrameH] = React.useState('')
  // Piezas con la decisión invertida (clave "hoja:id"): detectadas → quitadas; dudosas → incluidas.
  const [toggled, setToggled] = React.useState<Set<string>>(() => new Set())
  const [groupMm, setGroupMm] = React.useState<Record<string, string>>({})
  const [adjFrames, setAdjFrames] = React.useState('')
  const [adjBeams, setAdjBeams] = React.useState('')
  const [zoom, setZoom] = React.useState(1)
  const [dragOver, setDragOver] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  // Arrastre con el mouse para mover el plano (útil con zoom). Si hubo arrastre, el clic
  // que suelta el mouse no debe contar como clic sobre una pieza.
  const drag = React.useRef<{ x: number; y: number; sl: number; st: number; moved: boolean } | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const suppressClick = React.useRef(false)
  const onPanStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.pointerType !== 'mouse') return
    const el = scrollRef.current
    if (!el) return
    drag.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop, moved: false }
  }
  const onPanMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current, el = scrollRef.current
    if (!d || !el) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    // La captura del puntero se activa hasta que hay arrastre real: si se activara desde el
    // clic inicial, el navegador le entregaría el clic al contenedor y no a la pieza.
    if (!d.moved) { d.moved = true; setDragging(true); el.setPointerCapture(e.pointerId) }
    el.scrollLeft = d.sl - dx
    el.scrollTop = d.st - dy
  }
  const onPanEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    drag.current = null
    if (!d.moved) return
    setDragging(false)
    suppressClick.current = true
    const el = scrollRef.current
    if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
  }
  const onClickCapture = (e: React.MouseEvent) => {
    if (!suppressClick.current) return
    suppressClick.current = false
    e.stopPropagation(); e.preventDefault()
  }

  // Libera el documento de pdf.js al cambiar de archivo o salir de la vista.
  React.useEffect(() => () => { void loadingTask?.destroy() }, [loadingTask])

  const load = async (file: File) => {
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) { setError('El archivo debe ser un PDF.'); return }
    setBusy(true); setError('')
    let lt: PDFDocumentLoadingTask | null = null
    try {
      const pdfjs = await loadPdfjs()
      lt = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
      const d = await lt.promise
      const infos: PageInfo[] = []
      let text = ''
      for (let n = 1; n <= d.numPages; n++) {
        const page = await d.getPage(n)
        const { segs, texts } = await extractPageGeometry(page, pdfjs.OPS)
        const vp = page.getViewport({ scale: 1 })
        infos.push({ n, det: detectLayout(segs, texts), w: vp.width, h: vp.height, m: vp.transform })
        text += '\n' + texts.map(t => t.str).join('\n')
      }
      // Se abre en la hoja de planta con más vigas (si no hay, en la primera).
      const plan = infos.reduce((b, p, i) => (p.det.beams.length > (infos[b]?.det.beams.length ?? 0) ? i : b), 0)
      const elev = infos.find(p => p.det.elevation)?.det.elevation ?? null
      setDoc(d); setLoadingTask(lt); setPages(infos); setPageIdx(plan); setFileName(file.name); setZoom(1)
      setToggled(new Set()); setGroupMm({}); setAdjFrames(''); setAdjBeams('')
      // Datos del cuadro del plano; los niveles y la altura también pueden venir del alzado.
      const nivelesCuadro = /niveles?\s*:?\s*(\d{1,2})\b/i.exec(text)?.[1]
      setLevels(nivelesCuadro ?? (elev ? String(elev.levels) : ''))
      setFrameH(elev?.frameHeightMm ? String(elev.frameHeightMm) : '')
      setMeta({ cliente: /cliente\s*:\s*([^\n]+)/i.exec(text)?.[1].trim() || undefined, plano: /plano\s*:\s*(\S+)/i.exec(text)?.[1], nivelesCuadro })
    } catch (e) {
      void lt?.destroy()
      setError(`No se pudo leer el PDF${e instanceof Error ? `: ${e.message}` : ''}.`)
    } finally {
      setBusy(false)
    }
  }

  // Dibuja la hoja en el canvas; al hacer zoom se vuelve a dibujar con más resolución.
  React.useEffect(() => {
    const info = pages[pageIdx]
    if (!doc || !info) return
    let task: RenderTask | null = null
    let cancelled = false
    const t = window.setTimeout(async () => {   // varios clics de zoom seguidos → un solo dibujo
      const page = await doc.getPage(info.n)
      const canvas = canvasRef.current
      if (cancelled || !canvas) return
      const vp = page.getViewport({ scale: Math.min(2 * zoom, 8) })
      canvas.width = Math.floor(vp.width)
      canvas.height = Math.floor(vp.height)
      task = page.render({ canvas, viewport: vp })
      try { await task.promise } catch { /* cancelado por otro dibujo */ }
    }, 80)
    return () => { cancelled = true; window.clearTimeout(t); task?.cancel() }
  }, [doc, pages, pageIdx, zoom])

  // El conteo sale SIEMPRE de la hoja de planta (la de más vigas), se esté viendo la que sea.
  const planIdx = pages.reduce<number>((b, p, i) => (p.det.kind === 'planta' && (b < 0 || p.det.beams.length > pages[b].det.beams.length) ? i : b), -1)
  const plan = planIdx >= 0 ? pages[planIdx] : undefined
  const det = plan?.det
  const view = pages[pageIdx]
  const elevPage = pages.find(p => p.det.elevation)
  const key = (n: number, id: string) => `${n}:${id}`
  const isOnIn = (t: Set<string>, n: number, id: string, byDefault: boolean) => (t.has(key(n, id)) ? !byDefault : byDefault)
  const isOn = (n: number, id: string, byDefault: boolean) => isOnIn(toggled, n, id, byDefault)
  // Niveles que propone el alzado, ya con las vigas que se hayan quitado a mano.
  const elevLevelsIn = (t: Set<string>) => (elevPage?.det.elevation ? elevationLevels(elevPage.det.elevation.stacks, id => isOnIn(t, elevPage.n, id, true)) : 0)
  const elevation = elevPage?.det.elevation ? { ...elevPage.det.elevation, levels: elevLevelsIn(toggled) } : null
  const toggle = (n: number, id: string) => {
    const k = key(n, id), nx = new Set(toggled)
    if (nx.has(k)) nx.delete(k); else nx.add(k)
    setToggled(nx)
  }
  /** En el alzado un clic quita/incluye el NIVEL completo: todas las vigas a esa misma altura. */
  const toggleLevel = (id: string) => {
    const ev = elevPage?.det.elevation
    if (!elevPage || !ev) return
    const all = ev.stacks.flat()
    const b = all.find(x => x.id === id)
    if (!b) return
    // Tolerancia: una fracción de la separación entre niveles en la pila de la viga.
    const stack = ev.stacks.find(s => s.includes(b)) ?? [b]
    const poss = stack.map(x => x.pos).sort((p, q) => p - q)
    const gap = poss.length > 1 ? Math.min(...poss.slice(1).map((p, i) => p - poss[i])) : b.len
    const tol = 0.3 * gap
    const turnOff = isOn(elevPage.n, b.id, true)
    const nx = new Set(toggled)
    for (const x of all) {
      if (x.axis !== b.axis || Math.abs(x.pos - b.pos) > tol) continue
      const kx = key(elevPage.n, x.id)
      if (turnOff) nx.add(kx); else nx.delete(kx)
    }
    setToggled(nx)
    // Si el campo de niveles traía la propuesta del alzado, se actualiza con la nueva.
    if (levels === String(elevLevelsIn(toggled))) setLevels(String(elevLevelsIn(nx)))
  }
  const beams = plan && det ? [...det.beams.filter(b => isOn(plan.n, b.id, true)), ...det.doubtful.filter(b => isOn(plan.n, b.id, false))] : []
  const frames = plan && det ? det.frames.filter(f => isOn(plan.n, f.id, true)) : []
  const groups = groupBeams(beams, det?.mmPerUnit ?? null)
  const nAdjF = parseInt(adjFrames) || 0
  const nAdjB = parseInt(adjBeams) || 0
  const frameCount = frames.reduce((s, f) => s + f.count, 0) + nAdjF
  const beamsPlan = beams.length + nAdjB
  const lv = Math.max(0, parseInt(levels) || 0)
  const groupKey = (g: BeamGroup) => String(Math.round(g.len))
  const mmOf = (g: BeamGroup) => groupMm[groupKey(g)] ?? (g.mm != null ? String(g.mm) : '')
  const approxMm = (len: number) => (det?.mmPerUnit ? ` ≈ ${Math.round((len * det.mmPerUnit) / 10) * 10} mm` : '')
  const levelsMismatch = elevation && meta.nivelesCuadro && String(elevation.levels) !== meta.nivelesCuadro

  const summary = () => {
    const out = [`Conteo de layout — ${fileName}`]
    const head = [meta.cliente && `Cliente: ${meta.cliente}`, meta.plano && `Plano: ${meta.plano}`].filter(Boolean).join(' · ')
    if (head) out.push(head)
    out.push(`Marcos: ${frameCount}${frameH ? ` (altura ${frameH} mm)` : ''}`)
    out.push(`Vigas: ${beamsPlan} en planta × ${lv} niveles = ${beamsPlan * lv}`)
    for (const g of groups) out.push(`  • ${mmOf(g) ? `${mmOf(g)} mm` : 'Largo sin definir'}: ${g.ids.length} en planta → ${g.ids.length * lv}`)
    if (nAdjB) out.push(`  • Ajuste manual: ${nAdjB} en planta → ${nAdjB * lv}`)
    return out.join('\n')
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary())
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch { setError('No se pudo copiar al portapapeles.') }
  }

  /* ---- Capa de resaltado de la hoja que se está viendo ---- */
  const overlay = () => {
    if (!view) return null
    const d = view.det, n = view.n
    const editable = view === plan   // solo la hoja de planta afecta el conteo
    const loose = new Set(d.looseBeams)
    return (
      <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${view.w} ${view.h}`} preserveAspectRatio="none">
        {d.elevation?.stacks.flat().map(b => {
          const inc = isOn(n, b.id, true)
          return <Piece key={b.id} l={b} m={view.m} color={inc ? C.level : C.off} dashed={!inc}
            title={`Nivel — clic para ${inc ? 'quitar' : 'incluir'} este nivel (todas sus vigas)`} onClick={() => toggleLevel(b.id)} />
        })}
        {d.frames.map(f => {
          const inc = isOn(n, f.id, true)
          return <Piece key={f.id} l={f} m={view.m} color={inc ? C.frame : C.off} dashed={!inc}
            title={`Marco${f.count > 1 ? ` doble (cuenta ${f.count})` : ''} — clic para ${inc ? 'quitarlo' : 'incluirlo'}`}
            onClick={editable ? () => toggle(n, f.id) : undefined} />
        })}
        {d.beams.map(b => {
          const inc = isOn(n, b.id, true)
          return <Piece key={b.id} l={b} m={view.m} color={!inc ? C.off : loose.has(b.id) ? C.loose : C.beam} dashed={!inc}
            title={`Viga${approxMm(b.len)}${loose.has(b.id) ? ' · un extremo sin marco' : ''} — clic para ${inc ? 'quitarla' : 'incluirla'}`}
            onClick={editable ? () => toggle(n, b.id) : undefined} />
        })}
        {d.doubtful.map(b => {
          const inc = isOn(n, b.id, false)
          return <Piece key={b.id} l={b} m={view.m} color={inc ? C.beam : C.doubtful} dashed={!inc}
            title={`Trazo rojo sin marco${approxMm(b.len)} — ${inc ? 'incluido; clic para quitarlo' : 'no cuenta; clic para incluirlo'}`}
            onClick={editable ? () => toggle(n, b.id) : undefined} />
        })}
      </svg>
    )
  }

  const levelsSource = meta.nivelesCuadro ? 'según el cuadro del plano' : elevation ? 'leídos del alzado' : 'captúralos a la derecha'
  const modules = Math.round(beams.length / 2)   // cada módulo aporta viga de frente y de fondo
  const warnings = [
    !plan && { color: 'var(--danger)', text: 'No se encontró una hoja de planta con marcos y vigas. Revisa que el PDF traiga la vista de planta y venga de AutoCAD (no escaneado).' },
    det && det.looseBeams.length > 0 && { color: 'var(--warn)', text: `${det.looseBeams.length} viga${det.looseBeams.length === 1 ? '' : 's'} con un extremo sin marco detectado (en ámbar). Revísalas en el plano.` },
    det && det.doubtful.length > 0 && { color: undefined, text: `${det.doubtful.length} trazo${det.doubtful.length === 1 ? '' : 's'} rojo${det.doubtful.length === 1 ? '' : 's'} sin marco no se contaron (punteados). Si son vigas, haz clic para incluirlos.` },
  ].filter((w): w is { color: string | undefined; text: string } => !!w)

  return (
    <div>
      <div className="spread mb-[18px] flex-wrap">
        <div className="sec-title m-0"><h2>Conteo de layout</h2><span className="sub">Marcos y vigas desde el PDF del plano</span></div>
        <div className="flex gap-2 items-center flex-wrap">
          {doc && (
            <span className="doc-chip" title={fileName}>
              <Icon name="doc" size={14} /><span className="truncate max-w-[240px]">{fileName}</span>
            </span>
          )}
          {doc && <button className="btn btn-ghost" onClick={copy}><Icon name={copied ? 'check' : 'clip'} size={15} /> {copied ? 'Copiado' : 'Copiar resumen'}</button>}
          <button className="btn btn-primary" disabled={busy} onClick={() => inputRef.current?.click()}><Icon name="docPlus" size={15} /> {busy ? 'Leyendo…' : doc ? 'Cambiar PDF' : 'Subir PDF'}</button>
        </div>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = '' }} />
      </div>

      {error && <div className="card p-3.5 mb-4 text-[13px]" style={{ color: 'var(--danger)' }}>{error}</div>}

      {!doc ? (
        /* ---- Arranque: zona de carga + cómo funciona ---- */
        <div className="card px-6 py-12 text-center cursor-pointer"
          style={{ borderStyle: 'dashed', borderColor: dragOver ? 'var(--acc)' : undefined, background: dragOver ? 'var(--acc-ghost)' : undefined }}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) void load(f) }}>
          <span className="inline-flex items-center justify-center w-16 h-16 rounded-full text-acc" style={{ background: 'var(--acc-ghost)' }}><Icon name="ruler" size={30} /></span>
          <div className="font-display font-bold text-[18px] mt-4">{busy ? 'Leyendo el plano…' : 'Arrastra aquí el PDF del layout'}</div>
          <p className="meta mt-1.5">o haz clic para elegirlo · exportado de AutoCAD, no escaneado</p>
          <div className="grid grid-cols-3 gap-4 mt-9 max-w-[820px] mx-auto text-left max-[800px]:grid-cols-1">
            {[
              ['Sube el PDF', 'Con la vista de planta: marcos en azul y vigas en rojo o naranja. Si trae el alzado, de ahí se leen los niveles.'],
              ['Revisa el conteo', 'Cada marco y viga queda resaltado sobre el plano. Un clic quita o incluye la pieza.'],
              ['Captura los niveles', 'Vigas en planta × niveles por módulo = total de vigas. Copia el resumen al final.'],
            ].map(([t, s], i) => (
              <div key={t} className="flex gap-3 items-start">
                <span className="shrink-0 w-7 h-7 rounded-full inline-flex items-center justify-center font-display font-bold text-[13px] text-acc" style={{ background: 'var(--acc-ghost)' }}>{i + 1}</span>
                <div>
                  <div className="text-[13px] font-semibold text-tx-0">{t}</div>
                  <div className="meta mt-0.5 leading-normal">{s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* ---- Resumen ---- */}
          <div className="grid grid-cols-4 gap-3.5 mb-4 max-[1100px]:grid-cols-2">
            <KPI label="Marcos" value={frameCount} icon="grid" foot={frameH ? `altura ${frameH} mm` : 'altura sin capturar'} delay={0} />
            <KPI label="Vigas en planta" value={beamsPlan} icon="layers" foot={modules ? `${modules} módulos · frente y fondo` : 'sin vigas detectadas'} delay={60} />
            <KPI label="Niveles por módulo" value={lv} icon="kanban" foot={levelsSource} delay={120} />
            <KPI label="Vigas totales" value={beamsPlan * lv} icon="ruler" accent foot={`${beamsPlan} en planta × ${lv || '?'} niveles`} delay={180} />
          </div>

          <div className="grid gap-4 grid-cols-[minmax(0,1fr)_360px] max-[1100px]:grid-cols-1 items-start">
            {/* ---- Plano con las piezas resaltadas ---- */}
            <div className="card overflow-hidden min-w-0">
              <div className="flex items-center gap-3 flex-wrap px-4 py-3 border-b border-line">
                {pages.length > 1 ? (
                  <div className="seg">
                    {pages.map((p, i) => (
                      <button key={p.n} className={i === pageIdx ? 'on' : ''} onClick={() => setPageIdx(i)}>
                        Hoja {p.n} · {KIND_LABEL[p.det.kind]}{p.det.kind === 'planta' ? ` · ${p.det.beams.length} vigas` : ''}
                      </button>
                    ))}
                  </div>
                ) : <span className="text-[12.5px] font-semibold text-tx-1">Hoja única · {KIND_LABEL[view?.det.kind ?? 'none']}</span>}
                {(meta.cliente || meta.plano) && (
                  <span className="meta flex gap-3 flex-wrap">
                    {meta.cliente && <span><span className="label-k">Cliente</span> <span className="text-tx-1">{meta.cliente}</span></span>}
                    {meta.plano && <span><span className="label-k">Plano</span> <span className="text-tx-1">{meta.plano}</span></span>}
                  </span>
                )}
                <div className="flex-1" />
                <div className="flex items-center gap-1">
                  <button className="icon-btn" title="Alejar" disabled={zoom <= 1} onClick={() => setZoom(z => Math.max(1, +(z / 1.5).toFixed(2)))}><Icon name="minus" size={15} /></button>
                  <span className="meta w-[44px] text-center font-mono">{Math.round(zoom * 100)}%</span>
                  <button className="icon-btn" title="Acercar" disabled={zoom >= 6} onClick={() => setZoom(z => Math.min(6, +(z * 1.5).toFixed(2)))}><Icon name="plus" size={15} /></button>
                </div>
              </div>
              <div ref={scrollRef} className="overflow-auto bg-bg-1 select-none"
                style={{ height: 'clamp(480px, calc(100vh - 400px), 960px)', cursor: dragging ? 'grabbing' : 'grab' }}
                onPointerDown={onPanStart} onPointerMove={onPanMove} onPointerUp={onPanEnd} onPointerCancel={onPanEnd} onClickCapture={onClickCapture}>
                <div className="relative" style={{ width: `${zoom * 100}%` }}>
                  <canvas ref={canvasRef} className="block w-full h-auto bg-white" />
                  {overlay()}
                </div>
              </div>
              <div className="flex gap-x-4 gap-y-1 flex-wrap items-center px-4 py-2.5 text-[11.5px] text-tx-2 border-t border-line bg-bg-2">
                {view?.det.kind === 'alzado' ? (<>
                  <LegendItem color={C.level}>Nivel contado</LegendItem>
                  <LegendItem color={C.off} dashed>Nivel quitado</LegendItem>
                  <span className="meta">Alzado: de aquí salen los niveles y la altura del marco{plan ? `; el conteo es de la hoja ${plan.n}` : ''}. Clic en una viga quita o incluye ese nivel.</span>
                </>) : (<>
                  <LegendItem color={C.beam}>Viga contada</LegendItem>
                  <LegendItem color={C.loose}>Extremo sin marco</LegendItem>
                  <LegendItem color={C.doubtful} dashed>Dudosa (no cuenta)</LegendItem>
                  <LegendItem color={C.frame}>Marco</LegendItem>
                  <LegendItem color={C.off} dashed>Quitada</LegendItem>
                  <span className="meta">Clic en una pieza para quitarla o incluirla · arrastra para mover el plano.</span>
                </>)}
              </div>
            </div>

            {/* ---- Parámetros y desglose ---- */}
            <div className="flex flex-col gap-4 min-w-0">
              <div className="card">
                <div className="card-h py-3"><span className="ttl">Parámetros</span></div>
                <div className="card-b p-4 flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Niveles por módulo"><Input type="number" min={0} value={levels} onChange={e => setLevels(e.target.value)} placeholder="Ej. 5" /></Field>
                    <Field label="Altura del marco (mm)"><Input type="number" min={0} value={frameH} onChange={e => setFrameH(e.target.value)} placeholder="Opcional" /></Field>
                  </div>
                  {elevation && (
                    <div className="flex items-center gap-2 flex-wrap rounded-[8px] px-3 py-2 text-[12px] text-tx-2 bg-bg-1 border border-line">
                      <Icon name="layers" size={14} />
                      <span className="flex-1 min-w-0">
                        Alzado: <b className="text-tx-1">{elevation.levels} niveles</b>{elevation.frameHeightMm ? <> · marco <b className="text-tx-1">{elevation.frameHeightMm} mm</b></> : null}
                        {levelsMismatch && <span style={{ color: 'var(--warn)' }}> · el cuadro dice {meta.nivelesCuadro}</span>}
                      </span>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setLevels(String(elevation.levels)); if (elevation.frameHeightMm) setFrameH(String(elevation.frameHeightMm)) }}>Usar</button>
                    </div>
                  )}
                </div>
              </div>

              <div className="card overflow-hidden">
                <div className="card-h py-3"><span className="ttl">Vigas por largo</span><span className="sub ml-auto">× {lv || '?'} niveles</span></div>
                <table className="tbl">
                  <thead><tr><th>Largo</th><th className="num">Planta</th><th className="num">Total</th></tr></thead>
                  <tbody>
                    {groups.map(g => (
                      <tr key={groupKey(g)}>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <Input type="number" min={0} style={{ width: 92, padding: '6px 10px' }} value={mmOf(g)} placeholder="mm"
                              onChange={e => setGroupMm(s => ({ ...s, [groupKey(g)]: e.target.value }))} />
                            <span className="meta">mm</span>
                          </div>
                        </td>
                        <td className="num">{g.ids.length}</td>
                        <td className="num font-display font-bold">{g.ids.length * lv}</td>
                      </tr>
                    ))}
                    {nAdjB !== 0 && (
                      <tr><td className="text-tx-2 text-[12.5px]">Ajuste manual</td><td className="num">{nAdjB}</td><td className="num font-display font-bold">{nAdjB * lv}</td></tr>
                    )}
                    {!groups.length && !nAdjB && <tr><td colSpan={3} className="meta">{plan ? 'Sin vigas en la planta.' : 'Sin hoja de planta.'}</td></tr>}
                  </tbody>
                </table>
                {plan && (
                  <p className="meta px-4 py-2.5 m-0 leading-normal border-t border-line">
                    {det?.mmPerUnit
                      ? 'Largo aproximado según la escala de las cotas: ajústalo al largo comercial (ej. 1500, 2400).'
                      : 'No se pudo calcular la escala del plano: captura el largo de cada grupo.'}
                  </p>
                )}
              </div>

              <div className="card">
                <div className="card-h py-3"><span className="ttl">Ajuste manual</span><span className="sub ml-auto">piezas que el sistema no vio</span></div>
                <div className="card-b p-4 grid grid-cols-2 gap-3">
                  <Field label="Marcos (+/−)"><Input type="number" value={adjFrames} onChange={e => setAdjFrames(e.target.value)} placeholder="0" /></Field>
                  <Field label="Vigas en planta (+/−)"><Input type="number" value={adjBeams} onChange={e => setAdjBeams(e.target.value)} placeholder="0" /></Field>
                </div>
              </div>

              {warnings.length > 0 && (
                <div className="card p-4 text-[12.5px] flex flex-col gap-2 leading-normal">
                  {warnings.map(w => (
                    <div key={w.text} className="flex gap-2 items-start" style={{ color: w.color }}>
                      <Icon name="alert" size={14} className="shrink-0 mt-0.5" /><span>{w.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
