import { StyleSheet, Text, View } from "react-native";
import type { Tile } from "../../../lib/types";
import { usd } from "@/api";
import { Bar } from "@/ui/motion";
import { c, type } from "@/ui/theme";

// One bar per option, length proportional to what it costs you; the recommendation is highlighted.
export function CostBars({ tile }: { tile: Tile }) {
  const max = Math.max(1, ...tile.candidates.map((x) => x.costToUser));
  return (
    <View style={{ gap: 14 }}>
      {tile.candidates.map((x, i) => {
        const rec = x.id === tile.recommendation;
        return (
          <View key={x.id} style={{ gap: 6 }}>
            <View style={s.row}>
              <Text style={[s.label, rec && { color: c.ink, fontWeight: "700" }]} numberOfLines={2}>{x.label}</Text>
              <Text style={[s.cost, rec && { color: c.accent }]}>{usd(x.costToUser)}</Text>
            </View>
            <Bar value={x.costToUser / max} color={rec ? c.accent : "#C9C4BA"} track="#F0EDE7" height={10} delay={150 + i * 120} />
            <Text style={s.detail}>{rec ? "Recommended · " : ""}{x.detail}</Text>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 12 },
  label: { ...type.body, color: c.ink2, flex: 1 },
  cost: { fontSize: 20, fontWeight: "800", color: c.ink2, fontVariant: ["tabular-nums"] },
  detail: { ...type.small, color: c.muted },
});
