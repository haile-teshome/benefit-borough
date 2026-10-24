import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, type ScrollViewInstance, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppState, DispatchResult, Span, Verdict } from "../../../../lib/types";
import { api, usd } from "@/api";
import { ActionRun } from "@/components/ActionRun";
import { ConfirmSheet } from "@/components/ConfirmSheet";
import { shortTitle } from "@/components/ListingRow";
import { CircleButton, Divider, Highlight, LinkButton, PrimaryButton, SectionTitle, Thumb } from "@/components/ui";
import { useExpire } from "@/state";
import { FadeIn, haptic, PressScale, Shake } from "@/ui/motion";
import { CAT, c, radius, type } from "@/ui/theme";

// Deep-linked tiles have no history to pop; fall back to the board.
const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

const CART_PRESETS = ["Sunscreen SPF 50, Aloe vera gel", "Electric toothbrush", "Reading glasses"];
const fmt = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default function TileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, setState, refresh } = useExpire();
  const insets = useSafeAreaInsets();
  const tile = state?.tiles.find((t) => t.id === id);
  const [refreshed, setRefreshed] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [result, setResult] = useState<DispatchResult | null>(null);
  const [error, setError] = useState("");
  const [cart, setCart] = useState(CART_PRESETS[0]);
  const [checking, setChecking] = useState(false);
  const [allSources, setAllSources] = useState(false);
  const scroller = useRef<ScrollViewInstance>(null);

  // Opened by deep link or with stale state: fetch once before deciding the tile doesn't exist.
  useEffect(() => {
    if (!tile && !refreshed) refresh().finally(() => setRefreshed(true));
  }, [tile, refreshed, refresh]);

  if (!state || !tile) {
    return (
      <View style={[s.screen, { padding: 24, gap: 12, justifyContent: "center", alignItems: "center" }]}>
        {refreshed ? <Text style={[type.body, { color: c.muted, textAlign: "center" }]}>That isn’t on your board yet. Scan your documents first.</Text> : <ActivityIndicator color={c.ink} />}
        <LinkButton label="Back" onPress={close} />
      </View>
    );
  }

  const t = tile;
  const meta = CAT[t.category];
  const verdict = state.reviews[t.id];
  const cartVerdict = state.reviews[`cart:${t.balanceIds[0]}`];
  const done = state.done.includes(t.id);
  const entry = state.ledger.find((l) => l.tileId === t.id);
  const actionable = t.live && t.action.kind !== "none";
  const approved = verdict?.verdict === "approve";
  const worst = t.candidates.reduce((a, b) => (b.costToUser > a.costToUser ? b : a), t.candidates[0]);
  const best = t.candidates.find((x) => x.id === t.recommendation) ?? worst;
  const sources = allSources ? t.sources : t.sources.slice(0, 1);

  async function run() {
    setSheet(false); setError(""); setLines([]); setResult(null); setRunning(true);
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

  return (
    <View style={s.screen}>
      <View style={s.nav}>
        <CircleButton icon="chevron-left" onPress={close} label="Back" />
      </View>

      <ScrollView ref={scroller} contentContainerStyle={[s.content, { paddingBottom: actionable && !done ? 120 + insets.bottom : 40 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <FadeIn style={{ gap: 14 }}>
          <Thumb category={t.category} size={56} />
          <Text style={type.title}>{shortTitle(t.title)}</Text>
          <Text style={type.small}>
            {meta.label} · Deadline {fmt(t.deadline)} · <Text style={t.daysLeft <= 30 && !done ? { color: c.rausch, fontWeight: "600" } : undefined}>{t.daysLeft} days left</Text>
          </Text>
        </FadeIn>

        <Divider space={24} />

        <FadeIn delay={60} style={{ gap: 22 }}>
          {done && entry ? (
            <Highlight icon="check-circle-outline" tone="good" title={`Rescued ${usd(entry.amount)}`} text={`Confirmed · ${entry.confirmation}`} />
          ) : (
            <Highlight icon="lightbulb-on-outline" title={t.headline} />
          )}
          {verdict && actionable && (
            <Highlight
              icon={approved ? "shield-check-outline" : "shield-off-outline"}
              tone={approved ? undefined : "bad"}
              title={approved ? "Reviewer approved" : `Blocked by rule ${verdict.rule_cited}`}
              text={verdict.reason}
            />
          )}
          <Highlight icon="file-document-outline" title="From your documents" text="Every number here links to the line it came from." />
        </FadeIn>

        <Divider space={24} />

        <SectionTitle sub={t.candidates.length > 1 ? "What each choice costs you" : undefined}>Your options</SectionTitle>
        <View style={{ gap: 12 }}>
          {t.candidates.map((x) => {
            const rec = x.id === t.recommendation;
            return (
              <View key={x.id} style={[s.option, rec && s.optionRec]}>
                <View style={{ flex: 1, gap: 4 }}>
                  {rec && t.candidates.length > 1 && <Text style={s.recTag}>Recommended</Text>}
                  <Text style={type.h3}>{x.label}</Text>
                  <Text style={type.small}>{x.detail}</Text>
                </View>
                <Text style={[s.price, !rec && { color: c.muted }]}>{usd(x.costToUser)}</Text>
              </View>
            );
          })}
        </View>

        <Divider space={24} />

        <SectionTitle>Things to know</SectionTitle>
        <View style={{ gap: 22 }}>
          <Highlight icon="scale-balance" title="Tradeoff" text={t.tradeoff} />
          <Highlight icon="calendar-alert" title={`If you do nothing · ${usd(t.doNothingCost)}`} text={t.doNothing} />
        </View>

        {t.category === "fsa" && (
          <>
            <Divider space={24} />
            <SectionTitle sub="Try spending this balance. Expire refuses purchases you don’t need.">Try the Reviewer</SectionTitle>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -24 }}>
              <View style={{ width: 16 }} />
              {CART_PRESETS.map((p) => (
                <PressScale key={p} onPress={() => { setCart(p); checkCart(p); }} style={[s.pill, cart === p && s.pillOn]}>
                  <Text style={[type.small, { color: c.ink, fontWeight: cart === p ? "600" : "400" }]}>{p}</Text>
                </PressScale>
              ))}
              <View style={{ width: 16 }} />
            </ScrollView>
            <View style={s.inputRow}>
              <TextInput value={cart} onChangeText={setCart} style={s.input} placeholder="Items, comma separated" placeholderTextColor={c.muted} onSubmitEditing={() => checkCart()} returnKeyType="send" />
              <PrimaryButton label="Check" onPress={() => checkCart()} loading={checking} style={{ alignSelf: "stretch" }} />
            </View>
            {cartVerdict && (
              <Shake trigger={cartVerdict.at}>
                <CartVerdict v={cartVerdict} />
              </Shake>
            )}
          </>
        )}

        <Divider space={24} />

        <SectionTitle>Sources</SectionTitle>
        <View style={{ gap: 12 }}>
          {sources.map((sp, i) => <SourceView key={i} span={sp} docs={state.docs} />)}
        </View>
        {t.sources.length > 1 && (
          <View style={{ marginTop: 16 }}>
            <PressScale onPress={() => setAllSources((v) => !v)} style={s.outline}>
              <Text style={type.h3}>{allSources ? "Show less" : `Show all ${t.sources.length} sources`}</Text>
            </PressScale>
          </View>
        )}

        {error ? <Text style={{ color: c.bad, fontWeight: "600", textAlign: "center", marginTop: 16 }}>{error}</Text> : null}
      </ScrollView>

      {actionable && !done && (
        <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
              {worst.id !== best.id && <Text style={s.footStrike}>{usd(worst.costToUser)}</Text>}
              <Text style={s.footPrice}>{usd(best.costToUser)}</Text>
            </View>
            <Text style={s.footSave}>You save {usd(t.action.savings)}</Text>
          </View>
          <PrimaryButton
            label={approved ? (t.action.kind === "book_call" ? "Book" : "Send") : "Blocked"}
            disabled={!approved}
            onPress={() => { haptic.press(); setSheet(true); }}
          />
        </View>
      )}

      <ConfirmSheet tile={t} visible={sheet} onCancel={() => setSheet(false)} onConfirm={run} />
      {running && <ActionRun tile={t} lines={lines} result={result} onDone={() => { setRunning(false); close(); }} />}
    </View>
  );
}

function CartVerdict({ v }: { v: Verdict }) {
  const ok = v.verdict === "approve";
  return (
    <View style={[s.verdict, { borderColor: ok ? c.good : c.bad, backgroundColor: ok ? c.goodSoft : c.badSoft }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <MaterialCommunityIcons name={ok ? "shield-check-outline" : "shield-off-outline"} size={22} color={ok ? c.good : c.bad} />
        <Text style={[type.h3, { color: ok ? c.good : c.bad }]}>{ok ? "Approved" : `Declined · rule ${v.rule_cited ?? "?"}`}</Text>
      </View>
      <Text style={[type.body, { color: c.ink }]}>{v.reason}</Text>
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
    <FadeIn from={4} style={s.src}>
      <Text style={[type.tiny, { marginBottom: 6 }]}>{doc.name.replace(/\.txt$/, "")}</Text>
      <Text style={[type.small, { color: c.ink }]}>
        {doc.text.slice(lineStart, span.start)}
        <Text style={{ backgroundColor: c.mark, fontWeight: "600" }}>{doc.text.slice(span.start, span.end)}</Text>
        {doc.text.slice(span.end, lineEnd)}
      </Text>
    </FadeIn>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  nav: { position: "absolute", top: 14, left: 16, zIndex: 2 },
  content: { paddingHorizontal: 24, paddingTop: 64 },
  option: { flexDirection: "row", gap: 16, borderWidth: 1, borderColor: c.line, borderRadius: radius.md, padding: 16 },
  optionRec: { borderWidth: 2, borderColor: c.ink, padding: 15 },
  recTag: { fontSize: 12, fontWeight: "600", color: c.ink, backgroundColor: c.soft, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, overflow: "hidden" },
  price: { fontSize: 18, fontWeight: "600", color: c.ink, fontVariant: ["tabular-nums"] },
  pill: { borderWidth: 1, borderColor: c.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: "#fff" },
  pillOn: { borderColor: c.ink, backgroundColor: c.soft },
  inputRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  input: { flex: 1, borderWidth: 1, borderColor: c.line, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 13, fontSize: 16, color: c.ink },
  verdict: { borderWidth: 1, borderRadius: radius.md, padding: 16, gap: 8, marginTop: 14 },
  src: { borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, borderRadius: radius.md, padding: 14 },
  outline: { borderWidth: 1, borderColor: c.ink, borderRadius: radius.sm, paddingVertical: 13, alignItems: "center" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 16, backgroundColor: "#fff", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, paddingHorizontal: 24, paddingTop: 14 },
  footPrice: { fontSize: 18, fontWeight: "600", color: c.ink, fontVariant: ["tabular-nums"] },
  footStrike: { fontSize: 15, fontWeight: "400", color: c.muted, textDecorationLine: "line-through" },
  footSave: { fontSize: 14, color: c.ink, textDecorationLine: "underline", marginTop: 2 },
});
