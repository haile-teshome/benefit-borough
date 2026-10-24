import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Tile } from "../../../lib/types";
import { api } from "@/api";
import { SectionLabel } from "@/components/bits";
import { Hero } from "@/components/Hero";
import { ScanView } from "@/components/ScanView";
import { TileCard } from "@/components/TileCard";
import { useExpire } from "@/state";
import { FadeIn, haptic } from "@/ui/motion";
import { c, radius, type } from "@/ui/theme";

const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

export default function Board() {
  const { state, setState, integrations, error, setError, refresh } = useExpire();
  const [phase, setPhase] = useState(-1);
  const [refreshing, setRefreshing] = useState(false);

  async function scan() {
    if (!state) return;
    setError("");
    haptic.press();
    const steps = state.docs.length + 3;
    setPhase(0);
    const request = api.scan();
    // Paced so the audience can follow each document being read; the request runs in parallel.
    for (let i = 1; i <= steps; i++) {
      await wait(i <= state.docs.length ? 380 : 520);
      setPhase(i);
    }
    try {
      const r = await request;
      haptic.success();
      setState(r.state);
    } catch (e) {
      haptic.error();
      setError((e as Error).message);
    } finally {
      setPhase(-1);
    }
  }

  function confirmReset() {
    const run = async () => setState((await api.reset()).state);
    if (Platform.OS === "web") return void run();
    Alert.alert("Reset demo?", "Clears the board and the ledger.", [
      { text: "Cancel", style: "cancel" },
      { text: "Reset", style: "destructive", onPress: run },
    ]);
  }

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  const open = (t: Tile) => router.push({ pathname: "/tile/[id]", params: { id: t.id } });

  const tiles = state?.tiles ?? [];
  const done = new Set(state?.done ?? []);
  const actNow = tiles.filter((t) => !done.has(t.id) && t.live && t.action.kind !== "none");
  const info = tiles.filter((t) => !done.has(t.id) && !(t.live && t.action.kind !== "none"));
  const rescuedTiles = tiles.filter((t) => done.has(t.id));
  const rescued = state?.ledger.reduce((s, e) => s + e.amount, 0) ?? 0;
  const atStake = tiles.filter((t) => !done.has(t.id)).reduce((s, t) => s + t.atStake, 0);
  const horizon = tiles.length ? Math.max(...tiles.map((t) => t.daysLeft)) : 0;
  let i = 0;

  return (
    <SafeAreaView style={s.screen} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>
        {error ? (
          <FadeIn style={s.error}>
            <MaterialCommunityIcons name="wifi-alert" size={20} color={c.bad} />
            <Text style={[type.small, { color: c.bad, flex: 1 }]}>{error}</Text>
            <Pressable onPress={refresh} hitSlop={8}><Text style={{ color: c.bad, fontWeight: "800" }}>Retry</Text></Pressable>
          </FadeIn>
        ) : null}

        {!state ? (
          <ActivityIndicator style={{ marginTop: 80 }} color={c.accent} />
        ) : !tiles.length ? (
          <ScanView docs={state.docs} phase={phase} onScan={scan} />
        ) : (
          <>
            <FadeIn><Hero atStake={atStake} rescued={rescued} total={tiles.reduce((sum, t) => sum + t.atStake, 0)} horizon={horizon} integrations={integrations} /></FadeIn>

            {actNow.length > 0 && <SectionLabel text="Act now" count={actNow.length} />}
            {actNow.map((t) => <TileCard key={t.id} tile={t} verdict={state.reviews[t.id]} done={false} index={i++} onPress={() => open(t)} />)}

            {rescuedTiles.length > 0 && <SectionLabel text="Rescued" count={rescuedTiles.length} />}
            {rescuedTiles.map((t) => <TileCard key={t.id} tile={t} verdict={state.reviews[t.id]} done index={i++} onPress={() => open(t)} />)}

            {info.length > 0 && <SectionLabel text="Good to know" count={info.length} />}
            {info.map((t) => <TileCard key={t.id} tile={t} verdict={state.reviews[t.id]} done={false} index={i++} onPress={() => open(t)} />)}

            <Pressable onPress={confirmReset} style={s.reset} hitSlop={8}>
              <MaterialCommunityIcons name="restart" size={16} color={c.muted} />
              <Text style={{ color: c.muted, fontWeight: "600" }}>Reset demo</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  error: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: c.badSoft, borderRadius: radius.md, padding: 12 },
  reset: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", paddingVertical: 18 },
});
