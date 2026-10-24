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
  const firstMoney = stops.findIndex((st) => st.amount > 0);

  useEffect(() => {
    Animated.timing(draw, { toValue: 1, duration: 1100, delay: 250, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [draw]);

  return (
    <View style={s.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={s.track} />
      <Animated.View style={[s.line, { width: draw.interpolate({ inputRange: [0, 1], outputRange: [0, width] }) }]} />
      <View style={[s.dot, s.today]} />
      <Text style={[s.label, { left: 0 }]}>Today</Text>
      {width > 0 && stops.map((st, i) => {
        const x = (st.days / horizon) * width;
        const atEnd = x > width - 40;
        const show = draw.interpolate({ inputRange: [Math.max(0, st.days / horizon - 0.05), Math.min(1, st.days / horizon + 0.001)], outputRange: [0, 1], extrapolate: "clamp" });
        return (
          <Animated.View key={st.deadline} style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, opacity: show }} pointerEvents="none">
            <View style={[s.dot, { left: x - 6, backgroundColor: st.rescued ? c.mint : st.amount === 0 ? "rgba(255,255,255,0.4)" : i === firstMoney ? "#F59E6B" : "#fff" }]} />
            <View style={[s.tag, atEnd ? { right: 0, alignItems: "flex-end" } : { left: Math.max(0, x - 30), alignItems: "center", width: 60 }]}>
              <Text style={[s.amount, st.rescued && { color: c.mint }]}>{st.rescued ? "Rescued" : st.amount > 0 ? usd(Math.round(st.amount)) : st.note}</Text>
              <Text style={s.date}>{fmt(st.deadline)}</Text>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { height: 58, marginTop: 18 },
  track: { position: "absolute", left: 0, right: 0, top: 9, height: 2, backgroundColor: "rgba(255,255,255,0.14)", borderRadius: 1 },
  line: { position: "absolute", left: 0, top: 9, height: 2, backgroundColor: "rgba(255,255,255,0.7)", borderRadius: 1 },
  dot: { position: "absolute", top: 4, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: c.hero1 },
  today: { left: -2, backgroundColor: c.mint },
  label: { position: "absolute", top: 24, color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: "600" },
  tag: { position: "absolute", top: 22 },
  amount: { color: "#fff", fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] },
  date: { color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: "600" },
});
