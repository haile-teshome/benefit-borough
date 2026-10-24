import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import type { Category } from "../../../lib/types";
import { CAT, c, type, urgency } from "@/ui/theme";

export function CatIcon({ category, size = 44 }: { category: Category; size?: number }) {
  const m = CAT[category];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 3, backgroundColor: m.soft, alignItems: "center", justifyContent: "center" }}>
      <MaterialCommunityIcons name={m.icon} size={size * 0.52} color={m.color} />
    </View>
  );
}

export function DaysChip({ days }: { days: number }) {
  const u = urgency(days);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: u.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
      <MaterialCommunityIcons name="timer-sand" size={12} color={u.fg} />
      <Text style={{ ...type.small, fontWeight: "700", color: u.fg }}>{days}d</Text>
    </View>
  );
}

export function Chip({ icon, text, fg, bg }: { icon?: keyof typeof MaterialCommunityIcons.glyphMap; text: string; fg: string; bg: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" }}>
      {icon && <MaterialCommunityIcons name={icon} size={12} color={fg} />}
      <Text style={{ fontSize: 12, fontWeight: "700", color: fg }}>{text}</Text>
    </View>
  );
}

export function SectionLabel({ text, count }: { text: string; count?: number }) {
  return (
    <Text style={{ ...type.label, color: c.muted, marginTop: 14, marginBottom: 2, marginLeft: 4 }}>
      {text}{count !== undefined ? `  ·  ${count}` : ""}
    </Text>
  );
}
