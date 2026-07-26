// Read a jsPDF document back: the stroked segments on every page, in mm from
// each page's top-left corner.
//
// This exists for the tests. A tiled template is only correct as a *stack of
// printed sheets* — the maths being right on each page proves nothing about
// whether the pieces still join up once they are cut and laid down — and the
// only faithful way to check that is to take the finished PDF apart again.
//
// jsPDF writes uncompressed content streams in points, y-up from the bottom
// left, which is little enough to parse directly.

const PT_PER_MM = 72 / 25.4;

export interface PdfSeg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Stroke width in mm; the outline is the only thing drawn at 0.4. */
  w: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One printed sheet, positioned on the table. Later sheets lie on top. */
export interface Placed {
  /** The paper itself, in shape-mm, after its trim edges have been cut off. */
  paper: Rect;
  /** Everything printed on it, in shape-mm. */
  ink: PdfSeg[];
}

/**
 * Stack the sheets and return the ink you can still see.
 *
 * Paper is opaque: a sheet laid on top hides whatever is under it, including
 * its own blank margin. That is the whole point of this simulation — every
 * tiling bug this app has had was invisible page by page and obvious the moment
 * the sheets were actually stacked.
 */
export function visibleInk(sheets: Placed[]): PdfSeg[] {
  const out: PdfSeg[] = [];
  for (let i = 0; i < sheets.length; i++) {
    for (const seg of sheets[i].ink) {
      let live: Array<[number, number]> = clipToRect(seg, sheets[i].paper);
      for (let j = i + 1; j < sheets.length && live.length; j++) {
        const covered = clipToRect(seg, sheets[j].paper);
        for (const c of covered) live = subtract(live, c);
      }
      for (const [t0, t1] of live) {
        out.push({
          x1: seg.x1 + (seg.x2 - seg.x1) * t0,
          y1: seg.y1 + (seg.y2 - seg.y1) * t0,
          x2: seg.x1 + (seg.x2 - seg.x1) * t1,
          y2: seg.y1 + (seg.y2 - seg.y1) * t1,
          w: seg.w,
        });
      }
    }
  }
  return out;
}

/** The parameter interval of `seg` that lies inside `r` (Liang–Barsky). */
function clipToRect(seg: PdfSeg, r: Rect): Array<[number, number]> {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const P = [-dx, dx, -dy, dy];
  const Q = [seg.x1 - r.x, r.x + r.w - seg.x1, seg.y1 - r.y, r.y + r.h - seg.y1];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (P[i] === 0) {
      if (Q[i] < 0) return [];
      continue;
    }
    const t = Q[i] / P[i];
    if (P[i] < 0) {
      if (t > t1) return [];
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return [];
      if (t < t1) t1 = t;
    }
  }
  return t1 - t0 > 1e-9 ? [[t0, t1]] : [];
}

function subtract(live: Array<[number, number]>, cut: [number, number]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const [a, b] of live) {
    if (cut[1] <= a || cut[0] >= b) {
      out.push([a, b]);
      continue;
    }
    if (cut[0] - a > 1e-9) out.push([a, cut[0]]);
    if (b - cut[1] > 1e-9) out.push([cut[1], b]);
  }
  return out;
}

/** Split a content stream into tokens, keeping `[ ... ]` arrays as one token. */
function tokenize(stream: string): string[] {
  const out: string[] = [];
  const re = /\[[^\]]*\]|\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stream))) out.push(m[0]);
  return out;
}

/** Latin-1 view of the bytes — PDF syntax is ASCII, so this is lossless here. */
function asText(raw: ArrayBuffer): string {
  const bytes = new Uint8Array(raw);
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return out;
}

export interface PdfText {
  /** Left edge of the drawn string, mm from the page's left. */
  x: number;
  /** Baseline, mm from the page's top. */
  y: number;
  /** Point size, needed to measure the string's width. */
  size: number;
  s: string;
}

/**
 * The text on every page, in mm from the page's top-left. jsPDF resolves
 * alignment before writing, so `x` is always the left edge of what is drawn.
 */
export function pdfPageTexts(raw: ArrayBuffer, pageHeightMm: number): PdfText[][] {
  const txt = asText(raw);
  const streams: string[] = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(txt))) streams.push(m[1]);

  return streams.map((stream) => {
    const out: PdfText[] = [];
    const item = /\/F\d+ ([\d.]+) Tf[\s\S]*?([\d.]+) ([\d.]+) Td\s*\((.*?)\) Tj/g;
    let g: RegExpExecArray | null;
    while ((g = item.exec(stream))) {
      out.push({
        size: parseFloat(g[1]),
        x: parseFloat(g[2]) / PT_PER_MM,
        y: pageHeightMm - parseFloat(g[3]) / PT_PER_MM,
        s: g[4],
      });
    }
    return out;
  });
}

export function pdfPageSegments(raw: ArrayBuffer, pageHeightMm: number): PdfSeg[][] {
  const txt = asText(raw);
  const streams: string[] = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(txt))) streams.push(m[1]);

  return streams.map((stream) => {
    const segs: PdfSeg[] = [];
    const toks = tokenize(stream);
    let width = 0;
    let path: Array<{ x: number; y: number }> = [];
    const at = (i: number) => ({
      x: parseFloat(toks[i - 2]) / PT_PER_MM,
      y: pageHeightMm - parseFloat(toks[i - 1]) / PT_PER_MM,
    });
    for (let i = 0; i < toks.length; i++) {
      switch (toks[i]) {
        case "w":
          width = parseFloat(toks[i - 1]) / PT_PER_MM;
          break;
        case "m":
          path = [at(i)];
          break;
        case "l":
          path.push(at(i));
          break;
        case "S":
          for (let j = 1; j < path.length; j++) {
            segs.push({ x1: path[j - 1].x, y1: path[j - 1].y, x2: path[j].x, y2: path[j].y, w: width });
          }
          path = [];
          break;
        default:
          break;
      }
    }
    return segs;
  });
}
