import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { Category } from "../../../lib/types";
import { PressScale } from "@/ui/motion";
import { CAT, c, radius, type } from "@/ui/theme";

type Icon = keyof typeof MaterialCommunityIcons.glyphMap;

export function Thumb({ category, size = 56 }: { category: Category; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: c.soft, alignItems: "center", justifyContent: "center" }}>
      <MaterialCommunityIcons name={CAT[category].icon} size={size * 0.46} color={c.ink} />
    </View>
  );
}

export const Divider = ({ inset = 0, space = 0 }: { inset?: number; space?: number }) => (
  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginLeft: inset, marginVertical: space }} />
);

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <View style={{ gap: 4, marginBottom: 12 }}>
      <Text style={type.h2}>{children}</Text>
      {sub ? <Text style={type.small}>{sub}</Text> : null}
    </View>
  );
}

// Airbnb's "Reserve" button: the one place the red gradient appears.
export function PrimaryButton({ label, onPress, disabled, loading, icon, style }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean; icon?: Icon; style?: StyleProp<ViewStyle> }) {
  return (
    <PressScale onPress={onPress} disabled={disabled || loading} style={[{ borderRadius: radius.sm, overflow: "hidden" }, style]} accessibilityRole="button" accessibilityLabel={label}>
      <LinearGradient colors={disabled ? ["#DDDDDD", "#DDDDDD"] : [c.rauschDeep, c.rauschEnd]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={s.primary}>
        {loading ? <ActivityIndicator color="#fff" /> : icon ? <MaterialCommunityIcons name={icon} size={18} color="#fff" /> : null}
        <Text style={s.primaryText}>{label}</Text>
      </LinearGradient>
    </PressScale>
  );
}

export function DarkButton({ label, onPress, style }: { label: string; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <PressScale onPress={onPress} style={[s.dark, style]} accessibilityRole="button">
      <Text style={s.primaryText}>{label}</Text>
    </PressScale>
  );
}

export function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button">
      <Text style={s.link}>{label}</Text>
    </Pressable>
  );
}

// Listing-style highlight: outline icon, bold line, gray explanation.
export function Highlight({ icon, title, text, tone }: { icon: Icon; title: string; text?: string; tone?: "good" | "bad" }) {
  const color = tone === "good" ? c.good : tone === "bad" ? c.bad : c.ink;
  return (
    <View style={s.highlight}>
      <MaterialCommunityIcons name={icon} size={26} color={color} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.h3, { color }]}>{title}</Text>
        {text ? <Text style={type.small}>{text}</Text> : null}
      </View>
    </View>
  );
}

export function CircleButton({ icon, onPress, label }: { icon: Icon; onPress: () => void; label: string }) {
  return (
    <PressScale onPress={onPress} style={s.circle} accessibilityRole="button" accessibilityLabel={label}>
      <MaterialCommunityIcons name={icon} size={18} color={c.ink} />
    </PressScale>
  );
}

const s = StyleSheet.create({
  primary: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", paddingVertical: 15, paddingHorizontal: 24 },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  dark: { backgroundColor: c.ink, borderRadius: radius.sm, paddingVertical: 15, alignItems: "center" },
  link: { fontSize: 16, fontWeight: "600", color: c.ink, textDecorationLine: "underline" },
  highlight: { flexDirection: "row", gap: 18, alignItems: "flex-start" },
  circle: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#fff", borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, alignItems: "center", justifyContent: "center" },
});
