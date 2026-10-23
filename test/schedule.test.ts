import { assert } from "chai";
import {
  QueueEntry,
  addDays,
  compareEntries,
  daysBetween,
  describeDue,
  nextInterval,
  postponeDays,
} from "../src/modules/schedule";

const entry = (priority: number, due: string): QueueEntry => ({
  libraryID: 1,
  itemKey: "ABCD1234",
  priority,
  due,
  interval: 1,
  reviews: 0,
  addedAt: "2026-01-01",
  lastReadAt: null,
});

describe("schedule", function () {
  it("adds days across month and year boundaries", function () {
    assert.equal(addDays("2026-01-31", 1), "2026-02-01");
    assert.equal(addDays("2026-12-30", 5), "2027-01-04");
    assert.equal(daysBetween("2026-12-30", "2027-01-04"), 5);
  });

  it("grows the interval by at least one day", function () {
    assert.equal(
      nextInterval(1, 1.5, () => 0.5),
      2,
    );
    assert.equal(
      nextInterval(10, 1.5, () => 0.5),
      15,
    );
    assert.equal(
      nextInterval(10, 1.5, () => 0),
      14,
    );
    assert.equal(
      nextInterval(10, 1.5, () => 1),
      17,
    );
  });

  it("postpones by half an interval, at least one day", function () {
    assert.equal(postponeDays(1), 1);
    assert.equal(postponeDays(9), 5);
  });

  it("orders by priority, then by due date", function () {
    const sorted = [
      entry(50, "2026-01-01"),
      entry(10, "2026-01-05"),
      entry(10, "2026-01-02"),
    ].sort(compareEntries);
    assert.deepEqual(
      sorted.map((e) => [e.priority, e.due]),
      [
        [10, "2026-01-02"],
        [10, "2026-01-05"],
        [50, "2026-01-01"],
      ],
    );
  });

  it("describes due dates relative to today", function () {
    assert.equal(describeDue("2026-01-10", "2026-01-10"), "today");
    assert.equal(describeDue("2026-01-12", "2026-01-10"), "in 2d");
    assert.equal(describeDue("2026-01-07", "2026-01-10"), "3d overdue");
  });
});
