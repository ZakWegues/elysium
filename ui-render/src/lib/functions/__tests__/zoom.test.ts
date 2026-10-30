import { describe, expect, it } from "vitest";
import { zoomWindow } from "../../components/chart";

describe("zoomWindow (31/10)", () => {
  it("zooms in around the point under the cursor and never below 4 points", () => {
    expect(zoomWindow([0, 20], 20, { factor: 0.5, at: 0 })).toEqual([0, 10]);
    expect(zoomWindow([0, 20], 20, { factor: 0.5, at: 1 })).toEqual([10, 20]);
    expect(zoomWindow([0, 20], 20, { factor: 0.5, at: 0.5 })).toEqual([5, 15]);
    expect(zoomWindow([8, 13], 20, { factor: 0.1, at: 0.5 })).toEqual([9, 13]);
  });
  it("zooms out up to the whole series", () => {
    expect(zoomWindow([5, 15], 20, { factor: 4, at: 0.5 })).toEqual([0, 20]);
  });
  it("pans inside the bounds", () => {
    expect(zoomWindow([5, 10], 20, { shift: 3 })).toEqual([8, 13]);
    expect(zoomWindow([5, 10], 20, { shift: 99 })).toEqual([15, 20]);
    expect(zoomWindow([5, 10], 20, { shift: -99 })).toEqual([0, 5]);
  });
});
