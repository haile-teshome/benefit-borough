import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";
import type { Integrations } from "@/api";
import { usd } from "@/api";
import { Bar, useCountUp } from "@/ui/motion";
import { c, radius, type } from "@/ui/theme";

export function Hero({ atStake, rescued, total, horizon, integrations }: { atStake: number; rescued: number; total: number; horizon: number; integrations: Integrations | null }) {
  const stake = useCountUp(Math.round(atStake), 1200);
  const saved = useCountUp(Math.round(rescued), 900);
  return (
    <LinearGradient colors={[c.hero1, c.hero2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
      <View style={s.row}>
        <Text style={s.brand}>expire</Text>
        <View style={s.live}>
          <View style={[s.dot, { backgroundColor: integrations?.claude ? c.mint : "#F5B94A" }]} />
          <Text style={s.liveText}>{integrations?.claude ? "Claude live" : "Demo data"}</Text>
        </View>
      </View>
      <Text style={s.k}>Expiring in the next {horizon} days</Text>
      <Text style={s.big}>{usd(stake)}</Text>
      <View style={{ marginTop: 14, gap: 8 }}>
        <Bar value={total ? rescued / total : 0} color={c.mint} track="rgba(255,255,255,0.14)" height={10} delay={300} />
        <View style={s.row}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <MaterialCommunityIcons name="check-decagram" size={16} color={c.mint} />
            <Text style={s.saved}>{usd(saved)} rescued</Text>
          </View>
          <Text style={s.of}>of {usd(Math.round(total))}</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: 20, paddingTop: 18 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brand: { color: "#fff", fontSize: 22, fontWeight: "800", letterSpacing: -0.6 },
  live: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "600" },
  k: { ...type.label, color: "rgba(255,255,255,0.6)", marginTop: 22 },
  big: { ...type.display, color: "#fff", marginTop: 4, fontSize: 52 },
  saved: { color: c.mint, fontWeight: "700", fontSize: 15 },
  of: { color: "rgba(255,255,255,0.55)", fontSize: 13 },
});
