// ============================================================
//  CONTEO DE LAYOUT — detección de marcos y vigas en la vista de planta.
//  Trabaja sobre la geometría vectorial del PDF (segmentos rectos con color),
//  sin depender de pdf.js: sirve igual en el navegador y en pruebas con Node.
//  Convención de colores del plano: vigas en rojo/naranja, marcos en azul.
//
//  Reglas (todas relativas al largo típico de viga, así no dependen de la escala):
//   - Viga: trazo rojo recto y largo. Su perfil viene dibujado con 2 o 3 líneas
//     paralelas muy juntas, que se agrupan como UNA viga.
//   - Marco: barra azul perpendicular a las vigas que toca extremos de viga en sus
//     dos puntas (frente y fondo del rack). Se descartan las barras mucho más
//     cortas que el marco típico (distanciadores, cajones de poste) y las mucho
//     más largas (postes de un alzado dibujado en la misma hoja).
//   - Una viga cuenta si tiene marco en al menos uno de sus extremos. Los racks
//     aislados muy pequeños (dibujos de detalle) y los trazos sin marco quedan
//     como "dudosos" para que la persona decida.
//   - Alzado: vigas apiladas (una por nivel) sin marco de planta; de ahí salen
//     los niveles y, con los postes, la altura del marco.
// ============================================================

