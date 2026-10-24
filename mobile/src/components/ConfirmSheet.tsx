import { useEffect, useState } from "react";
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Tile } from "../../../lib/types";
import { usd } from "@/api";
import { SwipeToConfirm } from "@/components/SwipeToConfirm";
import { Divider, LinkButton } from "@/components/ui";
import { c, radius, type } from "@/ui/theme";

const native = Platform.OS !== "web";

// Airbnb's "Confirm and pay" step: what will happen, a price breakdown with the $0 fee, then the swipe.
export function ConfirmSheet({ tile, visible, onCancel, onConfirm }: { tile: Tile; visible: boolean; onCancel: () => void; onConfirm: () => void }) {
  const insets = useSafeAreaInsets();
  const [y] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      y.setValue(0);
      Animated.timing(y, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start();
    }
  }, [visible, y]);

  const worst = tile.candidates.reduce((a, b) => (b.costToUser > a.costToUser ? b : a), tile.candidates[0]);
  const best = tile.candidates.find((x) => x.id === tile.recommendation) ?? worst;
  const call = tile.action.kind === "book_call";
  const verb = call ? "book" : "send";

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onCancel}>
      <Animated.View style={[s.backdrop, { opacity: y }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Cancel" />
      </Animated.View>
      <Animated.View style={[s.sheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [600, 0] }) }] }]}>
        <View style={s.grabber} />
        <Text style={type.h2}>{call ? "Confirm and book" : "Confirm and send"}</Text>

        <View style={{ gap: 4 }}>
          <Text style={type.h3}>What Expire will do</Text>
          <Text style={type.small}>{tile.action.summary}. Nothing else will be said or paid.</Text>
        </View>

        <Divider />

        <View style={{ gap: 12 }}>
          <Text style={type.h3}>Price details</Text>
          <Line label={worst.label} value={usd(worst.costToUser)} muted />
          <Line label={best.label} value={usd(best.costToUser)} />
          <Line label="Expire fee" value="$0.00" />
          <Divider />
          <Line label={call ? "You save" : "You rescue"} value={usd(tile.action.savings)} bold />
        </View>

        <Text style={type.tiny}>Expire never takes a cut of what it saves you, now or later.</Text>

        <SwipeToConfirm label={`Slide to ${verb}`} icon={call ? "phone" : "send"} onConfirm={onConfirm} />
        <View style={{ alignItems: "center" }}><LinkButton label="Cancel" onPress={onCancel} /></View>
      </Animated.View>
    </Modal>
  );
}

function Line({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <View style={s.line}>
      <Text style={[type.body, { flex: 1 }, muted && { color: c.muted }, bold && { fontWeight: "600" }]} numberOfLines={2}>{label}</Text>
      <Text style={[type.body, type.money, muted && { color: c.muted, textDecorationLine: "line-through" }, bold && { fontWeight: "600" }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "#fff", borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 24, paddingTop: 10, gap: 18 },
  grabber: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: c.line, marginBottom: 4 },
  line: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
});
