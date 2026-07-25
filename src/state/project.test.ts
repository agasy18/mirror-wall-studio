import { describe, expect, it } from "vitest";
import {
  applyProject,
  currentProject,
  parseProject,
  projectFilename,
  ProjectError,
  PROJECT_FORMAT,
} from "./project";
import { useCalibrationStore } from "./useCalibrationStore";
import { useShapeStore } from "./useShapeStore";

/**
 * A project file is the only copy of the work the user actually owns —
 * localStorage belongs to one browser and vanishes with a cleared cache — so it
 * has to survive a round trip exactly, and it has to refuse anything it cannot
 * vouch for. Everything in the file becomes app state; a string where a number
 * belongs puts NaN into the geometry and blanks the canvas.
 */

const PHOTO = "data:image/png;base64,iVBORw0KGgo=";

function seed() {
  useCalibrationStore.setState({
    photoSrc: PHOTO,
    photoW: 1200,
    photoH: 1600,
    corners: {
      tl: { x: 100, y: 120 },
      tr: { x: 900, y: 90 },
      br: { x: 950, y: 1400 },
      bl: { x: 80, y: 1350 },
    },
    realWidthCm: 120,
    realHeightCm: 240,
    calibrated: true,
  });
  useShapeStore.setState({
    points: [
      { id: "a", x: 10, y: 10 },
      { id: "b", x: 90, y: 20 },
      { id: "c", x: 70, y: 200 },
      { id: "d", x: 15, y: 180 },
    ],
    presetId: "blob",
    paperId: "a3",
    marginCm: 3,
    shapeEdited: true,
  });
}

describe("a saved project file", () => {
  it("comes back exactly as it went in", () => {
    seed();
    const saved = JSON.parse(JSON.stringify(currentProject()));
    const before = useShapeStore.getState().points.map((p) => [p.x, p.y]);

    // wipe, then reopen
    useShapeStore.setState({ points: [{ id: "z", x: 0, y: 0 }], marginCm: 0, paperId: "a4" });
    useCalibrationStore.setState({ photoSrc: null, calibrated: false, realWidthCm: 1 });

    applyProject(parseProject(JSON.stringify(saved)));

    const cal = useCalibrationStore.getState();
    expect(cal.photoSrc).toBe(PHOTO);
    expect(cal.realWidthCm).toBe(120);
    expect(cal.realHeightCm).toBe(240);
    expect(cal.calibrated).toBe(true);
    expect(cal.corners.br).toEqual({ x: 950, y: 1400 });

    const shape = useShapeStore.getState();
    expect(shape.points.map((p) => [p.x, p.y])).toEqual(before);
    expect(shape.paperId).toBe("a3");
    expect(shape.marginCm).toBe(3);
    expect(shape.shapeEdited).toBe(true);
  });

  it("does not let a hand-edited outline be re-fitted by the wall it arrives with", () => {
    // Loading writes the wall first, which fires the "re-measured" subscription.
    // The file's own points have to win.
    seed();
    const saved = JSON.stringify(currentProject());
    useCalibrationStore.setState({ realWidthCm: 50, realHeightCm: 60 });
    applyProject(parseProject(saved));
    expect(useShapeStore.getState().points.map((p) => p.x)).toEqual([10, 90, 70, 15]);
  });

  it("gives every point a fresh id, so nothing collides with the next one added", () => {
    seed();
    const saved = JSON.stringify(currentProject());
    applyProject(parseProject(saved));
    const ids = useShapeStore.getState().points.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("a");
  });

  it("is named after the wall and the day it was saved", () => {
    seed();
    const p = currentProject({ now: new Date("2026-07-25T10:00:00Z") });
    expect(projectFilename(p)).toBe("mirror-120x240cm-2026-07-25.json");
  });
});

describe("opening a file the app cannot vouch for", () => {
  const base = () => JSON.parse(JSON.stringify(currentProject()));

  it("rejects something that is not JSON at all", () => {
    expect(() => parseProject("<html>nope</html>")).toThrow(ProjectError);
    expect(reasonOf(() => parseProject("nope"))).toBe("notJson");
  });

  it("rejects JSON that was not written by this app", () => {
    expect(reasonOf(() => parseProject('{"hello":"world"}'))).toBe("notProject");
  });

  it("rejects a file from a newer version rather than guessing at it", () => {
    seed();
    const p = base();
    p.version = 99;
    expect(reasonOf(() => parseProject(JSON.stringify(p)))).toBe("tooNew");
  });

  it("rejects coordinates that are not finite numbers", () => {
    seed();
    for (const bad of ["12", null, "NaN"]) {
      const p = base();
      p.mirror.points[1].x = bad === "NaN" ? undefined : bad;
      expect(reasonOf(() => parseProject(JSON.stringify(p)))).toBe("corrupt");
    }
  });

  it("rejects a wall with no size", () => {
    seed();
    const p = base();
    p.wall.realWidthCm = 0;
    expect(reasonOf(() => parseProject(JSON.stringify(p)))).toBe("corrupt");
  });

  it("rejects an outline with fewer than three points", () => {
    seed();
    const p = base();
    p.mirror.points = p.mirror.points.slice(0, 2);
    expect(reasonOf(() => parseProject(JSON.stringify(p)))).toBe("corrupt");
  });

  it("refuses a photo that is a link instead of the picture itself", () => {
    // A file that could point the app at a remote image would let whoever sent
    // it learn when — and from where — it was opened.
    seed();
    for (const src of ["https://example.com/wall.jpg", "blob:https://x/y", "javascript:alert(1)"]) {
      const p = base();
      p.wall.photo = src;
      expect(reasonOf(() => parseProject(JSON.stringify(p))), src).toBe("corrupt");
    }
  });

  it("accepts a project with no photo yet", () => {
    seed();
    const p = base();
    p.wall.photo = null;
    expect(parseProject(JSON.stringify(p)).wall.photo).toBeNull();
  });

  it("ignores unknown toggles instead of letting them through", () => {
    seed();
    const p = base();
    p.mirror.toggles = { showGrid: false, somethingElse: "yes" };
    const parsed = parseProject(JSON.stringify(p));
    expect(parsed.mirror.toggles).toEqual({ showGrid: false });
    expect(parsed.format).toBe(PROJECT_FORMAT);
  });
});

function reasonOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof ProjectError ? e.reason : `unexpected: ${e}`;
  }
  return "no error";
}
