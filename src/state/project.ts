// Save and reopen a whole design as one JSON file: the wall photo, where the
// calibration rectangle sits on it, its real size, and the mirror outline.
//
// The app keeps everything in localStorage, which is per-browser and quietly
// disposable — clearing site data, a different laptop or a private window all
// lose the work. A project file is the copy the user owns: back it up, mail it
// to whoever is cutting the glass, or keep one file per room.

import { APP_NAME, APP_URL } from "../model/brand";
import { nextPointId, type ShapePoint } from "../model/shape";
import { useCalibrationStore, type Corner } from "./useCalibrationStore";
import { useShapeStore, type ViewToggles } from "./useShapeStore";

export const PROJECT_FORMAT = "mirror-wall-studio.project";
export const PROJECT_VERSION = 1;

export interface Project {
  format: string;
  version: number;
  savedAt: string;
  app: { name: string; url: string };
  wall: {
    /** The photo, inlined as a data URL. Null if the design has no photo. */
    photo: string | null;
    photoW: number;
    photoH: number;
    corners: Record<Corner, { x: number; y: number }>;
    realWidthCm: number;
    realHeightCm: number;
    calibrated: boolean;
  };
  mirror: {
    points: ShapePoint[];
    presetId: string;
    paperId: string;
    marginCm: number;
    shapeEdited: boolean;
    toggles: Partial<ViewToggles>;
  };
}

/**
 * Everything currently on screen, as a plain object ready to stringify.
 *
 * `photo` can be overridden because the file must carry the picture itself, not
 * a link to it: the app normally holds a data URL, but the demo shortcut points
 * at a bundled file, and a project saved with that in it would only reopen on a
 * machine that happens to serve the same path.
 */
export function currentProject(opts: { now?: Date; photo?: string | null } = {}): Project {
  const cal = useCalibrationStore.getState();
  const shape = useShapeStore.getState();
  const now = opts.now ?? new Date();
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt: now.toISOString(),
    app: { name: APP_NAME, url: APP_URL },
    wall: {
      photo: opts.photo !== undefined ? opts.photo : cal.photoSrc,
      photoW: cal.photoW,
      photoH: cal.photoH,
      corners: {
        tl: { ...cal.corners.tl },
        tr: { ...cal.corners.tr },
        br: { ...cal.corners.br },
        bl: { ...cal.corners.bl },
      },
      realWidthCm: cal.realWidthCm,
      realHeightCm: cal.realHeightCm,
      calibrated: cal.calibrated,
    },
    mirror: {
      points: shape.points.map((p) => ({ id: p.id, x: p.x, y: p.y })),
      presetId: shape.presetId,
      paperId: shape.paperId,
      marginCm: shape.marginCm,
      shapeEdited: shape.shapeEdited,
      toggles: { ...shape.toggles },
    },
  };
}

/**
 * The photo as a data URL, fetching and encoding it first if the app is holding
 * a plain URL. Returns null if it cannot be inlined — better to save a project
 * with no photo than one that silently will not open.
 */
