import { describe, it, expect } from "vitest";
import { encodeQr, qrRuns } from "./qr";
import { APP_URL } from "./brand";

/** Rebuild a matrix from its runs — the runs must lose nothing. */
function fromRuns(size: number, runs: ReturnType<typeof qrRuns>) {
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  for (const r of runs) {
    for (let i = 0; i < r.len; i++) m[r.row][r.col + i] = true;
  }
  return m;
}

describe("QR encoding", () => {
  it("produces a valid module count for the app URL", () => {
    const code = encodeQr(APP_URL);
    // Every QR version is 21, 25, 29, ... modules per side.
    expect((code.size - 21) % 4).toBe(0);
    expect(code.size).toBeGreaterThanOrEqual(21);
    expect(code.matrix).toHaveLength(code.size);
    expect(code.matrix.every((row) => row.length === code.size)).toBe(true);
  });

  it("carries the three finder patterns a scanner looks for", () => {
    const { size, matrix } = encodeQr(APP_URL);
    // A finder is a 7x7 dark ring with a 3x3 dark core, at three corners.
    const finderAt = (r0: number, c0: number) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const onRing = r === 0 || r === 6 || c === 0 || c === 6;
          const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          if (matrix[r0 + r][c0 + c] !== (onRing || inCore)) return false;
        }
      }
      return true;
    };
    expect(finderAt(0, 0)).toBe(true);
    expect(finderAt(0, size - 7)).toBe(true);
    expect(finderAt(size - 7, 0)).toBe(true);
  });

  it("compresses to runs without losing a single module", () => {
    const code = encodeQr(APP_URL);
    expect(fromRuns(code.size, qrRuns(code))).toEqual(code.matrix);
  });

  it("emits far fewer runs than modules, which is the point", () => {
    const code = encodeQr(APP_URL);
    const dark = code.matrix.flat().filter(Boolean).length;
    expect(qrRuns(code).length).toBeLessThan(dark * 0.75);
  });

  it("never emits a zero-length or out-of-bounds run", () => {
    const code = encodeQr(APP_URL);
    for (const r of qrRuns(code)) {
      expect(r.len).toBeGreaterThan(0);
      expect(r.col + r.len).toBeLessThanOrEqual(code.size);
      expect(r.row).toBeLessThan(code.size);
    }
  });

  it("is deterministic — the same URL always yields the same code", () => {
    expect(encodeQr(APP_URL)).toEqual(encodeQr(APP_URL));
  });

  it("encodes a longer payload at a higher version", () => {
    const short = encodeQr("https://a.co");
    const long = encodeQr(APP_URL + "?utm_source=" + "x".repeat(120));
    expect(long.size).toBeGreaterThan(short.size);
  });

  it("refuses an empty payload rather than emitting a dead code", () => {
    expect(() => encodeQr("")).toThrow();
  });
});
