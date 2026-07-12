import type {
  HookLogOutcome,
  PanelAggregates,
  PanelDailyCount,
  TaggedEvent,
} from "../../types/index.js";

export function bucketOutcome(
  outcome: HookLogOutcome
): "clean" | "advisory" | "ask" | "denied" {
  if (outcome === "denied") return "denied";
  if (outcome === "ask" || outcome === "inbound-flagged") return "ask";
  if (outcome === "advisory") return "advisory";
  return "clean";
}

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function aggregateEvents(
  events: TaggedEvent[],
  now: Date,
  days = 30
): PanelAggregates {
  const daily: PanelDailyCount[] = [];
  const dayIndex = new Map<string, PanelDailyCount>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const entry: PanelDailyCount = {
      date: localDateKey(d),
      clean: 0,
      advisory: 0,
      ask: 0,
      denied: 0,
    };
    daily.push(entry);
    dayIndex.set(entry.date, entry);
  }

  const todayKey = localDateKey(now);
  const today = { clean: 0, advisory: 0, ask: 0, denied: 0 };
  const ruleCounts = new Map<string, number>();

  for (const event of events) {
    const day = dayIndex.get(localDateKey(new Date(event.ts)));
    if (!day) continue; // outside the 30-day window
    const bucket = bucketOutcome(event.outcome);
    day[bucket]++;
    if (day.date === todayKey) today[bucket]++;
    if (event.ruleId) ruleCounts.set(event.ruleId, (ruleCounts.get(event.ruleId) ?? 0) + 1);
  }

  const topRules = [...ruleCounts.entries()]
    .map(([ruleId, count]) => ({ ruleId, count }))
    .sort((a, b) => b.count - a.count || a.ruleId.localeCompare(b.ruleId))
    .slice(0, 8);

  return { today, daily, topRules };
}
