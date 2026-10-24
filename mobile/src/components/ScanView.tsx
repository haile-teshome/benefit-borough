import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { AppState } from "../../../lib/types";
import { Divider, PrimaryButton } from "@/components/ui";
import { FadeIn, Pop } from "@/ui/motion";
import { c, radius, type } from "@/ui/theme";

const PHASES = ["Reading your documents", "Finding expiring balances", "Working out the best order", "Checking every action"];

// Empty state + scan progress. `phase` is -1 before scanning; while scanning it advances 0..docs+phases.
export function ScanView({ docs, phase, onScan }: { docs: AppState["docs"]; phase: number; onScan: () => void }) {
  const scanning = phase >= 0;
  const status = PHASES[Math.min(PHASES.length - 1, Math.max(0, phase - docs.length + 1))];
  return (
    <View style={{ paddingTop: 8 }}>
      <FadeIn style={{ gap: 10, marginBottom: 28 }}>
        <Text style={s.brand}>expire</Text>
        <Text style={type.hero}>Find the money you’re about to lose</Text>
        <Text style={[type.body, { color: c.muted }]}>Benefits, dental plans, EOBs, dining and card statements. Every number links back to the line it came from.</Text>
      </FadeIn>

      <Text style={[type.h3, { marginBottom: 4 }]}>{scanning ? status : `${docs.length} documents`}</Text>
      <View>
        {docs.map((d, i) => {
          const st = !scanning ? "idle" : phase > i ? "done" : phase === i ? "active" : "waiting";
          return (
            <View key={d.id}>
              {i > 0 && <Divider inset={60} />}
              <FadeIn delay={80 + i * 50} style={s.doc}>
                <View style={s.icon}><MaterialCommunityIcons name="file-document-outline" size={22} color={c.ink} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[type.h3, st === "waiting" && { color: c.muted }]} numberOfLines={1}>{d.name.replace(/\.txt$/, "")}</Text>
                  <Text style={type.tiny}>{st === "done" ? "Read" : st === "active" ? "Reading…" : "Text document"}</Text>
                </View>
                {st === "active" ? <ActivityIndicator size="small" color={c.ink} />
                  : st === "done" ? <Pop><MaterialCommunityIcons name="check-circle" size={22} color={c.good} /></Pop>
                  : null}
              </FadeIn>
            </View>
          );
        })}
      </View>

      <PrimaryButton label={scanning ? "Scanning…" : "Scan documents"} loading={scanning} onPress={onScan} style={{ marginTop: 28 }} />
      <Text style={[type.tiny, { textAlign: "center", marginTop: 12 }]}>Nothing is booked or paid without your confirmation.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  brand: { fontSize: 22, fontWeight: "700", color: c.rausch, letterSpacing: -0.6, marginBottom: 6 },
  doc: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12 },
  icon: { width: 46, height: 46, borderRadius: radius.md, backgroundColor: c.soft, alignItems: "center", justifyContent: "center" },
});