export async function inlinedPhoto(src: string | null): Promise<string | null> {
  if (!src || src.startsWith("data:")) return src;
  try {
    const blob = await (await fetch(src)).blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function projectFilename(p: Project): string {
  const w = Math.round(p.wall.realWidthCm);
  const h = Math.round(p.wall.realHeightCm);
  const stamp = p.savedAt.slice(0, 10);
  return `mirror-${w}x${h}cm-${stamp}.json`;
}

/** Why a file could not be opened. The UI turns this into a translated line. */
export class ProjectError extends Error {
  constructor(public reason: "notJson" | "notProject" | "tooNew" | "corrupt") {
    super(reason);
    this.name = "ProjectError";
  }
}

const CORNERS: Corner[] = ["tl", "tr", "br", "bl"];

/**
 * Parse and validate a project file.
 *
 * Anything a file can carry into the app is checked here rather than trusted:
 * a number that arrives as a string puts NaN into the geometry and the canvas
 * silently goes blank, and the photo is only ever accepted as an inline `data:`
 * URL — a project file that could point the app at an arbitrary remote image
 * would let a shared file report back that it had been opened.
 */
export function parseProject(text: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectError("notJson");
  }
  if (!isObject(raw) || raw.format !== PROJECT_FORMAT) throw new ProjectError("notProject");
  if (typeof raw.version !== "number" || raw.version > PROJECT_VERSION) {
    throw new ProjectError("tooNew");
  }

  const wall = raw.wall;
  const mirror = raw.mirror;
  if (!isObject(wall) || !isObject(mirror)) throw new ProjectError("corrupt");

  const photo = wall.photo;
  if (photo !== null && !(typeof photo === "string" && /^data:image\/[a-z+.-]+;/i.test(photo))) {
    throw new ProjectError("corrupt");
  }

  const corners = wall.corners;
  if (!isObject(corners)) throw new ProjectError("corrupt");
  const parsedCorners = {} as Record<Corner, { x: number; y: number }>;
  for (const k of CORNERS) {
    const c = corners[k];
    if (!isObject(c)) throw new ProjectError("corrupt");
    parsedCorners[k] = { x: num(c.x), y: num(c.y) };
  }

  const points = mirror.points;
  if (!Array.isArray(points) || points.length < 3) throw new ProjectError("corrupt");
  const parsedPoints: ShapePoint[] = points.map((p) => {
    if (!isObject(p)) throw new ProjectError("corrupt");
    // Ids are reassigned rather than trusted: the running counter knows nothing
    // about a file's ids, so a kept one could collide with the next point added.
    return { id: nextPointId(), x: num(p.x), y: num(p.y) };
  });

  return {
    format: PROJECT_FORMAT,
    version: raw.version,
    savedAt: typeof raw.savedAt === "string" ? raw.savedAt : new Date(0).toISOString(),
    app: { name: APP_NAME, url: APP_URL },
    wall: {
      photo: photo as string | null,
      photoW: num(wall.photoW),
      photoH: num(wall.photoH),
      corners: parsedCorners,
      realWidthCm: positive(wall.realWidthCm),
      realHeightCm: positive(wall.realHeightCm),
      calibrated: wall.calibrated === true,
    },
    mirror: {
      points: parsedPoints,
      presetId: typeof mirror.presetId === "string" ? mirror.presetId : "",
      paperId: typeof mirror.paperId === "string" ? mirror.paperId : "a4",
      marginCm: Math.max(0, num(mirror.marginCm)),
      shapeEdited: mirror.shapeEdited === true,
      toggles: isObject(mirror.toggles) ? pickBooleans(mirror.toggles) : {},
    },
  };
}

/**
 * Load a parsed project into the app.
 *
 * The wall goes first on purpose: setting it fires the "wall was re-measured"
 * subscription, which re-places an unedited preset. Writing the outline
 * afterwards means the file's own points are what survives, every time.
 */
export function applyProject(p: Project) {
  useCalibrationStore.setState({
    photoSrc: p.wall.photo,
    photoW: p.wall.photoW,
    photoH: p.wall.photoH,
    corners: p.wall.corners,
    realWidthCm: p.wall.realWidthCm,
    realHeightCm: p.wall.realHeightCm,
    calibrated: p.wall.calibrated,
  });
  useShapeStore.setState({
    points: p.mirror.points,
    presetId: p.mirror.presetId,
    paperId: p.mirror.paperId,
    marginCm: p.mirror.marginCm,
    shapeEdited: p.mirror.shapeEdited,
    selectedId: null,
    previewMode: false,
    toggles: { ...useShapeStore.getState().toggles, ...p.mirror.toggles },
  });
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ProjectError("corrupt");
  return v;
}

function positive(v: unknown): number {
  const n = num(v);
  if (n <= 0) throw new ProjectError("corrupt");
  return n;
}

function pickBooleans(o: Record<string, unknown>): Partial<ViewToggles> {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(o)) if (typeof v === "boolean") out[k] = v;
  return out as Partial<ViewToggles>;
}
