import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useMemo, useState } from "react";
import { Animated, PanResponder, Platform, StyleSheet, Text, View } from "react-native";
import { haptic } from "@/ui/motion";
import { c, radius } from "@/ui/theme";

const KNOB = 56;
const PAD = 4;
const native = Platform.OS !== "web";

// Slide the knob to the end to act. Releasing early springs back; nothing happens.
// Screen readers get a single "activate" action instead of the gesture.
export function SwipeToConfirm({ label, icon, onConfirm, disabled }: { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; onConfirm: () => void; disabled?: boolean }) {
  const [width, setWidth] = useState(0);
  const [x] = useState(() => new Animated.Value(0));
  const [armed, setArmed] = useState(false);
  const [fired, setFired] = useState(false);
  const max = Math.max(1, width - KNOB - PAD * 2);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled && !fired,
        onMoveShouldSetPanResponder: (_, g) => !disabled && !fired && Math.abs(g.dx) > 4,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => haptic.tap(),
        onPanResponderMove: (_, g) => {
          const v = Math.max(0, Math.min(max, g.dx));
          x.setValue(v);
          const near = v > max * 0.85;
          setArmed((a) => { if (near && !a) haptic.tap(); return near; });
        },
        onPanResponderRelease: (_, g) => {
          if (g.dx > max * 0.85) {
            setFired(true);
            haptic.success();
            Animated.timing(x, { toValue: max, duration: 120, useNativeDriver: native }).start(() => onConfirm());
          } else {
            setArmed(false);
            Animated.spring(x, { toValue: 0, useNativeDriver: native, bounciness: 10 }).start();
          }
        },
        onPanResponderTerminate: () => {
          setArmed(false);
          Animated.spring(x, { toValue: 0, useNativeDriver: native }).start();
        },
      }),
    [disabled, fired, max, onConfirm, x],
  );

  const fade = x.interpolate({ inputRange: [0, max * 0.6], outputRange: [1, 0], extrapolate: "clamp" });
  const fill = x.interpolate({ inputRange: [0, max], outputRange: [KNOB + PAD * 2, width || KNOB], extrapolate: "clamp" });

  return (
    <View
      style={s.track}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityHint="Slide right to confirm"
      accessibilityActions={[{ name: "activate", label: "Confirm" }]}
      onAccessibilityAction={() => { if (!disabled && !fired) { setFired(true); onConfirm(); } }}
    >
      <LinearGradient colors={disabled ? [c.line, c.line] : [c.rauschDeep, c.rauschEnd]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      <Animated.View style={[s.fill, { width: fill }]} />
      <Animated.View style={[s.labelWrap, { opacity: fade }]} pointerEvents="none">
        <Text style={s.label} numberOfLines={1}>{label}</Text>
        <MaterialCommunityIcons name="chevron-double-right" size={20} color="rgba(255,255,255,0.7)" />
      </Animated.View>
      <Animated.View {...responder.panHandlers} style={[s.knob, { transform: [{ translateX: x }] }]}>
        <MaterialCommunityIcons name={armed ? "check-bold" : icon} size={24} color={disabled ? c.muted : c.rauschDeep} />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  track: { height: KNOB + PAD * 2, borderRadius: radius.md, justifyContent: "center", overflow: "hidden" },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.14)", borderRadius: radius.md },
  labelWrap: { position: "absolute", left: KNOB + 20, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  label: { color: "#fff", fontSize: 16, fontWeight: "600", flexShrink: 1 },
  knob: { position: "absolute", left: PAD, width: KNOB, height: KNOB, borderRadius: radius.sm, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
});
