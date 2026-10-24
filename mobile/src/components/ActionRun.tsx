import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef } from "react";
import { ScrollView, type ScrollViewInstance, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { DispatchResult, Tile } from "../../../lib/types";
import { usd } from "@/api";
import { FadeIn, Pop, PressScale, Pulse, useCountUp } from "@/ui/motion";
import { c, radius, type } from "@/ui/theme";

type Bubble = { who: "me" | "them" | "sys"; text: string };

function toBubble(line: string, to: string): Bubble {
  if (line.startsWith("Expire: ")) return { who: "me", text: line.slice(8) };
  if (to && line.startsWith(`${to}: `)) return { who: "them", text: line.slice(to.length + 2) };
  return { who: "sys", text: line };
}

// Full-screen live view of a booking call or transfer, then the success state.
export function ActionRun({ tile, lines, result, onDone }: { tile: Tile; lines: string[]; result: DispatchResult | null; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const scroller = useRef<ScrollViewInstance>(null);
  const call = tile.action.kind === "book_call";
  const to = String(tile.action.payload.to ?? "");
  const finished = result?.status === "confirmed";
  const saved = useCountUp(finished ? tile.action.savings : 0, 1100);

  useEffect(() => { scroller.current?.scrollToEnd({ animated: true }); }, [lines.length]);

  return (
    <LinearGradient colors={[c.hero1, c.hero2]} style={[StyleSheet.absoluteFill, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}>
      <View style={s.head}>
        {finished ? (
          <Pop>
            <View style={[s.avatar, { backgroundColor: c.mint }]}>
              <MaterialCommunityIcons name="check-bold" size={44} color={c.hero1} />
            </View>
          </Pop>
        ) : (
          <View style={{ alignItems: "center", justifyContent: "center" }}>
            <Pulse color={c.mint} size={96} />
            <View style={s.avatar}>
              <MaterialCommunityIcons name={call ? "phone-in-talk" : "swap-horizontal-bold"} size={40} color="#fff" />
            </View>
          </View>
        )}
        <Text style={s.who}>{finished ? (call ? "Booked" : "Sent") : call ? to : `Sending ${usd(Number(tile.action.payload.amount))}`}</Text>
        <Text style={s.status}>
          {finished ? `${result!.integration} · ${result!.confirmation}` : call ? `Calling ${tile.action.payload.phone}…` : `via ${tile.action.payload.rail}…`}
        </Text>
      </View>

      <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={s.bubbles}>
        {lines.map((l, i) => {
          const b = toBubble(l, to);
          return (
            <FadeIn key={i} from={10} style={[s.bubble, b.who === "me" ? s.me : b.who === "them" ? s.them : s.sys]}>
              {b.who !== "sys" && <Text style={s.speaker}>{b.who === "me" ? "Expire" : to}</Text>}
              <Text style={[s.text, b.who === "sys" && { color: "rgba(255,255,255,0.6)", textAlign: "center", fontSize: 13 }]}>{b.text}</Text>
            </FadeIn>
          );
        })}
      </ScrollView>

      {finished && (
        <FadeIn style={s.footer}>
          <Text style={s.savedK}>Added to your rescued total</Text>
          <Text style={s.saved}>+{usd(saved)}</Text>
          <PressScale onPress={onDone} style={s.done} accessibilityRole="button">
            <Text style={s.doneText}>Back to board</Text>
          </PressScale>
        </FadeIn>
      )}
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  head: { alignItems: "center", gap: 8, paddingHorizontal: 20 },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  who: { ...type.h1, color: "#fff", marginTop: 12, textAlign: "center" },
  status: { color: "rgba(255,255,255,0.65)", fontSize: 14, textAlign: "center" },
  bubbles: { padding: 20, gap: 10 },
  bubble: { maxWidth: "86%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  me: { alignSelf: "flex-end", backgroundColor: c.accent, borderBottomRightRadius: 6 },
  them: { alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.12)", borderBottomLeftRadius: 6 },
  sys: { alignSelf: "center", backgroundColor: "transparent" },
  speaker: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.6)", marginBottom: 2 },
  text: { color: "#fff", fontSize: 15, lineHeight: 21 },
  footer: { paddingHorizontal: 20, alignItems: "center", gap: 4 },
  savedK: { ...type.label, color: "rgba(255,255,255,0.6)" },
  saved: { ...type.display, color: c.mint },
  done: { marginTop: 12, backgroundColor: "#fff", borderRadius: radius.md, paddingVertical: 16, alignItems: "center", alignSelf: "stretch" },
  doneText: { color: c.hero1, fontWeight: "800", fontSize: 17 },
});
