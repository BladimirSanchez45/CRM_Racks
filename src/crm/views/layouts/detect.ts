// ============================================================
//  CONTEO DE LAYOUT — detección de marcos y vigas en la vista de planta.
//  Trabaja sobre la geometría vectorial del PDF (segmentos rectos con color),
//  sin depender de pdf.js: sirve igual en el navegador y en pruebas con Node.
//  Convención de colores del plano: vigas en rojo/naranja, marcos en azul.
//
//  Reglas (todas relativas al largo típico de viga, así no dependen de la escala):
//   - Viga: trazo rojo recto y largo. Su contorno viene dibujado con 2 líneas
//     paralelas muy juntas, que se emparejan como UNA viga.
//   - Marco: barra azul perpendicular a las vigas que toca extremos de viga en al
//     menos dos posiciones distintas (frente y fondo del rack). Así se descartan
//     postes sueltos y las miniaturas del cuadro de datos.
//   - Una viga cuenta si tiene marco en al menos uno de sus extremos; las demás
//     quedan como "dudosas" para que la persona decida.
// ============================================================

export type Seg = { x1: number; y1: number; x2: number; y2: number; color: string }
/** Texto de la página: contenido, centro, dirección (radianes) y alto, en coordenadas del PDF. */
export type TextItem = { str: string; x: number; y: number; angle: number; height: number }
export type Axis = 'h' | 'v'
/** Tramo recto alineado a un eje: `pos` es la coordenada fija y [a0, a1] el rango sobre el eje. */
export type Line = { axis: Axis; pos: number; a0: number; a1: number }
/** `w`: separación entre los 2 trazos del contorno (0 si la viga viene como una sola línea). */
export type Beam = Line & { id: string; len: number; w: number }
/** Marco visto en planta. `count` > 1 cuando una sola barra cubre dos racks espalda con espalda. */
export type Frame = Line & { id: string; count: number }
export type BeamGroup = { len: number; mm: number | null; ids: string[] }
/** Hoja de ALZADO: las vigas se ven apiladas (una por nivel) entre dos postes. */
export type Elevation = {
  levels: number             // niveles = vigas apiladas en una misma pila
  stacks: Beam[][]           // las pilas que dieron ese número (para resaltarlas y corregirlas)
  frameHeightMm: number | null // cota más grande de la hoja: en un alzado, la altura del marco
}
export type Detection = {
  kind: 'planta' | 'alzado' | 'none'
  beams: Beam[]              // vigas confirmadas (con marco en algún extremo)
  doubtful: Beam[]           // trazos tipo viga sin marco: no cuentan salvo que se incluyan a mano
  frames: Frame[]
  mmPerUnit: number | null   // escala estimada a partir de las cotas (null si no se pudo)
  looseBeams: string[]       // vigas confirmadas con un extremo sin marco (revisar)
  elevation: Elevation | null // solo cuando la hoja se leyó como alzado
}

const lenOf = (l: Line) => l.a1 - l.a0
const overlap = (a: Line, b: Line) => Math.max(0, Math.min(a.a1, b.a1) - Math.max(a.a0, b.a0))
const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
const percentile = (xs: number[], p: number) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length * p))]
}

/** Clasifica un color '#rrggbb': viga (rojo/naranja), marco (azul), oscuro (cotas) o nada. */
export function colorKind(hex: string): 'beam' | 'frame' | 'dark' | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return null
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (max < 0.25) return 'dark'
  if (max < 0.4 || d / max < 0.5) return null
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h = (h * 60 + 360) % 360
  if (h <= 40 || h >= 340) return 'beam'
  if (h >= 200 && h <= 260) return 'frame'
  return null
}

function toLine(s: Seg): Line | null {
  const dx = Math.abs(s.x2 - s.x1), dy = Math.abs(s.y2 - s.y1)
  if (dx > 0 && dy <= dx * 0.02) return { axis: 'h', pos: (s.y1 + s.y2) / 2, a0: Math.min(s.x1, s.x2), a1: Math.max(s.x1, s.x2) }
  if (dy > 0 && dx <= dy * 0.02) return { axis: 'v', pos: (s.x1 + s.x2) / 2, a0: Math.min(s.y1, s.y2), a1: Math.max(s.y1, s.y2) }
  return null
}

