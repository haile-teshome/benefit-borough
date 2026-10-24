import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import type { Tile } from "../../../lib/types";
import { usd } from "@/api";
import { c } from "@/ui/theme";

const fmt = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

type Stop = { deadline: string; days: number; amount: number; rescued: boolean; note?: string };

// Deadlines on one line from today: each stop sums the dollars expiring that day.
export function Timeline({ tiles, done }: { tiles: Tile[]; done: Set<string> }) {
  const [width, setWidth] = useState(0);
  const [draw] = useState(() => new Animated.Value(0));

  const byDate = new Map<string, Stop>();
  for (const t of tiles) {
    // Zero-dollar deadlines are skipped, except open enrollment: a decision date worth seeing.
    if (t.atStake <= 0 && t.category !== "tax_window") continue;
    const stop = byDate.get(t.deadline) ?? { deadline: t.deadline, days: t.daysLeft, amount: 0, rescued: true };
    if (t.atStake <= 0) { stop.note = "Enroll"; stop.rescued = false; }
    else if (!done.has(t.id)) { stop.amount += t.atStake; stop.rescued = false; }
    byDate.set(t.deadline, stop);
  }
  const stops = [...byDate.values()].sort((a, b) => a.days - b.days);
  const horizon = Math.max(1, ...stops.map((s) => s.days));

  useEffect(() => {
    Animated.timing(draw, { toValue: 1, duration: 900, delay: 150, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [draw]);

  return (
    <View style={s.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={s.track} />
      <Animated.View style={[s.line, { width: draw.interpolate({ inputRange: [0, 1], outputRange: [0, width] }) }]} />
      <View style={[s.dot, { left: 0, backgroundColor: c.ink }]} />
      <Text style={[s.date, { position: "absolute", left: 0, top: 22 }]}>Today</Text>
      {width > 0 && stops.map((st) => {
        const x = (st.days / horizon) * width;
        const atEnd = x > width - 40;
        const show = draw.interpolate({ inputRange: [Math.max(0, st.days / horizon - 0.05), Math.min(1, st.days / horizon + 0.001)], outputRange: [0, 1], extrapolate: "clamp" });
        return (
          <Animated.View key={st.deadline} style={[StyleSheet.absoluteFill, { opacity: show }]} pointerEvents="none">
            <View style={[s.dot, { left: x - 5, backgroundColor: st.rescued ? c.good : st.amount === 0 ? "#fff" : c.ink }]} />
            <View style={[s.tag, atEnd ? { right: 0, alignItems: "flex-end" } : { left: Math.max(0, x - 32), alignItems: "center", width: 64 }]}>
              <Text style={[s.amount, st.rescued && { color: c.good }, st.amount === 0 && !st.rescued && { color: c.muted }]}>
                {st.rescued ? "Rescued" : st.amount > 0 ? usd(Math.round(st.amount)) : st.note}
              </Text>
              <Text style={s.date}>{fmt(st.deadline)}</Text>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { height: 56, marginTop: 4 },
  track: { position: "absolute", left: 0, right: 0, top: 8, height: 2, backgroundColor: c.hair, borderRadius: 1 },
  line: { position: "absolute", left: 0, top: 8, height: 2, backgroundColor: c.ink, borderRadius: 1 },
  dot: { position: "absolute", top: 4, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: c.ink },
  tag: { position: "absolute", top: 20 },
  amount: { color: c.ink, fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"] },
  date: { color: c.muted, fontSize: 12 },
});
