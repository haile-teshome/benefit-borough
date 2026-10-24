import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Tile, Verdict } from "../../../lib/types";
import { api, usd } from "@/api";
import { useExpire } from "@/state";
import { c, CATEGORY } from "@/theme";

function useCountUp(target: number) {
  const anim = useRef(new Animated.Value(target)).current;
  const [v, setV] = useState(target);
  useEffect(() => {
    const id = anim.addListener(({ value }) => setV(Math.round(value)));
    Animated.timing(anim, { toValue: target, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => anim.removeListener(id);
  }, [target]);
  return v;
}

export default function Board() {
  const { state, setState, integrations, error, setError, refresh } = useExpire();
  const [scanStep, setScanStep] = useState(-1);

  const ledgerTotal = state?.ledger.reduce((s, e) => s + e.amount, 0) ?? 0;
  const atStake = state?.tiles.filter((t) => !state.done.includes(t.id)).reduce((s, t) => s + t.atStake, 0) ?? 0;
  const ledger = useCountUp(ledgerTotal);
  const stake = useCountUp(Math.round(atStake));
  const horizon = state?.tiles.length ? Math.max(...state.tiles.map((t) => t.daysLeft)) : 0;

  async function scan() {
    setError("");
    setScanStep(0);
    const t1 = setTimeout(() => setScanStep(1), 700);
    const t2 = setTimeout(() => setScanStep(2), 1400);
    try {
      const r = await api.scan();
      await new Promise((ok) => setTimeout(ok, 1800));
      setState(r.state);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      clearTimeout(t1); clearTimeout(t2); setScanStep(-1);
    }
  }

  async function reset() {
    const r = await api.reset();
    setState(r.state);
  }

  return (
    <SafeAreaView style={s.screen} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}>
        <Text style={s.brand}>Expire</Text>
        <Text style={s.tagline}>Trackers remind. Advisors suggest. Expire rescues, in the best order, and does it.</Text>
        {integrations && (
          <View style={s.badges}>
            {(["claude", "cartesia", "nessie"] as const).map((k) => (
              <Text key={k} style={[s.badge, integrations[k] && s.badgeLive]}>{k[0].toUpperCase() + k.slice(1)} {integrations[k] ? "live" : "mock"}</Text>
            ))}
            <Text style={s.badge}>x402 mock</Text>
          </View>
        )}

        {error ? <Text style={s.error}>{error}</Text> : null}

        {!state ? (
          <ActivityIndicator style={{ marginTop: 40 }} />
        ) : !state.tiles.length ? (
          <View style={s.hero}>
            <Text style={s.heroTitle}>Find the money you're about to lose</Text>
            <Text style={s.heroBody}>Benefits, treatment plans, EOBs, dining and card statements. Every number links to the line it came from.</Text>
            {state.docs.map((d) => <Text key={d.id} style={s.doc}>📄 {d.name}</Text>)}
            <Pressable style={({ pressed }) => [s.primary, (pressed || scanStep >= 0) && { opacity: 0.6 }]} disabled={scanStep >= 0} onPress={scan}>
              <Text style={s.primaryText}>{scanStep >= 0 ? "Scanning…" : "Scan my documents"}</Text>
            </Pressable>
            {scanStep >= 0 && (
              <View style={{ marginTop: 14, gap: 6 }}>
                {["Extracting balances", "Optimizing each tile", "Reviewer checking every action"].map((label, i) => (
                  <Text key={label} style={[s.step, i <= scanStep && s.stepOn]}>{i <= scanStep ? "●" : "○"}  {label}</Text>
                ))}
              </View>
            )}
          </View>
        ) : (
          <>
            <View style={s.stats}>
              <View style={s.stat}>
                <Text style={s.statK}>AT STAKE · {horizon} DAYS</Text>
                <Text style={s.statV}>{usd(stake)}</Text>
              </View>
              <View style={s.stat}>
                <Text style={s.statK}>RESCUED</Text>
                <Text style={[s.statV, { color: c.accent }]}>{usd(ledger)}</Text>
              </View>
            </View>
            {state.tiles.map((t) => (
              <TileCard key={t.id} tile={t} verdict={state.reviews[t.id]} done={state.done.includes(t.id)} onPress={() => router.push({ pathname: "/tile/[id]", params: { id: t.id } })} />
            ))}
            <Pressable onPress={reset} style={s.secondary}><Text style={s.secondaryText}>Reset demo</Text></Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TileCard({ tile, verdict, done, onPress }: { tile: Tile; verdict?: Verdict; done: boolean; onPress: () => void }) {
  const pill = done
    ? { text: "Done ✓", style: s.pillOk }
    : !tile.live
      ? { text: "Detected", style: s.pillStatic }
      : verdict?.verdict === "approve"
        ? { text: "Reviewer ✓", style: s.pillOk }
        : verdict ? { text: "Blocked", style: s.pillNo } : null;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.tile, done && s.tileDone, pressed && { opacity: 0.85 }]}>
      <View style={s.row}>
        <Text style={s.cat}>{CATEGORY[tile.category].toUpperCase()}</Text>
        {pill && <Text style={[s.pill, pill.style]}>{pill.text}</Text>}
      </View>
      <View style={s.row}>
        <Text style={s.amt}>{usd(Math.round(tile.atStake))}</Text>
        <Text style={s.days}>{tile.daysLeft} days</Text>
      </View>
      <Text style={s.tileTitle}>{tile.title}</Text>
      <Text style={s.tileHead}>{tile.headline}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { padding: 16, paddingBottom: 60, gap: 12 },
  brand: { fontSize: 34, fontWeight: "800", color: c.ink, letterSpacing: -0.5 },
  tagline: { color: c.muted, fontSize: 14, marginTop: -6 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  badge: { fontSize: 12, color: c.muted, borderWidth: 1, borderColor: c.line, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
  badgeLive: { color: c.accent, borderColor: c.accent },
  error: { color: c.bad, fontWeight: "600" },
  hero: { backgroundColor: c.panel, borderRadius: 16, borderWidth: 1, borderColor: c.line, padding: 20, gap: 8, marginTop: 8 },
  heroTitle: { fontSize: 26, fontWeight: "800", color: c.ink },
  heroBody: { color: c.muted, fontSize: 15, marginBottom: 6 },
  doc: { fontSize: 14, color: c.ink, backgroundColor: c.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, overflow: "hidden" },
  primary: { backgroundColor: c.accent, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 10 },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 17 },
  secondary: { borderWidth: 1, borderColor: c.line, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  secondaryText: { color: c.ink, fontWeight: "600" },
  step: { color: c.muted, fontSize: 15 },
  stepOn: { color: c.ink, fontWeight: "700" },
  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, backgroundColor: c.panel, borderRadius: 14, borderWidth: 1, borderColor: c.line, padding: 14 },
  statK: { fontSize: 11, color: c.muted, letterSpacing: 0.6 },
  statV: { fontSize: 30, fontWeight: "800", color: c.ink, fontVariant: ["tabular-nums"] },
  tile: { backgroundColor: c.panel, borderRadius: 16, borderWidth: 1, borderColor: c.line, padding: 16, gap: 6 },
  tileDone: { backgroundColor: c.goodBg, borderColor: c.accent },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cat: { fontSize: 12, color: c.muted, letterSpacing: 0.6 },
  amt: { fontSize: 34, fontWeight: "800", color: c.ink, fontVariant: ["tabular-nums"] },
  days: { fontSize: 16, fontWeight: "700", color: c.warn },
  tileTitle: { fontSize: 17, fontWeight: "700", color: c.ink },
  tileHead: { fontSize: 15, color: c.muted },
  pill: { fontSize: 12, fontWeight: "700", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
  pillOk: { backgroundColor: c.goodBg, color: c.accent },
  pillNo: { backgroundColor: c.badBg, color: c.bad },
  pillStatic: { backgroundColor: c.bg, color: c.muted },
});