/** Quita trazos repetidos (el mismo tramo dibujado dos veces). */
function dedupe(lines: Line[], tol: number): Line[] {
  const seen = new Set<string>()
  return lines.filter(l => {
    const k = `${l.axis}|${Math.round(l.pos / tol)}|${Math.round(l.a0 / tol)}|${Math.round(l.a1 / tol)}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** Empareja los dos trazos del contorno de cada viga (dos líneas paralelas muy juntas).
 *  Recorre por posición: cada línea se une con la siguiente paralela más cercana que la
 *  traslape casi completa; así, en racks espalda con espalda, 4 líneas juntas dan 2 vigas. */
function pairBeams(lines: Line[], tol: number): Beam[] {
  const out: Beam[] = []
  for (const axis of ['h', 'v'] as const) {
    const ls = lines.filter(l => l.axis === axis).sort((a, b) => a.pos - b.pos || a.a0 - b.a0)
    const used = new Uint8Array(ls.length)
    for (let i = 0; i < ls.length; i++) {
      if (used[i]) continue
      used[i] = 1
      const a = ls[i], La = lenOf(a), maxW = 0.08 * La
      let p = -1
      for (let j = i + 1; j < ls.length && ls[j].pos - a.pos <= maxW; j++) {
        const b = ls[j], Lb = lenOf(b)
        if (used[j] || b.pos - a.pos < tol) continue   // misma línea (colineal): no es su pareja
        if (Math.abs(La - Lb) <= 0.2 * La && overlap(a, b) >= 0.8 * Math.min(La, Lb)) { p = j; break }
      }
      const b = p >= 0 ? ls[p] : a
      if (p >= 0) used[p] = 1
      const a0 = (a.a0 + b.a0) / 2, a1 = (a.a1 + b.a1) / 2
      out.push({ axis, pos: (a.pos + b.pos) / 2, a0, a1, id: '', len: a1 - a0, w: b.pos - a.pos })
    }
  }
  return out
}

type EndPoint = { x: number; y: number; axis: Axis; pos: number }

/** Rejilla de extremos de viga para buscar rápido cuáles toca una barra. */
function endGrid(beams: Beam[], cell: number) {
  const grid = new Map<string, EndPoint[]>()
  const put = (x: number, y: number, b: Beam) => {
    const k = `${Math.floor(x / cell)}|${Math.floor(y / cell)}`
    let arr = grid.get(k)
    if (!arr) grid.set(k, arr = [])
    arr.push({ x, y, axis: b.axis, pos: b.pos })
  }
  for (const b of beams) {
    if (b.axis === 'h') { put(b.a0, b.pos, b); put(b.a1, b.pos, b) }
    else { put(b.pos, b.a0, b); put(b.pos, b.a1, b) }
  }
  /** Posiciones de las vigas perpendiculares a `f` con un extremo junto a `f`. */
  return (f: Line, tEnd: number, slack: number): number[] => {
    const [x0, x1, y0, y1] = f.axis === 'v'
      ? [f.pos - tEnd, f.pos + tEnd, f.a0 - slack, f.a1 + slack]
      : [f.a0 - slack, f.a1 + slack, f.pos - tEnd, f.pos + tEnd]
    const res: number[] = []
    for (let cx = Math.floor(x0 / cell); cx <= Math.floor(x1 / cell); cx++) {
      for (let cy = Math.floor(y0 / cell); cy <= Math.floor(y1 / cell); cy++) {
        for (const p of grid.get(`${cx}|${cy}`) ?? []) {
          if (p.axis !== f.axis && p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) res.push(p.pos)
        }
      }
    }
    return res
  }
}

function detectFrames(lines: Line[], beams: Beam[], Lmed: number): Frame[] {
  const tEnd = 0.1 * Lmed     // qué tan cerca del extremo de una viga debe pasar el marco
  const tSpan = 0.04 * Lmed   // holgura en las puntas de la barra del marco
  const tJoin = 0.08 * Lmed   // trazos paralelos a esta distancia son el mismo marco (contorno, postes)
  const touched = endGrid(beams, tEnd)
  const cand = lines.filter(l => { const L = lenOf(l); return L >= 0.05 * Lmed && L <= 2 * Lmed })

  // Une trazos paralelos cercanos que se traslapan: contorno doble de la barra y lados de los postes.
  const parent = cand.map((_, i) => i)
  const find = (i: number): number => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i }
  for (const axis of ['h', 'v'] as const) {
    const idx = cand.map((_, i) => i).filter(i => cand[i].axis === axis).sort((a, b) => cand[a].pos - cand[b].pos)
    for (let m = 0; m < idx.length; m++) {
      for (let n = m + 1; n < idx.length && cand[idx[n]].pos - cand[idx[m]].pos <= tJoin; n++) {
        const a = cand[idx[m]], b = cand[idx[n]], ov = overlap(a, b)
        if (ov > 0 && ov >= 0.5 * Math.min(lenOf(a), lenOf(b))) parent[find(idx[m])] = find(idx[n])
      }
    }
  }
  const groups = new Map<number, Line[]>()
  cand.forEach((l, i) => {
    const r = find(i)
    const g = groups.get(r)
    if (g) g.push(l); else groups.set(r, [l])
  })

  const frames: Frame[] = []
  for (const g of groups.values()) {
    // La barra del marco es el trazo más largo del grupo (los postes son cortos).
    const main = g.reduce((a, b) => (lenOf(b) > lenOf(a) ? b : a))
    const bars = g.filter(l => lenOf(l) >= 0.8 * lenOf(main))
    const bar: Line = { axis: main.axis, pos: bars.reduce((s, l) => s + l.pos, 0) / bars.length, a0: main.a0, a1: main.a1 }
    const hits = touched(bar, tEnd, tSpan).sort((a, b) => a - b)
    const distinct: number[] = []
    for (const p of hits) if (!distinct.length || p - distinct[distinct.length - 1] > 0.02 * Lmed) distinct.push(p)
    // Un marco real une el frente y el fondo del rack: debe haber viga junto a CADA punta de la
    // barra. Descarta líneas azules que solo cruzan trazos rojos (p. ej. del cuadro de datos).
    const tNear = Math.max(0.1 * Lmed, 0.15 * lenOf(bar))
    if (distinct.length < 2 || Math.abs(distinct[0] - bar.a0) > tNear || Math.abs(bar.a1 - distinct[distinct.length - 1]) > tNear) continue
    frames.push({ ...bar, id: '', count: Math.max(1, Math.round(distinct.length / 2)) })
  }
  return frames
}

/** ¿Hay un marco en el extremo (x, y) de una viga con eje `axis`? */
function frameIndex(frames: Frame[], Lmed: number) {
  const tEnd = 0.1 * Lmed
  return (axis: Axis, end: number, pos: number) => frames.some(f =>
    f.axis !== axis && Math.abs(f.pos - end) <= tEnd && pos >= f.a0 - tEnd && pos <= f.a1 + tEnd)
}

/** Escala (mm por unidad del PDF) a partir de las cotas "NNNNmm" y su línea de cota. */
function estimateScale(texts: TextItem[], dark: Line[]): number | null {
  // Solo las cotas del dibujo principal: las de las miniaturas del cuadro de datos usan
  // letra varias veces más chica y darían una escala equivocada.
  const dims = texts.filter(t => /\d\s*mm/i.test(t.str))
  const hMax = Math.max(0, ...dims.map(t => t.height))
  const found: { mm: number; L: number }[] = []
  for (const t of dims) {
    if (t.height < 0.4 * hMax) continue
    const m = /(\d+(?:[.,]\d+)?)\s*mm/i.exec(t.str)
    if (!m) continue
    const mm = parseFloat(m[1].replace(',', '.'))
    const L = mm > 0 ? dimLength(t, dark) : null
    if (L) found.push({ mm, L })
  }
  if (found.length < 2) return null
  // Pesan las cotas largas: medir sin las puntas de flecha deja un error fijo que en una
  // cota corta se nota mucho más.
  const Lmax = Math.max(...found.map(f => f.L))
  const ests = found.filter(f => f.L >= 0.4 * Lmax).map(f => f.mm / f.L)
  const med = median(ests)
  return ests.filter(e => Math.abs(e - med) <= 0.05 * med).length >= 2 ? med : null
}

/** Largo de la línea de cota de un texto (unidades del PDF). La línea puede venir entera,
 *  con el texto encima de su centro, o partida en dos mitades con el texto en el hueco.
 *  No se usa la dirección del texto: AutoCAD suele escribirlo horizontal aunque la cota
 *  sea vertical. */
function dimLength(t: TextItem, dark: Line[]): number | null {
  let bestD = Infinity, bestL = 0
  const consider = (d: number, L: number) => { if (d < bestD) { bestD = d; bestL = L } }
  for (const axis of ['h', 'v'] as const) {
    const along = axis === 'h' ? t.x : t.y, across = axis === 'h' ? t.y : t.x
    const ls = dark.filter(l => l.axis === axis && Math.abs(l.pos - across) <= 3 * t.height && lenOf(l) >= t.height)
    for (const l of ls) {
      const d = Math.abs(l.pos - across), L = lenOf(l)
      // Entera: el texto cae cerca del centro de la línea.
      if (L >= 4 * t.height && Math.abs(along - (l.a0 + l.a1) / 2) <= 0.15 * L) consider(d, L)
      // Partida: esta mitad termina antes del texto y otra colineal, de largo parecido, empieza después.
      if (d > 1.5 * t.height || l.a1 > along + 0.5 * t.height) continue
      for (const r of ls) {
        if (r === l || Math.abs(r.pos - l.pos) > 0.05 * t.height || r.a0 < along - 0.5 * t.height) continue
        const gap = r.a0 - l.a1, Lr = lenOf(r)
        if (gap < 0.5 * t.height || gap > 12 * t.height || Math.abs(Lr - L) > 0.2 * Math.max(Lr, L)) continue
        consider(d, r.a1 - l.a0)
      }
    }
  }
  return bestL || null
}

/** Lee la hoja como ALZADO: agrupa las vigas en pilas (mismo tramo, distinta altura) y toma
 *  como niveles el tamaño de pila más frecuente. Se usa solo cuando no hubo planta. */
function detectElevation(cands: Beam[], texts: TextItem[]): Elevation | null {
  const stacks: Beam[][] = []
  for (const b of cands) {
    const tol = 0.05 * b.len
    const s = stacks.find(st => st[0].axis === b.axis && Math.abs(st[0].a0 - b.a0) <= tol && Math.abs(st[0].a1 - b.a1) <= tol)
    if (s) s.push(b); else stacks.push([b])
  }
  const real = stacks.filter(s => s.length >= 2)
  if (!real.length) return null
  // Vota cada pila por su tamaño, ponderado por cuántas vigas trae; empate → la más alta.
  const votes = new Map<number, number>()
  for (const s of real) votes.set(s.length, (votes.get(s.length) ?? 0) + s.length)
  const levels = [...votes.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]
  const chosen = real.filter(s => s.length === levels)
  chosen.flat().forEach((b, i) => { b.id = `e${i}` })
  // Altura del marco: la cota más grande de la hoja (con letra de tamaño normal, no de miniatura).
  const dims = texts.filter(t => /\d\s*mm/i.test(t.str))
  const hMax = Math.max(0, ...dims.map(t => t.height))
  let frameHeightMm: number | null = null
  for (const t of dims) {
    if (t.height < 0.4 * hMax) continue
    const v = parseFloat((/(\d+(?:[.,]\d+)?)\s*mm/i.exec(t.str)?.[1] ?? '').replace(',', '.'))
    if (v > (frameHeightMm ?? 0)) frameHeightMm = v
  }
  return { levels, stacks: chosen, frameHeightMm }
}

/** Niveles según las pilas del alzado, contando solo las vigas que sigan incluidas:
 *  el tamaño de pila más frecuente (empate → el mayor). */
export function elevationLevels(stacks: Beam[][], isOn: (id: string) => boolean): number {
  const votes = new Map<number, number>()
  for (const s of stacks) {
    const n = s.filter(b => isOn(b.id)).length
    if (n > 0) votes.set(n, (votes.get(n) ?? 0) + n)
  }
  return [...votes.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0
}

/** Filtro: ¿la línea cae dentro del rectángulo que envuelve a `ref` (con margen `pad`)? */
function inZone(ref: Line[], pad: number) {
  const box = (l: Line) => (l.axis === 'h' ? [l.a0, l.a1, l.pos, l.pos] : [l.pos, l.pos, l.a0, l.a1])
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const l of ref) {
    const [ax0, ax1, ay0, ay1] = box(l)
    x0 = Math.min(x0, ax0); x1 = Math.max(x1, ax1); y0 = Math.min(y0, ay0); y1 = Math.max(y1, ay1)
  }
  return (l: Line) => {
    const [ax0, ax1, ay0, ay1] = box(l)
    return ax0 >= x0 - pad && ax1 <= x1 + pad && ay0 >= y0 - pad && ay1 <= y1 + pad
  }
}

export function detectLayout(segs: Seg[], texts: TextItem[]): Detection {
  const beamL: Line[] = [], frameL: Line[] = [], darkL: Line[] = []
  for (const s of segs) {
    const k = colorKind(s.color)
    if (!k) continue
    const l = toLine(s)
    if (!l || lenOf(l) <= 0) continue
    if (k === 'beam') beamL.push(l); else if (k === 'frame') frameL.push(l); else darkL.push(l)
  }
  const mmPerUnit = estimateScale(texts, darkL)
  if (!beamL.length) return { kind: 'none', beams: [], doubtful: [], frames: [], mmPerUnit, looseBeams: [], elevation: null }

  // Largo de referencia: percentil 90 de los trazos rojos (las vigas dominan esa cola).
  // Se descartan los trazos mucho más cortos: tapas del contorno y miniaturas del cuadro de datos.
  const Lref = percentile(beamL.map(lenOf), 0.9)
  const tol = Lref * 0.002
  const paired = pairBeams(dedupe(beamL, tol).filter(l => lenOf(l) >= 0.25 * Lref), tol)
  // El perfil de la viga (separación entre sus 2 trazos) mide casi lo mismo en todo el plano;
  // en las miniaturas del cuadro de datos es varias veces más delgado: se descartan.
  const Wref = percentile(paired.filter(b => b.w > 0).map(b => b.w), 0.9)
  const cands = paired.filter(b => b.w === 0 || b.w >= 0.4 * Wref)
  const Lmed = median(cands.map(b => b.len))
  const frames = detectFrames(dedupe(frameL, tol), cands, Lmed)
  frames.forEach((f, i) => { f.id = `f${i}` })

  const hasFrame = frameIndex(frames, Lmed)
  const beams: Beam[] = [], doubtful: Beam[] = [], looseBeams: string[] = []
  for (const b of cands) {
    const e0 = hasFrame(b.axis, b.a0, b.pos), e1 = hasFrame(b.axis, b.a1, b.pos)
    if (e0 || e1) {
      b.id = `b${beams.length}`
      beams.push(b)
      if (!(e0 && e1)) looseBeams.push(b.id)
    } else {
      doubtful.push(b)
    }
  }
  // Sin planta, se intenta leer la hoja como alzado (niveles y altura del marco).
  const elevation = beams.length ? null : detectElevation(cands, texts)
  const kind = beams.length ? 'planta' : elevation ? 'alzado' : 'none'
  // Las dudosas solo se muestran dentro de la zona del dibujo (las del cuadro de datos no).
  // En un alzado no aplican; si la hoja no se entendió, se muestran todas para incluirlas a mano.
  const shown = kind === 'planta' ? doubtful.filter(inZone(beams, 0.3 * Lmed)) : kind === 'alzado' ? [] : doubtful
  shown.forEach((b, i) => { b.id = `d${i}` })
  return { kind, beams, doubtful: shown, frames, mmPerUnit, looseBeams, elevation }
}

/** Agrupa vigas por largo (±3%). `lenOf` en unidades del PDF; `mm` con la escala dada. */
export function groupBeams(beams: Beam[], mmPerUnit: number | null): BeamGroup[] {
  const sorted = [...beams].sort((a, b) => a.len - b.len)
  const out: BeamGroup[] = []
  let cur: Beam[] = []
  const flush = () => {
    if (!cur.length) return
    const len = median(cur.map(b => b.len))
    out.push({ len, mm: mmPerUnit ? Math.round((len * mmPerUnit) / 10) * 10 : null, ids: cur.map(b => b.id) })
    cur = []
  }
  for (const b of sorted) {
    if (cur.length && b.len > cur[0].len * 1.03) flush()
    cur.push(b)
  }
  flush()
  return out.sort((a, b) => b.ids.length - a.ids.length)
}
