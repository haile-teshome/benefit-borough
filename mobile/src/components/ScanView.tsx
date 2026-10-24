import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { ActivityIndicator, Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import type { AppState } from "../../../lib/types";
import { FadeIn, Pop, PressScale } from "@/ui/motion";
import { c, radius, shadow, type } from "@/ui/theme";

const PHASES = ["Reading documents", "Finding expiring balances", "Computing the best order", "Reviewer checking every action"];

// Empty state + scan progress. `phase` is -1 before scanning; while scanning it advances 0..docs+phases.
export function ScanView({ docs, phase, onScan }: { docs: AppState["docs"]; phase: number; onScan: () => void }) {
  const scanning = phase >= 0;
  return (
    <View style={{ gap: 16 }}>
      <FadeIn>
        <LinearGradient colors={[c.hero1, c.hero2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
          <Text style={s.brand}>expire</Text>
          <Text style={s.title}>Find the money you’re about to lose.</Text>
          <Text style={s.sub}>Benefits, dental plans, EOBs, dining and card statements. Every number links to the line it came from.</Text>
          {scanning && <ScanLine />}
        </LinearGradient>
      </FadeIn>

      <View style={s.card}>
        <Text style={[type.label, { color: c.muted, marginBottom: 4 }]}>{scanning ? PHASES[Math.min(PHASES.length - 1, Math.max(0, phase - docs.length + 1))] : `${docs.length} documents ready`}</Text>
        {docs.map((d, i) => {
          const state = !scanning ? "idle" : phase > i ? "done" : phase === i ? "active" : "waiting";
          return (
            <FadeIn key={d.id} delay={120 + i * 60} style={s.doc}>
              <View style={[s.docIcon, state === "done" && { backgroundColor: c.accentSoft }]}>
                <MaterialCommunityIcons name="file-document-outline" size={20} color={state === "done" ? c.accent : c.ink2} />
              </View>
              <Text style={[s.docName, state === "waiting" && { color: c.muted }]} numberOfLines={1}>{d.name.replace(/\.txt$/, "")}</Text>
              {state === "active" ? <ActivityIndicator size="small" color={c.accent} />
                : state === "done" ? <Pop><MaterialCommunityIcons name="check-circle" size={22} color={c.accent} /></Pop>
                : null}
            </FadeIn>
          );
        })}
      </View>

      <PressScale onPress={onScan} disabled={scanning} style={[s.cta, scanning && { opacity: 0.7 }]} accessibilityRole="button">
        {scanning ? <ActivityIndicator color="#fff" /> : <MaterialCommunityIcons name="line-scan" size={20} color="#fff" />}
        <Text style={s.ctaText}>{scanning ? "Scanning…" : "Scan my documents"}</Text>
      </PressScale>
    </View>
  );
}

function ScanLine() {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== "web" }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={s.scanTrack}>
      <Animated.View style={[s.scanBeam, { transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-120, 320] }) }] }]} />
    </View>
  );
}

const s = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: 22, gap: 10, overflow: "hidden" },
  brand: { color: c.mint, fontSize: 18, fontWeight: "800", letterSpacing: -0.4 },
  title: { ...type.h1, color: "#fff", fontSize: 32, lineHeight: 36 },
  sub: { ...type.body, color: "rgba(255,255,255,0.7)" },
  scanTrack: { height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.1)", overflow: "hidden", marginTop: 6 },
  scanBeam: { width: 120, height: 4, borderRadius: 2, backgroundColor: c.mint },
  card: { backgroundColor: c.panel, borderRadius: radius.lg, padding: 14, gap: 8, ...shadow },
  doc: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  docIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#EEECE7", alignItems: "center", justifyContent: "center" },
  docName: { flex: 1, ...type.body, fontWeight: "600", color: c.ink },
  cta: { flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", backgroundColor: c.accent, borderRadius: radius.md, paddingVertical: 17 },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 17 },
});
