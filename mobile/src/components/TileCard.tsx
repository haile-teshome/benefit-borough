import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import type { Tile, Verdict } from "../../../lib/types";
import { usd } from "@/api";
import { CatIcon, Chip, DaysChip } from "@/components/bits";
import { FadeIn, PressScale } from "@/ui/motion";
import { CAT, c, radius, shadow, type } from "@/ui/theme";

// Titles read "Dental: split the plan…"; the category is already shown above, so drop the prefix.
const shortTitle = (title: string) => {
  const rest = title.replace(/^[^:]{1,30}:\s*/, "");
  return rest.charAt(0).toUpperCase() + rest.slice(1);
};

export function TileCard({ tile, verdict, done, index, onPress }: { tile: Tile; verdict?: Verdict; done: boolean; index: number; onPress: () => void }) {
  const cta = tile.action.kind === "book_call" ? "Book it" : tile.action.kind === "transfer" ? "Send it" : null;
  return (
    <FadeIn delay={80 + index * 70}>
      <PressScale onPress={onPress} style={[s.card, done && s.done]} accessibilityRole="button" accessibilityLabel={`${CAT[tile.category].label}: ${tile.title}`}>
        <View style={s.top}>
          <CatIcon category={tile.category} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.label, { color: CAT[tile.category].color }]}>{CAT[tile.category].label}</Text>
            <Text style={s.title} numberOfLines={2}>{shortTitle(tile.title)}</Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 6 }}>
            <Text style={[s.amt, done && { color: c.accent }]}>{done ? "+" : ""}{usd(Math.round(done ? tile.action.savings : tile.atStake))}</Text>
            {!done && <DaysChip days={tile.daysLeft} />}
          </View>
        </View>
        <Text style={s.head} numberOfLines={2}>{tile.headline}</Text>
        <View style={s.foot}>
          {done ? (
            <Chip icon="check-circle" text="Rescued" fg={c.accent} bg={c.accentSoft} />
          ) : verdict?.verdict === "reject" ? (
            <Chip icon="shield-alert" text={`Blocked · rule ${verdict.rule_cited}`} fg={c.bad} bg={c.badSoft} />
          ) : tile.live && cta ? (
            <Chip icon="shield-check" text="Reviewer approved" fg={c.accent} bg={c.accentSoft} />
          ) : (
            <Chip icon="information-outline" text={tile.live ? "No action needed" : "Suggestion"} fg={c.ink2} bg="#EEECE7" />
          )}
          {!done && cta && verdict?.verdict === "approve" && (
            <View style={s.cta}>
              <Text style={s.ctaText}>{cta}</Text>
              <MaterialCommunityIcons name="arrow-right" size={16} color="#fff" />
            </View>
          )}
        </View>
      </PressScale>
    </FadeIn>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: c.panel, borderRadius: radius.lg, padding: 16, gap: 10, ...shadow },
  done: { backgroundColor: "#F7FCFA", borderWidth: 1, borderColor: "#BFE9DD", shadowOpacity: 0.03 },
  top: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  title: { ...type.h3, color: c.ink, lineHeight: 21 },
  amt: { fontSize: 22, fontWeight: "800", color: c.ink, fontVariant: ["tabular-nums"], letterSpacing: -0.5 },
  head: { ...type.body, color: c.ink2 },
  foot: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cta: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: c.ink, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
