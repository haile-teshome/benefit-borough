import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, type ScrollViewInstance, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppState, DispatchResult, Span, Verdict } from "../../../../lib/types";
import { api, usd } from "@/api";
import { ActionRun } from "@/components/ActionRun";
import { CatIcon, Chip, DaysChip } from "@/components/bits";
import { CostBars } from "@/components/CostBars";
import { useExpire } from "@/state";
import { FadeIn, haptic, PressScale, Shake } from "@/ui/motion";
import { CAT, c, radius, shadow, type } from "@/ui/theme";

// Deep-linked tiles have no history to pop; fall back to the board.
const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

const CART_PRESETS = ["Sunscreen SPF 50, Aloe vera gel", "Electric toothbrush", "Reading glasses"];

export default function TileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, setState, refresh } = useExpire();
  const insets = useSafeAreaInsets();
  const tile = state?.tiles.find((t) => t.id === id);
  const [refreshed, setRefreshed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [result, setResult] = useState<DispatchResult | null>(null);
  const [error, setError] = useState("");
  const [cart, setCart] = useState(CART_PRESETS[0]);
  const [checking, setChecking] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const scroller = useRef<ScrollViewInstance>(null);

  // Opened by deep link or with stale state: fetch once before deciding the tile doesn't exist.
  useEffect(() => {
    if (!tile && !refreshed) refresh().finally(() => setRefreshed(true));
  }, [tile, refreshed, refresh]);

  if (!state || !tile) {
    return (
      <View style={[s.screen, { padding: 24, gap: 12, justifyContent: "center", alignItems: "center" }]}>
        {refreshed ? <Text style={[type.body, { color: c.muted, textAlign: "center" }]}>That tile isn’t on your board yet. Scan your documents first.</Text> : <ActivityIndicator color={c.accent} />}
        <Pressable onPress={close} hitSlop={12}><Text style={{ color: c.accent, fontWeight: "700", fontSize: 16 }}>Back</Text></Pressable>
      </View>
    );
  }

  const t = tile;
  const meta = CAT[t.category];
  const verdict = state.reviews[t.id];
  const cartVerdict = state.reviews[`cart:${t.balanceIds[0]}`];
  const done = state.done.includes(t.id);
  const actionable = t.live && t.action.kind !== "none";
  const approved = verdict?.verdict === "approve";

  async function run() {
    haptic.press();
    setConfirming(false); setError(""); setLines([]); setResult(null); setRunning(true);
    try {
      const r = await api.dispatch(t.id);
      for (const line of r.result.transcript) {
        setLines((l) => [...l, line]);
        haptic.tap();
        await new Promise((ok) => setTimeout(ok, 1000));
      }
      setResult(r.result);
      haptic.success();
      setState(r.state);
    } catch (e) {
      haptic.error();
      setRunning(false);
      setError((e as Error).message);
    }
  }

  async function checkCart(text = cart) {
    setChecking(true); setError("");
    try {
      const items = text.split(",").map((x) => x.trim()).filter(Boolean);
      const r = await api.reviewCart(t.balanceIds[0], items);
      setState(r.state);
      if (r.verdict.verdict === "reject") haptic.error(); else haptic.success();
      // Bring the verdict into view: it is the moment the demo is built around.
      setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 120);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  const actionLabel = t.action.kind === "book_call" ? "Book it" : `Send ${usd(Number(t.action.payload.amount))}`;

  return (
    <View style={s.screen}>
      <ScrollView ref={scroller} contentContainerStyle={[s.content, { paddingBottom: actionable && !done ? 150 + insets.bottom : 40 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <View style={s.grabber} />
        <View style={s.topRow}>
          <CatIcon category={t.category} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={[type.label, { color: meta.color }]}>{meta.label}</Text>
            <Text style={[type.small, { color: c.muted }]}>Deadline {new Date(`${t.deadline}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</Text>
          </View>
          <DaysChip days={t.daysLeft} />
          <Pressable onPress={close} hitSlop={12} style={s.close} accessibilityLabel="Close">
            <MaterialCommunityIcons name="close" size={20} color={c.ink2} />
          </Pressable>
        </View>

        <FadeIn><Text style={s.headline}>{t.headline}</Text></FadeIn>

        {actionable && t.action.savings > 0 && (
          <FadeIn delay={80} style={s.saveBanner}>
            <MaterialCommunityIcons name={done ? "check-decagram" : "trending-down"} size={22} color={c.accent} />
            <Text style={s.saveText}>{done ? `Rescued ${usd(t.action.savings)}` : `You save ${usd(t.action.savings)}`}</Text>
          </FadeIn>
        )}

        <FadeIn delay={120} style={s.card}>
          <Text style={s.cardTitle}>Your options</Text>
          <CostBars tile={t} />
        </FadeIn>

        <FadeIn delay={180} style={s.twoUp}>
          <Note icon="scale-balance" title="Tradeoff" text={t.tradeoff} tone="plain" />
          <Note icon="alert-circle-outline" title={`If you do nothing · ${usd(t.doNothingCost)}`} text={t.doNothing} tone={t.doNothingCost > 0 ? "warn" : "plain"} />
        </FadeIn>

        {verdict && actionable && (
          <FadeIn delay={240}>
            <VerdictCard v={verdict} title="Reviewer" />
          </FadeIn>
        )}

        {t.category === "fsa" && (
          <FadeIn delay={280} style={s.card}>
            <Text style={s.cardTitle}>Test the Reviewer</Text>
            <Text style={[type.small, { color: c.muted }]}>Try spending this balance. Expire refuses purchases you don’t need.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {CART_PRESETS.map((p) => (
                <PressScale key={p} onPress={() => { setCart(p); checkCart(p); }} style={[s.preset, cart === p && s.presetOn]}>
                  <Text style={[type.small, { fontWeight: "600", color: cart === p ? "#fff" : c.ink2 }]}>{p}</Text>
                </PressScale>
              ))}
            </ScrollView>
            <View style={s.inputRow}>
              <TextInput value={cart} onChangeText={setCart} style={s.input} placeholder="Items, comma separated" placeholderTextColor={c.muted} onSubmitEditing={() => checkCart()} returnKeyType="send" />
              <PressScale onPress={() => checkCart()} disabled={checking} style={s.askBtn} accessibilityLabel="Ask the Reviewer">
                {checking ? <ActivityIndicator color="#fff" size="small" /> : <MaterialCommunityIcons name="shield-search" size={22} color="#fff" />}
              </PressScale>
            </View>
            {cartVerdict && (
              <Shake trigger={cartVerdict.at}>
                <VerdictCard v={cartVerdict} title="Reviewer on this cart" big />
              </Shake>
            )}
          </FadeIn>
        )}

        <FadeIn delay={320} style={s.card}>
          <Pressable onPress={() => { haptic.tap(); setShowSources((v) => !v); }} style={s.srcHead} hitSlop={6}>
            <MaterialCommunityIcons name="file-search-outline" size={18} color={c.ink2} />
            <Text style={[s.cardTitle, { flex: 1, marginBottom: 0 }]}>Where these numbers come from · {t.sources.length}</Text>
            <MaterialCommunityIcons name={showSources ? "chevron-up" : "chevron-down"} size={22} color={c.muted} />
          </Pressable>
          {showSources && t.sources.map((sp, i) => <SourceView key={i} span={sp} docs={state.docs} />)}
        </FadeIn>

        {error ? <Text style={{ color: c.bad, fontWeight: "700", textAlign: "center" }}>{error}</Text> : null}
      </ScrollView>

      {actionable && !done && (
        <View style={[s.bar, { paddingBottom: insets.bottom + 12 }]}>
          {confirming ? (
            <FadeIn from={20} style={{ gap: 12 }}>
              <Text style={[type.body, { color: c.ink }]}>
                <Text style={{ fontWeight: "800" }}>Expire will: </Text>{t.action.summary}. Nothing else will be said or paid.
              </Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <PressScale onPress={() => setConfirming(false)} style={[s.btn, s.btnGhost]}><Text style={[s.btnText, { color: c.ink }]}>Cancel</Text></PressScale>
                <PressScale onPress={run} style={[s.btn, { flex: 2 }]}>
                  <MaterialCommunityIcons name="check" size={20} color="#fff" />
                  <Text style={s.btnText}>Confirm</Text>
                </PressScale>
              </View>
            </FadeIn>
          ) : (
            <PressScale onPress={() => { haptic.press(); setConfirming(true); }} disabled={!approved} style={[s.btn, !approved && { backgroundColor: "#B9B4AA" }]}>
              <MaterialCommunityIcons name={t.action.kind === "book_call" ? "phone" : "send"} size={20} color="#fff" />
              <Text style={s.btnText} numberOfLines={1}>{approved ? `${actionLabel} · save ${usd(t.action.savings)}` : "Blocked by the Reviewer"}</Text>
            </PressScale>
          )}
        </View>
      )}

      {running && <ActionRun tile={t} lines={lines} result={result} onDone={() => { setRunning(false); close(); }} />}
    </View>
  );
}

function Note({ icon, title, text, tone }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; text: string; tone: "plain" | "warn" }) {
  const warn = tone === "warn";
  return (
    <View style={[s.note, warn && { backgroundColor: c.warnSoft }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <MaterialCommunityIcons name={icon} size={16} color={warn ? c.warn : c.ink2} />
        <Text style={[type.label, { color: warn ? c.warn : c.ink2, flex: 1 }]} numberOfLines={2}>{title}</Text>
      </View>
      <Text style={[type.small, { color: c.ink }]}>{text}</Text>
    </View>
  );
}

function VerdictCard({ v, title, big }: { v: Verdict; title: string; big?: boolean }) {
  const ok = v.verdict === "approve";
  return (
    <View style={[s.verdict, ok ? { backgroundColor: c.accentSoft } : { backgroundColor: c.badSoft, borderColor: c.bad, borderWidth: 2 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <MaterialCommunityIcons name={ok ? "shield-check" : "shield-off"} size={big ? 26 : 22} color={ok ? c.accent : c.bad} />
        <Text style={[type.label, { color: ok ? c.accent : c.bad, flex: 1 }]}>{title}</Text>
        <Chip text={ok ? "Approved" : `Rejected · rule ${v.rule_cited ?? "?"}`} fg="#fff" bg={ok ? c.accent : c.bad} />
      </View>
      <Text style={[big ? { fontSize: 18, lineHeight: 25, fontWeight: "700" } : type.body, { color: ok ? "#0A5A4D" : c.bad }]}>{v.reason}</Text>
      <Text style={[type.small, { color: ok ? c.accent : c.bad, opacity: 0.75 }]}>{v.engine === "claude" ? "Claude Reviewer + rule checks" : "Rule checks"}</Text>
    </View>
  );
}

function SourceView({ span, docs }: { span: Span; docs: AppState["docs"] }) {
  const doc = docs.find((d) => d.id === span.doc);
  if (!doc) return null;
  const lineStart = doc.text.lastIndexOf("\n", span.start - 1) + 1;
  const endIdx = doc.text.indexOf("\n", span.end);
  const lineEnd = endIdx < 0 ? doc.text.length : endIdx;
  return (
    <FadeIn from={6} style={s.src}>
      <Text style={[type.small, { color: c.muted, marginBottom: 4 }]}>{doc.name}</Text>
      <Text style={s.mono}>
        {doc.text.slice(lineStart, span.start)}
        <Text style={{ backgroundColor: c.mark }}>{doc.text.slice(span.start, span.end)}</Text>
        {doc.text.slice(span.end, lineEnd)}
      </Text>
    </FadeIn>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { padding: 16, gap: 14 },
  grabber: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: "#D5D0C6" },
  topRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#E9E6E0", alignItems: "center", justifyContent: "center" },
  headline: { ...type.h1, color: c.ink, lineHeight: 34 },
  saveBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.accentSoft, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12 },
  saveText: { fontSize: 20, fontWeight: "800", color: c.accent },
  card: { backgroundColor: c.panel, borderRadius: radius.lg, padding: 16, gap: 10, ...shadow },
  cardTitle: { ...type.h3, color: c.ink, marginBottom: 2 },
  twoUp: { flexDirection: "row", gap: 10 },
  note: { flex: 1, backgroundColor: c.panel, borderRadius: radius.md, padding: 12, gap: 6, ...shadow },
  verdict: { borderRadius: radius.lg, padding: 16, gap: 8 },
  preset: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#EEECE7" },
  presetOn: { backgroundColor: c.ink },
  inputRow: { flexDirection: "row", gap: 8 },
  input: { flex: 1, height: 50, borderWidth: 1, borderColor: c.line, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: c.ink, backgroundColor: c.bg },
  askBtn: { width: 50, height: 50, borderRadius: radius.md, backgroundColor: c.ink, alignItems: "center", justifyContent: "center" },
  srcHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  src: { backgroundColor: c.bg, borderRadius: radius.sm, padding: 10 },
  mono: { fontFamily: "Menlo", fontSize: 12.5, lineHeight: 18, color: c.ink },
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: c.panel, paddingHorizontal: 16, paddingTop: 14, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, ...shadow, shadowOpacity: 0.12, shadowOffset: { width: 0, height: -4 } },
  btn: { flex: 1, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: c.accent, borderRadius: radius.md, paddingVertical: 17, paddingHorizontal: 14 },
  btnGhost: { backgroundColor: "#EEECE7" },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
