import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { AppState, DispatchResult, Span, Verdict } from "../../../../lib/types";
import { api, usd } from "@/api";
import { useExpire } from "@/state";
import { c, CATEGORY } from "@/theme";

export default function TileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, setState, refresh } = useExpire();
  const tile = state?.tiles.find((t) => t.id === id);
  const [refreshed, setRefreshed] = useState(false);

  // Opened by deep link or with stale state: fetch once before deciding the tile doesn't exist.
  useEffect(() => {
    if (!tile && !refreshed) refresh().finally(() => setRefreshed(true));
  }, [tile, refreshed, refresh]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [result, setResult] = useState<DispatchResult | null>(null);
  const [error, setError] = useState("");
  const [cart, setCart] = useState("Sunscreen SPF 50, Aloe vera gel");

  if (!state || !tile) {
    return (
      <View style={[s.screen, s.content]}>
        <Text style={s.muted}>{refreshed ? "That tile isn't on your board. Scan your documents first." : "Loading…"}</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={s.close}>Back</Text></Pressable>
      </View>
    );
  }

  const verdict = state.reviews[tile.id];
  const cartVerdict = state.reviews[`cart:${tile.balanceIds[0]}`];
  const done = state.done.includes(tile.id);
  const rec = tile.candidates.find((x) => x.id === tile.recommendation);
  const actionable = tile.live && tile.action.kind !== "none";
  const canAct = actionable && verdict?.verdict === "approve" && !done && !busy;

  async function run() {
    setBusy(true); setError(""); setConfirming(false); setLines([]);
    try {
      const r = await api.dispatch(tile!.id);
      for (const line of r.result.transcript) {
        setLines((l) => [...l, line]);
        await new Promise((ok) => setTimeout(ok, 900));
      }
      setResult(r.result);
      setState(r.state);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function checkCart() {
    setBusy(true); setError("");
    try {
      const items = cart.split(",").map((x) => x.trim()).filter(Boolean);
      const r = await api.reviewCart(tile!.balanceIds[0], items);
      setState(r.state);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.topRow}>
        <Text style={s.muted}>{CATEGORY[tile.category]} · {tile.daysLeft} days left</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={s.close}>Done</Text></Pressable>
      </View>
      <Text style={s.headline}>{tile.headline}</Text>

      <Section title="Options">
        {tile.candidates.map((x) => {
          const isRec = x.id === tile.recommendation;
          return (
            <View key={x.id} style={[s.cand, isRec && s.candRec]}>
              <Text style={s.candCost}>{usd(x.costToUser)}</Text>
              <Text style={s.candLabel}>{x.label}{isRec ? " · recommended" : ""}</Text>
              <Text style={s.candDetail}>{x.detail}</Text>
            </View>
          );
        })}
      </Section>

      <Section title="Recommendation">
        <Text style={s.body}>{rec?.label}</Text>
        <Text style={s.k}>TRADEOFF</Text>
        <Text style={s.body}>{tile.tradeoff}</Text>
        <Text style={s.k}>DO-NOTHING COST · {usd(tile.doNothingCost)}</Text>
        <Text style={s.body}>{tile.doNothing}</Text>
      </Section>

      <Section title="Reviewer">
        {verdict && <VerdictBox v={verdict} />}

        {actionable && (done ? (
          <Text style={[s.body, { marginTop: 10 }]}>
            <Text style={{ fontWeight: "700" }}>Done.</Text> Ledger +{usd(tile.action.savings)} · {state.ledger.find((l) => l.tileId === tile.id)?.confirmation}
          </Text>
        ) : confirming ? (
          <View style={s.confirm}>
            <Text style={s.body}><Text style={{ fontWeight: "700" }}>Confirm before Expire acts: </Text>{tile.action.summary}. Nothing else will be said or paid.</Text>
            <View style={s.btnRow}>
              <Btn label="Yes, do it" onPress={run} />
              <Btn label="Cancel" secondary onPress={() => setConfirming(false)} />
            </View>
          </View>
        ) : (
          <Btn
            label={`${tile.action.kind === "book_call" ? "📞 Book it" : "Send transfer"} · saves ${usd(tile.action.savings)}`}
            disabled={!canAct}
            onPress={() => setConfirming(true)}
          />
        ))}

        {lines.length > 0 && (
          <View style={{ marginTop: 12, gap: 6 }}>
            <Text style={s.k}>{tile.action.kind === "book_call" ? "CALL" : "TRANSFER"} · {result ? result.integration.toUpperCase() : "IN PROGRESS"}</Text>
            {lines.map((l, i) => <Text key={i} style={s.line}>{l}</Text>)}
          </View>
        )}

        {tile.category === "fsa" && (
          <View style={{ marginTop: 14, gap: 8 }}>
            <Text style={s.k}>TRY A PURCHASE AGAINST THIS BALANCE</Text>
            <TextInput value={cart} onChangeText={setCart} style={s.input} accessibilityLabel="Cart items, comma separated" />
            <Btn label="Ask the Reviewer" dark disabled={busy} onPress={checkCart} />
            {cartVerdict && <VerdictBox v={cartVerdict} />}
          </View>
        )}
        {error ? <Text style={s.error}>{error}</Text> : null}
      </Section>

      <Section title="Where these numbers come from">
        {tile.sources.map((sp, i) => <SourceView key={i} span={sp} docs={state.docs} />)}
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title.toUpperCase()}</Text>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  );
}

function VerdictBox({ v }: { v: Verdict }) {
  const ok = v.verdict === "approve";
  return (
    <View style={[s.verdict, ok ? s.verdictOk : s.verdictNo]}>
      <Text style={[s.verdictText, { color: ok ? c.accent : c.bad }]}>
        {ok ? "Approved" : "Rejected"}{v.rule_cited ? ` · rule ${v.rule_cited}` : ""}: {v.reason}
      </Text>
      <Text style={[s.verdictSub, { color: ok ? c.accent : c.bad }]}>{v.engine === "claude" ? "Claude Reviewer + rule checks" : "Rule checks"}</Text>
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
    <View style={s.src}>
      <Text style={s.srcName}>{doc.name} · chars {span.start}–{span.end}</Text>
      <Text style={s.mono}>
        {doc.text.slice(lineStart, span.start)}
        <Text style={s.mark}>{doc.text.slice(span.start, span.end)}</Text>
        {doc.text.slice(span.end, lineEnd)}
      </Text>
    </View>
  );
}

function Btn({ label, onPress, disabled, secondary, dark }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; dark?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.btn, dark && { backgroundColor: c.ink }, secondary && s.btnSecondary, (pressed || disabled) && { opacity: disabled ? 0.4 : 0.7 }]}
    >
      <Text style={[s.btnText, secondary && { color: c.ink }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { padding: 16, paddingBottom: 60, gap: 12 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 8 },
  close: { fontSize: 17, fontWeight: "600", color: c.accent },
  muted: { color: c.muted, fontSize: 14 },
  headline: { fontSize: 26, fontWeight: "800", color: c.ink, letterSpacing: -0.3 },
  section: { backgroundColor: c.panel, borderRadius: 16, borderWidth: 1, borderColor: c.line, padding: 14 },
  sectionTitle: { fontSize: 12, color: c.muted, letterSpacing: 0.6, marginBottom: 10 },
  cand: { borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, gap: 2 },
  candRec: { borderWidth: 2, borderColor: c.accent },
  candCost: { fontSize: 26, fontWeight: "800", color: c.ink, fontVariant: ["tabular-nums"] },
  candLabel: { fontSize: 15, fontWeight: "600", color: c.ink },
  candDetail: { fontSize: 13, color: c.muted },
  k: { fontSize: 11, color: c.muted, letterSpacing: 0.6, marginTop: 4 },
  body: { fontSize: 15, color: c.ink },
  verdict: { borderRadius: 12, padding: 14 },
  verdictOk: { backgroundColor: c.goodBg },
  verdictNo: { backgroundColor: c.badBg, borderWidth: 2, borderColor: c.bad },
  verdictText: { fontSize: 18, fontWeight: "700" },
  verdictSub: { fontSize: 12, marginTop: 4, opacity: 0.8 },
  confirm: { borderWidth: 2, borderColor: c.ink, borderRadius: 12, padding: 12, marginTop: 10, gap: 10 },
  btnRow: { flexDirection: "row", gap: 10 },
  btn: { backgroundColor: c.accent, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, alignItems: "center", marginTop: 10, flexGrow: 1 },
  btnSecondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: c.line },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  line: { fontSize: 15, color: c.ink, backgroundColor: c.bg, borderRadius: 8, padding: 10, overflow: "hidden" },
  input: { borderWidth: 1, borderColor: c.line, borderRadius: 10, padding: 12, fontSize: 16, color: c.ink, backgroundColor: c.panel },
  error: { color: c.bad, fontWeight: "600", marginTop: 8 },
  src: { backgroundColor: c.bg, borderRadius: 10, padding: 10 },
  srcName: { fontSize: 12, color: c.muted, marginBottom: 4 },
  mono: { fontFamily: "Menlo", fontSize: 13, color: c.ink },
  mark: { backgroundColor: c.mark },
});
