import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Category } from "../../../lib/types";
import { haptic } from "@/ui/motion";
import { CAT, c } from "@/ui/theme";

export type Filter = "all" | Category;

// Airbnb's category bar: outline icon over a label, the active one underlined in black.
export function CategoryBar({ categories, value, onChange }: { categories: Category[]; value: Filter; onChange: (f: Filter) => void }) {
  const items: { key: Filter; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
    { key: "all", label: "All", icon: "view-grid-outline" },
    ...categories.map((k) => ({ key: k as Filter, label: CAT[k].short, icon: CAT[k].icon })),
  ];
  return (
    <View style={s.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {items.map((it) => {
          const on = it.key === value;
          return (
            <Pressable key={it.key} onPress={() => { haptic.tap(); onChange(it.key); }} style={s.item} accessibilityRole="tab" accessibilityState={{ selected: on }}>
              <MaterialCommunityIcons name={it.icon} size={24} color={on ? c.ink : c.muted} />
              <Text style={[s.label, on && s.labelOn]}>{it.label}</Text>
              <View style={[s.bar, on && { backgroundColor: c.ink }]} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line, marginHorizontal: -20 },
  row: { paddingHorizontal: 20, gap: 28 },
  item: { alignItems: "center", gap: 6, paddingTop: 4 },
  label: { fontSize: 12, fontWeight: "600", color: c.muted },
  labelOn: { color: c.ink },
  bar: { height: 2, alignSelf: "stretch", backgroundColor: "transparent", marginTop: 4 },
});
