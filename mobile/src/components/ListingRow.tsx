import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import type { Tile, Verdict } from "../../../lib/types";
import { usd } from "@/api";
import { Thumb } from "@/components/ui";
import { FadeIn, PressScale } from "@/ui/motion";
import { CAT, c, type } from "@/ui/theme";

// Titles read "Dental: split the plan…"; the category is shown separately, so drop the prefix.
export const shortTitle = (title: string) => {
  const rest = title.replace(/^[^:]{1,30}:\s*/, "");
  return rest.charAt(0).toUpperCase() + rest.slice(1);
};

export function ListingRow({ tile, verdict, done, index, onPress }: { tile: Tile; verdict?: Verdict; done: boolean; index: number; onPress: () => void }) {
  const ready = tile.live && tile.action.kind !== "none" && verdict?.verdict === "approve";
  const soon = tile.daysLeft <= 30;
  return (
    <FadeIn delay={40 + index * 50}>
      <PressScale onPress={onPress} style={s.row} accessibilityRole="button" accessibilityLabel={`${CAT[tile.category].label}: ${shortTitle(tile.title)}`}>
        <Thumb category={tile.category} size={64} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={type.h3} numberOfLines={2}>{shortTitle(tile.title)}</Text>
          <Text style={type.small} numberOfLines={1}>
            {CAT[tile.category].label} · <Text style={soon && !done ? { color: c.rausch, fontWeight: "600" } : undefined}>{tile.daysLeft} days left</Text>
          </Text>
          {done ? (
            <View style={s.status}>
              <MaterialCommunityIcons name="check-circle" size={14} color={c.good} />
              <Text style={[type.small, { color: c.good, fontWeight: "600" }]}>Rescued</Text>
            </View>
          ) : ready ? (
            <View style={s.status}>
              <MaterialCommunityIcons name="shield-check-outline" size={14} color={c.ink} />
              <Text style={[type.small, { color: c.ink }]}>{tile.action.kind === "book_call" ? "Ready to book" : "Ready to send"}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[s.amount, done && { color: c.good }]}>{done ? "+" : ""}{usd(Math.round(done ? tile.action.savings : tile.atStake))}</Text>
          <Text style={type.tiny}>{done ? "saved" : tile.atStake > 0 ? "at stake" : "info"}</Text>
        </View>
      </PressScale>
    </FadeIn>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", gap: 14, alignItems: "flex-start", paddingVertical: 16 },
  status: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  amount: { fontSize: 16, fontWeight: "600", color: c.ink, fontVariant: ["tabular-nums"] },
});
