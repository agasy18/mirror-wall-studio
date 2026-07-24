import { describe, expect, it } from "vitest";
import { A4_HEIGHT_MM, A4_WIDTH_MM, DEFAULT_TILE_CONFIG, planTiles } from "./tiling";

describe("planTiles", () => {
  it("tiles the 68x173cm mirror into the expected page grid", () => {
    // 680 x 1730 mm shape.
    const plan = planTiles(680, 1730);
    // printable = 190 x 277, step = 180 x 267
    expect(plan.printableWmm).toBe(A4_WIDTH_MM - 20);
    expect(plan.printableHmm).toBe(A4_HEIGHT_MM - 20);
    expect(plan.stepXmm).toBe(180);
    expect(plan.stepYmm).toBe(267);
    // cols = ceil((680-10)/180) = ceil(3.72) = 4
    expect(plan.cols).toBe(4);
    // rows = ceil((1730-10)/267) = ceil(6.44) = 7
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
    expect(plan.stepXmm).toBe(190 - 20);
    expect(plan.stepYmm).toBe(277 - 20);
  });

  it("tiles fewer pages on a larger paper (A3)", () => {
    const a3 = { id: "a3", name: "A3", wmm: 297, hmm: 420 };
    const plan = planTiles(680, 1730, { ...DEFAULT_TILE_CONFIG, paper: a3 });
    // printable = 277 x 400, step = 267 x 390
    expect(plan.printableWmm).toBe(277);
    expect(plan.printableHmm).toBe(400);
    // cols = ceil((680-10)/267)=ceil(2.5)=3; rows=ceil((1730-10)/390)=ceil(4.4)=5
    expect(plan.cols).toBe(3);
    expect(plan.rows).toBe(5);
    expect(plan.pageCount).toBe(15); // vs 28 on A4
  });
});
