import { describe, expect, it } from "vitest";
import { fitCamera, toCm, toPx } from "./camera";

const WORLD = { x: 0, y: 0, w: 100, h: 200 };

describe("fitCamera", () => {
  it("fits height-limited world and centers horizontally", () => {
    // canvas 400x400: world 100x200 -> scale limited by height = 400/200 = 2
    const cam = fitCamera(WORLD, 400, 400);
    expect(cam.scale).toBe(2);
    // drawnW = 200, centered in 400 -> offsetX = 100
    expect(cam.offsetX).toBe(100);
    expect(cam.offsetY).toBe(0);
  });

  it("fits width-limited world and centers vertically", () => {
    // canvas 100x400: scale limited by width = 100/100 = 1
    const cam = fitCamera(WORLD, 100, 400);
    expect(cam.scale).toBe(1);
    expect(cam.offsetX).toBe(0);
    // drawnH = 200, centered in 400 -> offsetY = 100
    expect(cam.offsetY).toBe(100);
  });

  it("accounts for a non-zero world origin", () => {
    const cam = fitCamera({ x: 10, y: 5, w: 100, h: 200 }, 400, 400);
    // top-left of world (10,5)cm should map to the letterbox top-left px
    const [px, py] = toPx(cam, 10, 5);
    expect(px).toBeCloseTo(100, 6); // matches centered offset
    expect(py).toBeCloseTo(0, 6);
  });

  it("returns identity for degenerate inputs", () => {
    expect(fitCamera({ x: 0, y: 0, w: 0, h: 0 }, 400, 400)).toEqual({
      scale: 1, offsetX: 0, offsetY: 0,
    });
  });
});

describe("toPx / toCm round-trip", () => {
  it("inverts exactly across camera configs", () => {
    for (const [cw, ch] of [[400, 400], [100, 400], [800, 300]] as const) {
      const cam = fitCamera(WORLD, cw, ch);
      for (const [x, y] of [[0, 0], [50, 100], [100, 200], [33, 77]] as const) {
        const [px, py] = toPx(cam, x, y);
        const [bx, by] = toCm(cam, px, py);
        expect(bx).toBeCloseTo(x, 6);
        expect(by).toBeCloseTo(y, 6);
      }
    }
  });
});
