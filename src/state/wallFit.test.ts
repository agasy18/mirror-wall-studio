import { describe, it, expect, beforeEach } from "vitest";
import { useShapeStore } from "./useShapeStore";
import { useCalibrationStore } from "./useCalibrationStore";
import { curveBounds } from "../model/geometry";

/**
 * The mirror must always sit inside the wall area the user marked during
 * calibration. Before this suite the shape was only ever fitted inside
 * loadPreset/resetPreset/setMargin, so a freshly calibrated wall left the
 * default 68x173 preset untouched — the mirror ignored the marked area on the
 * first open and then snapped to it the moment any preset was picked.
 */

function calibrate(widthCm: number, heightCm: number) {
  useCalibrationStore.setState({
    realWidthCm: widthCm,
    realHeightCm: heightCm,
    calibrated: true,
  });
}

function bounds() {
  return curveBounds(useShapeStore.getState().points);
}

describe("fitting the mirror to the calibrated wall", () => {
  beforeEach(() => {
    useCalibrationStore.setState({
      realWidthCm: 68,
      realHeightCm: 173,
      calibrated: false,
    });
    useShapeStore.setState({ marginCm: 2, shapeEdited: false });
    useShapeStore.getState().loadPreset("pebble");
  });

  it("fills the safe area as soon as a wall is calibrated", () => {
    calibrate(150, 220);
    const bb = bounds();
    // safe area = wall inset by marginCm on every side
    expect(bb.width).toBeCloseTo(146, 6);
    expect(bb.height).toBeCloseTo(216, 6);
    expect(bb.minX).toBeCloseTo(2, 6);
    expect(bb.minY).toBeCloseTo(2, 6);
  });

  it("adopts the marked area's aspect ratio, not a fixed 68x173", () => {
    calibrate(200, 100); // a wide, short area
    const bb = bounds();
    expect(bb.width).toBeGreaterThan(bb.height); // landscape mirror for a landscape wall
    expect(bb.width / bb.height).toBeCloseTo(196 / 96, 6);
  });

  it("re-fits when the marked area is re-measured", () => {
    calibrate(150, 220);
    calibrate(90, 300);
    const bb = bounds();
    expect(bb.width).toBeCloseTo(86, 6);
    expect(bb.height).toBeCloseTo(296, 6);
  });

  it("never rescales a shape the user has already edited", () => {
    calibrate(150, 220);
    const before = bounds();
    // the user drags a control point — the shape is now theirs
    const id = useShapeStore.getState().points[0].id;
    useShapeStore.getState().movePoint(id, 40, 40);
    const edited = bounds();
    expect(edited).not.toEqual(before);

    calibrate(300, 400);
    expect(bounds()).toEqual(edited);
  });

  it("picking a preset after calibration does not change the mirror's size", () => {
    calibrate(150, 220);
    const before = bounds();
    useShapeStore.getState().loadPreset("leaf");
    const after = bounds();
    expect(after.width).toBeCloseTo(before.width, 6);
    expect(after.height).toBeCloseTo(before.height, 6);
  });

  it("keeps a pristine preset filling the safe area when the margin changes", () => {
    calibrate(150, 220);
    useShapeStore.getState().setMargin(10);
    const bb = bounds();
    expect(bb.width).toBeCloseTo(130, 6);
    expect(bb.height).toBeCloseTo(200, 6);
  });

  it("only scales, never stretches, an edited shape when the margin changes", () => {
    calibrate(150, 220);
    const id = useShapeStore.getState().points[0].id;
    useShapeStore.getState().movePoint(id, 40, 40);
    const before = bounds();
    useShapeStore.getState().setMargin(10);
    const after = bounds();
    expect(after.width / after.height).toBeCloseTo(before.width / before.height, 6);
    expect(after.width).toBeLessThanOrEqual(130 + 1e-9);
    expect(after.height).toBeLessThanOrEqual(200 + 1e-9);
  });

  it("ignores a half-typed wall size", () => {
    calibrate(150, 220);
    const good = bounds();
    useCalibrationStore.setState({ realWidthCm: 0 });
    expect(bounds()).toEqual(good);
  });
});
