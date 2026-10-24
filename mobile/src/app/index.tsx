import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Category, Tile } from "../../../lib/types";
import { api, usd } from "@/api";
import { CategoryBar, type Filter } from "@/components/CategoryBar";
import { ListingRow } from "@/components/ListingRow";
import { ScanView } from "@/components/ScanView";
import { Summary } from "@/components/Summary";
import { Divider } from "@/components/ui";
import { useExpire } from "@/state";
import { FadeIn, haptic } from "@/ui/motion";
import { c, type } from "@/ui/theme";

const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

export default function Board() {
  const { state, setState, integrations, error, setError, refresh } = useExpire();
  const [phase, setPhase] = useState(-1);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

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
    const run = async () => { setFilter("all"); setState((await api.reset()).state); };
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
  const rescued = state?.ledger.reduce((s, e) => s + e.amount, 0) ?? 0;
  const atStake = tiles.filter((t) => !done.has(t.id)).reduce((s, t) => s + t.atStake, 0);
  const horizon = tiles.length ? Math.max(...tiles.map((t) => t.daysLeft)) : 0;
  const categories = [...new Set(tiles.map((t) => t.category))] as Category[];
  const shown = tiles.filter((t) => filter === "all" || t.category === filter);
  const toDo = shown.filter((t) => !done.has(t.id) && t.live && t.action.kind !== "none");
  const rest = shown.filter((t) => !done.has(t.id) && !(t.live && t.action.kind !== "none"));
  const finished = shown.filter((t) => done.has(t.id));
  let i = 0;

  const group = (title: string, list: Tile[]) =>
    list.length > 0 && (
      <View key={title} style={{ marginTop: 28 }}>
        <Text style={type.h2}>{title}</Text>
        {list.map((t, n) => (
          <View key={t.id}>
            {n > 0 && <Divider inset={78} />}
            <ListingRow tile={t} verdict={state!.reviews[t.id]} done={done.has(t.id)} index={i++} onPress={() => open(t)} />
          </View>
        ))}
      </View>
    );

  return (
    <SafeAreaView style={s.screen} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.ink} />}>
        {error ? (
          <FadeIn style={s.error}>
            <MaterialCommunityIcons name="wifi-off" size={20} color={c.bad} />
            <Text style={[type.small, { color: c.bad, flex: 1 }]}>{error}</Text>
            <Pressable onPress={refresh} hitSlop={8}><Text style={{ color: c.ink, fontWeight: "600", textDecorationLine: "underline" }}>Retry</Text></Pressable>
          </FadeIn>
        ) : null}

        {!state ? (
          <ActivityIndicator style={{ marginTop: 80 }} color={c.ink} />
        ) : !tiles.length ? (
          <ScanView docs={state.docs} phase={phase} onScan={scan} />
        ) : (
          <>
            <FadeIn style={{ gap: 6, marginBottom: 20 }}>
              <View style={s.topRow}>
                <Text style={s.brand}>expire</Text>
                {!integrations?.claude && <Text style={type.tiny}>Demo data</Text>}
              </View>
              <Text style={type.hero}>Expiring soon</Text>
              <Text style={type.small}>{usd(Math.round(atStake))} across {tiles.filter((t) => !done.has(t.id) && t.atStake > 0).length} balances in the next {horizon} days</Text>
            </FadeIn>

            <FadeIn delay={60}><Summary atStake={atStake} rescued={rescued} tiles={tiles} done={done} /></FadeIn>

            <View style={{ marginTop: 24 }}>
              <CategoryBar categories={categories} value={filter} onChange={setFilter} />
            </View>

            {group("To do", toDo)}
            {group("Rescued", finished)}
            {group("Good to know", rest)}

            <Pressable onPress={confirmReset} style={s.reset} hitSlop={8}>
              <Text style={{ color: c.muted, textDecorationLine: "underline" }}>Reset demo</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 48 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  brand: { fontSize: 22, fontWeight: "700", color: c.rausch, letterSpacing: -0.6 },
  error: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: c.badSoft, borderRadius: 12, padding: 12, marginBottom: 12 },
  reset: { alignItems: "center", paddingVertical: 28 },
});
