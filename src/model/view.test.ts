import { describe, expect, it } from "vitest";
import {
  applyView,
  clampPan,
  clampZoom,
  fitCamera,
  IDENTITY_VIEW,
  MAX_ZOOM,
  toCm,
  toPx,
  zoomAbout,
  type WorldRect,
} from "./camera";

const WORLD: WorldRect = { x: 0, y: 0, w: 100, h: 200 };
const W = 400;
const H = 600;

describe("view transform", () => {
  it("the identity view leaves the fitted camera untouched", () => {
    const cam = fitCamera(WORLD, W, H);
    const out = applyView(cam, IDENTITY_VIEW, W, H);
    expect(out.scale).toBeCloseTo(cam.scale, 12);
    expect(out.offsetX).toBeCloseTo(cam.offsetX, 12);
    expect(out.offsetY).toBeCloseTo(cam.offsetY, 12);
  });

  it("zooming scales about the canvas centre", () => {
    const cam = fitCamera(WORLD, W, H);
    const zoomed = applyView(cam, { zoom: 2, panX: 0, panY: 0 }, W, H);
    // whatever cm point sat at the centre must still be at the centre
    const centreCm = toCm(cam, W / 2, H / 2);
    const after = toPx(zoomed, centreCm[0], centreCm[1]);
    expect(after[0]).toBeCloseTo(W / 2, 9);
    expect(after[1]).toBeCloseTo(H / 2, 9);
    expect(zoomed.scale).toBeCloseTo(cam.scale * 2, 12);
  });

  it("zoomAbout holds the focal point still", () => {
    const cam = fitCamera(WORLD, W, H);
    const focal = { x: 90, y: 480 };
    const before = toCm(applyView(cam, IDENTITY_VIEW, W, H), focal.x, focal.y);

    let view = zoomAbout(IDENTITY_VIEW, focal.x, focal.y, 3.5, W, H);
    let px = toPx(applyView(cam, view, W, H), before[0], before[1]);
    expect(px[0]).toBeCloseTo(focal.x, 6);
    expect(px[1]).toBeCloseTo(focal.y, 6);

    // and again from a zoomed, panned state
    view = zoomAbout(view, focal.x, focal.y, 6, W, H);
    px = toPx(applyView(cam, view, W, H), before[0], before[1]);
    expect(px[0]).toBeCloseTo(focal.x, 6);
    expect(px[1]).toBeCloseTo(focal.y, 6);
  });

  it("round-trips px -> cm -> px under zoom and pan", () => {
    const cam = applyView(fitCamera(WORLD, W, H), { zoom: 4.2, panX: -37, panY: 61 }, W, H);
    for (const [x, y] of [[0, 0], [123, 456], [W, H]]) {
      const [cx, cy] = toCm(cam, x, y);
      const [bx, by] = toPx(cam, cx, cy);
      expect(bx).toBeCloseTo(x, 9);
      expect(by).toBeCloseTo(y, 9);
    }
  });

  it("clamps zoom to its range", () => {
    expect(clampZoom(0.1)).toBe(1);
    expect(clampZoom(999)).toBe(MAX_ZOOM);
    expect(clampZoom(3)).toBe(3);
  });

  it("pins pan to zero at zoom 1 so the world cannot be dragged off-screen", () => {
    const v = clampPan({ zoom: 1, panX: 500, panY: -500 }, W, H);
    // toBeCloseTo, not toBe: clamping a negative into a +-0 range yields -0,
    // which is numerically zero but not Object.is-equal to 0.
    expect(v.panX).toBeCloseTo(0, 12);
    expect(v.panY).toBeCloseTo(0, 12);
  });

  it("allows pan only within the zoomed overflow", () => {
    const v = clampPan({ zoom: 3, panX: 99999, panY: -99999 }, W, H);
    expect(v.panX).toBeCloseTo(((3 - 1) * W) / 2, 9);
    expect(v.panY).toBeCloseTo(-((3 - 1) * H) / 2, 9);
  });

  it("a degenerate canvas does not produce NaN", () => {
    const cam = applyView(fitCamera(WORLD, 0, 0), { zoom: 2, panX: 5, panY: 5 }, 0, 0);
    expect(Number.isFinite(cam.scale)).toBe(true);
    expect(Number.isFinite(cam.offsetX)).toBe(true);
    expect(Number.isFinite(cam.offsetY)).toBe(true);
  });
});
