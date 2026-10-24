import { StyleSheet, Text, View } from "react-native";
import type { Tile } from "../../../lib/types";
import { usd } from "@/api";
import { Timeline } from "@/components/Timeline";
import { useCountUp } from "@/ui/motion";
import { c, radius, type } from "@/ui/theme";

export function Summary({ atStake, rescued, tiles, done }: { atStake: number; rescued: number; tiles: Tile[]; done: Set<string> }) {
  const stake = useCountUp(Math.round(atStake), 900);
  const saved = useCountUp(Math.round(rescued), 900);
  return (
    <View style={s.card}>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={type.small}>At stake</Text>
          <Text style={s.big}>{usd(stake)}</Text>
        </View>
        <View style={s.vr} />
        <View style={{ flex: 1, paddingLeft: 16 }}>
          <Text style={type.small}>Rescued</Text>
          <Text style={[s.big, rescued > 0 && { color: c.good }]}>{usd(saved)}</Text>
        </View>
      </View>
      <Timeline tiles={tiles} done={done} />
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, borderRadius: radius.lg, padding: 18, gap: 16, backgroundColor: "#fff" },
  row: { flexDirection: "row", alignItems: "stretch" },
  vr: { width: StyleSheet.hairlineWidth, backgroundColor: c.line },
  big: { fontSize: 28, fontWeight: "600", color: c.ink, letterSpacing: -0.5, marginTop: 2, fontVariant: ["tabular-nums"] },
});
