import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { ScrollView, type ScrollViewInstance, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { DispatchResult, Tile } from "../../../lib/types";
import { usd } from "@/api";
import { DarkButton, Divider } from "@/components/ui";
import { FadeIn, Pop, useCountUp } from "@/ui/motion";
import { c, radius, type } from "@/ui/theme";

type Bubble = { who: "me" | "them" | "sys"; text: string };

function toBubble(line: string, to: string): Bubble {
  if (line.startsWith("Expire: ")) return { who: "me", text: line.slice(8) };
  if (to && line.startsWith(`${to}: `)) return { who: "them", text: line.slice(to.length + 2) };
  return { who: "sys", text: line };
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const fmt = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

// Live view of a booking call or transfer as a message thread, then a confirmation page.
export function ActionRun({ tile, lines, result, onDone }: { tile: Tile; lines: string[]; result: DispatchResult | null; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const scroller = useRef<ScrollViewInstance>(null);
  const call = tile.action.kind === "book_call";
  const p = tile.action.payload;
  const to = String(p.to ?? "");
  const finished = result?.status === "confirmed";
  const [seconds, setSeconds] = useState(0);

  useEffect(() => { scroller.current?.scrollToEnd({ animated: true }); }, [lines.length]);
  useEffect(() => {
    if (finished) return;
    const id = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [finished]);

  if (finished) return <Confirmation tile={tile} result={result!} onDone={onDone} />;

  return (
    <View style={[StyleSheet.absoluteFill, s.screen, { paddingTop: insets.top + 12 }]}>
      <View style={s.header}>
        <View style={s.avatar}><Text style={s.avatarText}>{call ? initials(to) : "$"}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={type.h3}>{call ? to : `Sending ${usd(Number(p.amount))}`}</Text>
          <Text style={type.small}>{call ? `Calling ${p.phone} · 0:${String(seconds).padStart(2, "0")}` : `via ${p.rail}`}</Text>
        </View>
        <View style={s.live}><View style={s.liveDot} /><Text style={[type.tiny, { color: c.ink }]}>Live</Text></View>
      </View>
      <Divider />
      <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={s.thread}>
        {lines.map((l, i) => {
          const b = toBubble(l, to);
          if (b.who === "sys") return <FadeIn key={i} from={4}><Text style={s.sys}>{b.text}</Text></FadeIn>;
          return (
            <FadeIn key={i} from={6} style={[s.msg, b.who === "me" ? s.me : s.them]}>
              <Text style={[type.tiny, { marginBottom: 2 }]}>{b.who === "me" ? "Expire" : to}</Text>
              <View style={[s.bubble, b.who === "me" ? s.bubbleMe : s.bubbleThem]}>
                <Text style={[type.body, b.who === "me" && { color: "#fff" }]}>{b.text}</Text>
              </View>
            </FadeIn>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Confirmation({ tile, result, onDone }: { tile: Tile; result: DispatchResult; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const call = tile.action.kind === "book_call";
  const p = tile.action.payload;
  const saved = useCountUp(tile.action.savings, 900);
  const rows: [string, string][] = call
    ? [
        ["Where", String(p.to)],
        ["When", `${fmt(String(p.date))}${p.nextYear ? ` and ${fmt(String(p.nextDate))}` : ""}`],
        ["Confirmation", result.confirmation],
        ["Placed by", result.integration],
      ]
    : [
        ["Amount", usd(Number(p.amount))],
        ["To", String(p.to)],
        ["Transaction", result.confirmation],
        ["Rail", result.integration],
      ];
  return (
    <View style={[StyleSheet.absoluteFill, s.screen, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 16, paddingHorizontal: 24 }]}>
      <Pop><MaterialCommunityIcons name="check-circle" size={56} color={c.good} /></Pop>
      <FadeIn delay={120} style={{ gap: 6, marginTop: 16 }}>
        <Text style={type.hero}>{call ? "You’re booked" : "Transfer sent"}</Text>
        <Text style={[type.body, { color: c.muted }]}>{tile.action.summary}.</Text>
      </FadeIn>
      <FadeIn delay={220} style={s.card}>
        {rows.map(([k, v], i) => (
          <View key={k}>
            {i > 0 && <Divider />}
            <View style={s.row}>
              <Text style={[type.small, { width: 110 }]}>{k}</Text>
              <Text style={[type.body, { flex: 1, textAlign: "right" }]}>{v}</Text>
            </View>
          </View>
        ))}
        <Divider />
        <View style={s.row}>
          <Text style={[type.h3, { flex: 1 }]}>Added to rescued</Text>
          <Text style={[type.h3, type.money, { color: c.good }]}>+{usd(saved)}</Text>
        </View>
      </FadeIn>
      <View style={{ flex: 1 }} />
      <DarkButton label="Done" onPress={onDone} />
    </View>
  );
}

const s = StyleSheet.create({
  // Above the tile screen's floating back button.
  screen: { backgroundColor: "#fff", zIndex: 10, elevation: 10 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingBottom: 14 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.ink, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  live: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: c.line, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.rausch },
  thread: { padding: 20, gap: 14 },
  sys: { ...type.tiny, textAlign: "center" },
  msg: { maxWidth: "85%" },
  me: { alignSelf: "flex-end", alignItems: "flex-end" },
  them: { alignSelf: "flex-start" },
  bubble: { borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMe: { backgroundColor: c.ink, borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: c.soft, borderBottomLeftRadius: 4 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, borderRadius: radius.lg, paddingHorizontal: 16, marginTop: 28 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
});
