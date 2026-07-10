import { describe, expect, it } from "vitest";
import { aggregateEvents, bucketOutcome } from "../../src/core/panel/aggregate.js";
import type { TaggedEvent } from "../../src/types/index.js";

const NOW = new Date("2026-07-09T15:00:00");

function ev(o: Partial<TaggedEvent>): TaggedEvent {
  return {
    ts: "2026-07-09T10:00:00.000Z",
    tool: "Write",
    filePath: "src/x.ts",
    outcome: "clean",
    project: "alpha",
    ...o,
  };
}

describe("bucketOutcome", () => {
  it("maps every outcome to one of four buckets", () => {
    expect(bucketOutcome("clean")).toBe("clean");
    expect(bucketOutcome("exception")).toBe("clean");
    expect(bucketOutcome("advisory")).toBe("advisory");
    expect(bucketOutcome("ask")).toBe("ask");
    expect(bucketOutcome("inbound-flagged")).toBe("ask");
    expect(bucketOutcome("denied")).toBe("denied");
  });
});

describe("aggregateEvents", () => {
  it("returns zero-filled shapes for no events", () => {
    const a = aggregateEvents([], NOW);
    expect(a.today).toEqual({ clean: 0, advisory: 0, ask: 0, denied: 0 });
    expect(a.daily).toHaveLength(30);
    expect(a.daily[29].date).toBe("2026-07-09");
    expect(a.daily[0].date).toBe("2026-06-10");
    expect(a.daily.every((d) => d.clean + d.advisory + d.ask + d.denied === 0)).toBe(true);
    expect(a.topRules).toEqual([]);
    expect(a.byProject).toEqual([]);
  });

  it("counts today's buckets and daily series by local date", () => {
    const a = aggregateEvents(
      [
        ev({}),
        ev({ outcome: "ask", ruleId: "bash-sudo" }),
        ev({ outcome: "denied", ruleId: "token-leakage" }),
        ev({ ts: "2026-07-08T10:00:00.000Z", outcome: "advisory" }),
      ],
      NOW
    );
    expect(a.today).toEqual({ clean: 1, advisory: 0, ask: 1, denied: 1 });
    const yesterday = a.daily.find((d) => d.date === "2026-07-08");
    expect(yesterday?.advisory).toBe(1);
  });

  it("ranks topRules and byProject descending, rules capped at 8", () => {
    const events: TaggedEvent[] = [];
    for (let i = 0; i < 3; i++) events.push(ev({ outcome: "ask", ruleId: "r-big" }));
    for (let i = 0; i < 10; i++) events.push(ev({ outcome: "ask", ruleId: `r-${i}` }));
    events.push(ev({ project: "beta" }));
    const a = aggregateEvents(events, NOW);
    expect(a.topRules[0]).toEqual({ ruleId: "r-big", count: 3 });
    expect(a.topRules).toHaveLength(8);
    expect(a.byProject[0].project).toBe("alpha");
    expect(a.byProject[1]).toEqual({ project: "beta", count: 1 });
  });

  it("ignores events older than the 30-day window", () => {
    const a = aggregateEvents([ev({ ts: "2026-05-01T00:00:00.000Z" })], NOW);
    expect(a.byProject).toEqual([]);
  });

  it("supports a 90-day window", () => {
    const a = aggregateEvents([ev({ ts: "2026-05-01T12:00:00.000Z" })], NOW, 90);
    expect(a.daily).toHaveLength(90);
    expect(a.daily[89].date).toBe("2026-07-09");
    expect(a.byProject).toEqual([{ project: "alpha", count: 1 }]);
  });
});