export type Seg = { x1: number; y1: number; x2: number; y2: number; color: string }
/** Texto de la página: contenido, centro, dirección (radianes) y alto, en coordenadas del PDF. */
export type TextItem = { str: string; x: number; y: number; angle: number; height: number }
export type Axis = 'h' | 'v'
/** Tramo recto alineado a un eje: `pos` es la coordenada fija y [a0, a1] el rango sobre el eje. */
export type Line = { axis: Axis; pos: number; a0: number; a1: number }
/** `w`: ancho del perfil dibujado (0 si la viga viene como una sola línea). */
export type Beam = Line & { id: string; len: number; w: number }
/** Marco visto en planta. `count` > 1 cuando una sola barra cubre dos racks espalda con espalda. */
export type Frame = Line & { id: string; count: number }
export type BeamGroup = { len: number; mm: number | null; ids: string[] }
/** ALZADO: las vigas se ven apiladas (una por nivel) entre dos postes. */
export type Elevation = {
  levels: number             // niveles = vigas apiladas en una misma pila
  stacks: Beam[][]           // las pilas que dieron ese número (para resaltarlas y corregirlas)
  frameHeightMm: number | null // altura del marco: largo del poste a escala, o la cota más grande
}
export type Detection = {
  kind: 'planta' | 'alzado' | 'none'
  beams: Beam[]              // vigas confirmadas (con marco en algún extremo)
  doubtful: Beam[]           // trazos tipo viga sin marco o racks aislados muy pequeños: no cuentan salvo que se incluyan a mano
  frames: Frame[]
  mmPerUnit: number | null   // escala estimada a partir de las cotas (null si no se pudo)
  looseBeams: string[]       // vigas confirmadas con un extremo sin marco (revisar)
  elevation: Elevation | null // niveles/altura leídos de un alzado (en esta hoja u otra)
  dimsMm: number[]           // valores de las cotas "NNNNmm" de la hoja (para ajustar largos)
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

/** Agrupa las líneas paralelas del perfil de cada viga (2 o 3 trazos muy juntos con el mismo
 *  tramo) en UNA viga. Recorre por posición encadenando la siguiente línea cercana; la cadena se
 *  corta si el hueco crece mucho respecto a los huecos internos del perfil: así, en racks espalda
 *  con espalda, la viga de fondo de un rack y la del vecino no se funden aunque estén cerca. */
function chainBeams(lines: Line[], tol: number): Beam[] {
  const out: Beam[] = []
  for (const axis of ['h', 'v'] as const) {
    const ls = lines.filter(l => l.axis === axis).sort((a, b) => a.pos - b.pos || a.a0 - b.a0)
    const used = new Uint8Array(ls.length)
    for (let i = 0; i < ls.length; i++) {
      if (used[i]) continue
      used[i] = 1
      // Ancho máximo del perfil completo (medido desde la primera línea): así dos vigas de fondo
      // que se tocan en racks espalda con espalda no se funden en una.
      const a = ls[i], La = lenOf(a), maxW = 0.06 * La
      const chain = [a]
      let last = a, maxGap = 0
      for (let j = i + 1; j < ls.length && ls[j].pos - a.pos <= maxW; j++) {
        const b = ls[j], Lb = lenOf(b), gap = b.pos - last.pos
        if (used[j] || gap < tol) continue   // misma línea (colineal): no es parte del perfil
        if (Math.abs(La - Lb) > 0.2 * La || overlap(a, b) < 0.8 * Math.min(La, Lb)) continue
        if (chain.length >= 2 && gap > 3 * maxGap) break
        used[j] = 1
        chain.push(b); last = b; maxGap = Math.max(maxGap, gap)
      }
      const a0 = chain.reduce((s, l) => s + l.a0, 0) / chain.length
      const a1 = chain.reduce((s, l) => s + l.a1, 0) / chain.length
      out.push({ axis, pos: (a.pos + last.pos) / 2, a0, a1, id: '', len: a1 - a0, w: last.pos - a.pos })
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

/** Marcos de planta a partir de las barras azules. Devuelve también los `posts`: barras mucho
 *  más largas que el marco típico (postes de un alzado dibujado en la hoja). */
function detectFrames(lines: Line[], beams: Beam[], Lmed: number): { frames: Frame[]; posts: Line[] } {
  const tEnd = 0.1 * Lmed     // qué tan cerca del extremo de una viga debe pasar el marco
  const tSpan = 0.04 * Lmed   // holgura en las puntas de la barra del marco
  const tJoin = 0.08 * Lmed   // trazos paralelos a esta distancia son el mismo marco (contorno, postes)
  const touched = endGrid(beams, tEnd)
  const cand = lines.filter(l => { const L = lenOf(l); return L >= 0.05 * Lmed && L <= 4 * Lmed })

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

  const bars: Line[] = []
  const accepted: Frame[] = []
  for (const g of groups.values()) {
    // La barra del marco es el trazo más largo del grupo (los postes son cortos).
    const main = g.reduce((a, b) => (lenOf(b) > lenOf(a) ? b : a))
    const wide = g.filter(l => lenOf(l) >= 0.8 * lenOf(main))
    const bar: Line = { axis: main.axis, pos: wide.reduce((s, l) => s + l.pos, 0) / wide.length, a0: main.a0, a1: main.a1 }
    bars.push(bar)
    const hits = touched(bar, tEnd, tSpan).sort((a, b) => a - b)
    const distinct: number[] = []
    for (const p of hits) if (!distinct.length || p - distinct[distinct.length - 1] > 0.02 * Lmed) distinct.push(p)
    // Un marco real une el frente y el fondo del rack: debe haber viga junto a CADA punta de la
    // barra. Descarta líneas azules que solo cruzan trazos rojos (p. ej. del cuadro de datos).
    const tNear = Math.max(0.1 * Lmed, 0.15 * lenOf(bar))
    if (distinct.length < 2 || Math.abs(distinct[0] - bar.a0) > tNear || Math.abs(bar.a1 - distinct[distinct.length - 1]) > tNear) continue
    accepted.push({ ...bar, id: '', count: Math.max(1, Math.round(distinct.length / 2)) })
  }
  // El marco típico mide lo que el fondo del rack: fuera lo mucho más corto (distanciadores,
  // cajones de poste) y lo mucho más largo (postes de alzado, que sí sirven para la altura).
  const Fmed = median(accepted.map(lenOf))
  const frames = Fmed ? accepted.filter(f => lenOf(f) >= 0.4 * Fmed && lenOf(f) <= 3 * Fmed) : []
  const posts = Fmed ? bars.filter(b => lenOf(b) > 3 * Fmed) : bars
  return { frames, posts }
}

/** ¿Hay un marco en el extremo (x, y) de una viga con eje `axis`? */
function frameIndex(frames: Frame[], Lmed: number) {
  const tEnd = 0.1 * Lmed
  return (axis: Axis, end: number, pos: number) => frames.some(f =>
    f.axis !== axis && Math.abs(f.pos - end) <= tEnd && pos >= f.a0 - tEnd && pos <= f.a1 + tEnd)
}

/** Valores de las cotas "NNNNmm" con letra de tamaño normal (no de miniatura). */
function dimValues(texts: TextItem[]): { mm: number; t: TextItem }[] {
  const dims = texts.filter(t => /\d\s*mm/i.test(t.str))
  const hMax = Math.max(0, ...dims.map(t => t.height))
  const out: { mm: number; t: TextItem }[] = []
  for (const t of dims) {
    if (t.height < 0.4 * hMax) continue
    const m = /(\d+(?:[.,]\d+)?)\s*mm/i.exec(t.str)
    const mm = m ? parseFloat(m[1].replace(',', '.')) : NaN
    if (mm > 0) out.push({ mm, t })
  }
  return out
}

/** Escala (mm por unidad del PDF) a partir de las cotas y su línea de cota. */
function estimateScale(dims: { mm: number; t: TextItem }[], dark: Line[]): number | null {
  const found: { mm: number; L: number }[] = []
  for (const { mm, t } of dims) {
    const L = dimLength(t, dark)
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

/** Ajusta un largo estimado al valor exacto de una cota del plano si alguna queda a ≤3 %. */
export function snapToDim(mm: number, dimsMm: number[]): number {
  let best: number | null = null
  for (const d of dimsMm) if (Math.abs(d - mm) <= 0.03 * mm && (best == null || Math.abs(d - mm) < Math.abs(best - mm))) best = d
  return best != null ? Math.round(best * 10) / 10 : Math.round(mm / 10) * 10
}

/** Lee un ALZADO: agrupa las vigas sin marco en pilas (mismo tramo, distinta altura) y toma
 *  como niveles el tamaño de pila más frecuente. Se ignoran pilas sueltas de 2 vigas (suelen
 *  ser miniaturas del cuadro de datos): hacen falta al menos 3 vigas apiladas en total. */
function detectElevation(cands: Beam[], posts: Line[], mmPerUnit: number | null, dimsMm: number[]): Elevation | null {
  const stacks: Beam[][] = []
  for (const b of cands) {
    const tol = 0.05 * b.len
    const s = stacks.find(st => st[0].axis === b.axis && Math.abs(st[0].a0 - b.a0) <= tol && Math.abs(st[0].a1 - b.a1) <= tol)
    if (s) s.push(b); else stacks.push([b])
  }
  // Una pila de niveles tiene sus vigas a alturas parejas: se descartan las pilas con huecos
  // muy dispares (piezas sueltas alineadas por casualidad) o con vigas encimadas.
  const regular = (s: Beam[]) => {
    const ps = s.map(b => b.pos).sort((a, b) => a - b)
    const gaps = ps.slice(1).map((p, i) => p - ps[i])
    const g = median(gaps)
    // Niveles a menos del 10 % del largo de la viga no son niveles (rayado, miniaturas).
    return g > 0.1 * s[0].len && Math.min(...gaps) >= 0.4 * g && Math.max(...gaps) <= 2.5 * g
  }
  const real = stacks.filter(s => s.length >= 2 && regular(s))
  if (!real.length) return null
  // Vota cada pila por su tamaño, ponderado por cuántas vigas trae; empate → la más alta.
  const votes = new Map<number, number>()
  for (const s of real) votes.set(s.length, (votes.get(s.length) ?? 0) + s.length)
  const levels = [...votes.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]
  const chosen = real.filter(s => s.length === levels)
  if (chosen.flat().length < 3) return null
  chosen.flat().forEach((b, i) => { b.id = `e${i}` })
  // Altura del marco: el poste más largo a escala; si no hay escala, la cota más grande de la hoja.
  const postLen = Math.max(0, ...posts.map(lenOf))
  const frameHeightMm = postLen && mmPerUnit ? snapToDim(postLen * mmPerUnit, dimsMm)
    : dimsMm.length ? Math.max(...dimsMm) : null
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

const bbox = (l: Line) => (l.axis === 'h' ? { x0: l.a0, x1: l.a1, y0: l.pos, y1: l.pos } : { x0: l.pos, x1: l.pos, y0: l.a0, y1: l.a1 })

/** Filtro: ¿la línea cae dentro del rectángulo que envuelve a `ref` (con margen `pad`)? */
function inZone(ref: Line[], pad: number) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const l of ref) {
    const b = bbox(l)
    x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1); y0 = Math.min(y0, b.y0); y1 = Math.max(y1, b.y1)
  }
  return (l: Line) => {
    const b = bbox(l)
    return b.x0 >= x0 - pad && b.x1 <= x1 + pad && b.y0 >= y0 - pad && b.y1 <= y1 + pad
  }
}

/** Agrupa las vigas en racks por cercanía (huecos de hasta `gap`). */
function clusters(beams: Beam[], gap: number): Beam[][] {
  const parent = beams.map((_, i) => i)
  const find = (i: number): number => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i }
  const bs = beams.map(bbox)
  for (let i = 0; i < beams.length; i++) {
    for (let j = i + 1; j < beams.length; j++) {
      const a = bs[i], b = bs[j]
      const dx = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1))
      const dy = Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1))
      if (dx <= gap && dy <= gap) parent[find(i)] = find(j)
    }
  }
  const out = new Map<number, Beam[]>()
  beams.forEach((b, i) => {
    const r = find(i)
    const g = out.get(r)
    if (g) g.push(b); else out.set(r, [b])
  })
  return [...out.values()]
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
  const dims = dimValues(texts)
  const dimsMm = [...new Set(dims.map(d => d.mm))]
  const mmPerUnit = estimateScale(dims, darkL)
  const empty: Detection = { kind: 'none', beams: [], doubtful: [], frames: [], mmPerUnit, looseBeams: [], elevation: null, dimsMm }
  if (!beamL.length) return empty

  // Largo de referencia: percentil 90 de los trazos rojos (las vigas dominan esa cola).
  // Se descartan los trazos mucho más cortos: tapas del perfil y miniaturas del cuadro de datos.
  const Lref = percentile(beamL.map(lenOf), 0.9)
  const tol = Lref * 0.002
  const chained = chainBeams(dedupe(beamL, tol).filter(l => lenOf(l) >= 0.25 * Lref), tol)
  // El perfil de la viga mide casi lo mismo en todo el plano; en las miniaturas del cuadro de
  // datos es varias veces más delgado: se descartan.
  const Wref = percentile(chained.filter(b => b.w > 0).map(b => b.w), 0.9)
  const cands = chained.filter(b => b.w === 0 || b.w >= 0.4 * Wref)
  const Lmed = median(cands.map(b => b.len))
  const { frames, posts } = detectFrames(dedupe(frameL, tol), cands, Lmed)

  const hasFrame = frameIndex(frames, Lmed)
  let confirmed: Beam[] = []
  const unconfirmed: Beam[] = []
  for (const b of cands) (hasFrame(b.axis, b.a0, b.pos) || hasFrame(b.axis, b.a1, b.pos) ? confirmed : unconfirmed).push(b)

  // Racks aislados muy pequeños (p. ej. el módulo de un dibujo de detalle) pasan a dudosos:
  // se muestran, pero solo cuentan si la persona los incluye.
  const minCluster = Math.max(3, 0.03 * confirmed.length)
  const demoted: Beam[] = []
  if (confirmed.length) {
    const keep: Beam[] = []
    for (const c of clusters(confirmed, Lmed)) (c.length >= minCluster ? keep : demoted).push(...c)
    confirmed = keep
  }
  // Solo quedan los marcos que tocan alguna viga confirmada.
  const touched = endGrid(confirmed, 0.1 * Lmed)
  const liveFrames = frames.filter(f => touched(f, 0.1 * Lmed, 0.04 * Lmed).length > 0)
  liveFrames.forEach((f, i) => { f.id = `f${i}` })

  const looseBeams: string[] = []
  confirmed.forEach((b, i) => {
    b.id = `b${i}`
    if (!(hasFrame(b.axis, b.a0, b.pos) && hasFrame(b.axis, b.a1, b.pos))) looseBeams.push(b.id)
  })

  // Alzado (en esta hoja o dibujado como detalle junto a la planta): sale de las vigas sin marco.
  const elevation = detectElevation(unconfirmed, posts, mmPerUnit, dimsMm)
  const inElev = new Set(elevation?.stacks.flat() ?? [])
  const kind = confirmed.length ? 'planta' : elevation ? 'alzado' : 'none'
  // Dudosas que se muestran: los racks pequeños demotados siempre; los trazos sueltos solo dentro
  // de la zona del dibujo (los del cuadro de datos no). Si la hoja no se entendió, todos.
  const loose = unconfirmed.filter(b => !inElev.has(b))
  const shown = kind === 'planta' ? [...demoted, ...loose.filter(inZone(confirmed, 0.3 * Lmed))] : kind === 'alzado' ? [] : loose
  shown.forEach((b, i) => { b.id = `d${i}` })
  return { kind, beams: confirmed, doubtful: shown, frames: liveFrames, mmPerUnit, looseBeams, elevation, dimsMm }
}

/** Agrupa vigas por largo (±3%). `mm` con la escala dada, ajustado a las cotas del plano. */
export function groupBeams(beams: Beam[], mmPerUnit: number | null, dimsMm: number[] = []): BeamGroup[] {
  const sorted = [...beams].sort((a, b) => a.len - b.len)
  const out: BeamGroup[] = []
  let cur: Beam[] = []
  const flush = () => {
    if (!cur.length) return
    const len = median(cur.map(b => b.len))
    out.push({ len, mm: mmPerUnit ? snapToDim(len * mmPerUnit, dimsMm) : null, ids: cur.map(b => b.id) })
    cur = []
  }
  for (const b of sorted) {
    if (cur.length && b.len > cur[0].len * 1.03) flush()
    cur.push(b)
  }
  flush()
  return out.sort((a, b) => b.ids.length - a.ids.length)
}
