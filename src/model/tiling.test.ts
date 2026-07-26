import { describe, expect, it } from "vitest";
import { A4_HEIGHT_MM, A4_WIDTH_MM, DEFAULT_TILE_CONFIG, planTiles } from "./tiling";

describe("planTiles", () => {
  it("tiles the 68x173cm mirror into the expected page grid", () => {
    // 680 x 1730 mm shape.
    const plan = planTiles(680, 1730);
    // printable = 200 x 287, step = 190 x 277
    expect(plan.printableWmm).toBe(A4_WIDTH_MM - 10);
    expect(plan.printableHmm).toBe(A4_HEIGHT_MM - 10);
    expect(plan.stepXmm).toBe(190);
    expect(plan.stepYmm).toBe(277);
    // cols = ceil((680-10)/190) = ceil(3.53) = 4
    expect(plan.cols).toBe(4);
    // rows = ceil((1730-10)/277) = ceil(6.21) = 7
    expect(plan.rows).toBe(7);
    expect(plan.pageCount).toBe(28);
  });

  it("labels tiles row-major starting at R1-C1", () => {
    const plan = planTiles(680, 1730);
    expect(plan.tiles[0].label).toBe("R1-C1");
    expect(plan.tiles[1].label).toBe("R1-C2");
    expect(plan.tiles[4].label).toBe("R2-C1");
  });

  it("advances content offsets by the step (printable minus overlap)", () => {
    const plan = planTiles(680, 1730);
    const r2c3 = plan.tiles.find((t) => t.label === "R2-C3")!;
    expect(r2c3.contentXmm).toBe(2 * plan.stepXmm);
    expect(r2c3.contentYmm).toBe(1 * plan.stepYmm);
  });

  it("always produces at least one page for a tiny shape", () => {
    const plan = planTiles(20, 20);
    expect(plan.cols).toBe(1);
    expect(plan.rows).toBe(1);
    expect(plan.pageCount).toBe(1);
  });

  it("respects a custom overlap", () => {
    const plan = planTiles(680, 1730, { ...DEFAULT_TILE_CONFIG, overlapMm: 20 });
    expect(plan.stepXmm).toBe(200 - 20);
    expect(plan.stepYmm).toBe(287 - 20);
  });

  it("tiles fewer pages on a larger paper (A3)", () => {
    const a3 = { id: "a3", name: "A3", wmm: 297, hmm: 420 };
    const plan = planTiles(680, 1730, { ...DEFAULT_TILE_CONFIG, paper: a3 });
    // printable = 287 x 410, step = 277 x 400
    expect(plan.printableWmm).toBe(287);
    expect(plan.printableHmm).toBe(410);
    // cols = ceil((680-10)/277)=ceil(2.42)=3; rows=ceil((1730-10)/400)=ceil(4.3)=5
    expect(plan.cols).toBe(3);
    expect(plan.rows).toBe(5);
    expect(plan.pageCount).toBe(15); // vs 28 on A4
  });
});
