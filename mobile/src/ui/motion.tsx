import * as Haptics from "expo-haptics";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, type PressableProps, type StyleProp, StyleSheet, type ViewStyle } from "react-native";

// Layout keys that must sit on the outer Pressable so the button sizes within its parent.
const OUTER = ["flex", "flexGrow", "flexShrink", "flexBasis", "alignSelf", "width", "margin", "marginTop", "marginBottom", "marginLeft", "marginRight", "marginHorizontal", "marginVertical"] as const;

const native = Platform.OS !== "web";

export const haptic = {
  tap: () => { if (native) Haptics.selectionAsync().catch(() => {}); },
  press: () => { if (native) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); },
  success: () => { if (native) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); },
  error: () => { if (native) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}); },
};

// Fade + rise in on mount; `delay` staggers lists.
export function FadeIn({ children, delay = 0, from = 14, style }: { children: ReactNode; delay?: number; from?: number; style?: StyleProp<ViewStyle> }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 420, delay, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start();
  }, [delay, v]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

// Pressable that springs down on touch and gives a selection haptic.
export function PressScale({ children, style, onPress, disabled, scaleTo = 0.97, ...rest }: PressableProps & { style?: StyleProp<ViewStyle>; scaleTo?: number; children: ReactNode }) {
  const [s] = useState(() => new Animated.Value(1));
  const to = (v: number) => Animated.spring(s, { toValue: v, useNativeDriver: native, speed: 40, bounciness: v === 1 ? 8 : 0 }).start();
  const flat = { ...(StyleSheet.flatten(style) ?? {}) } as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  for (const k of OUTER) if (k in flat) { outer[k] = flat[k]; delete flat[k]; }
  return (
    <Pressable
      {...rest}
      style={outer as ViewStyle}
      disabled={disabled}
      onPressIn={() => to(scaleTo)}
      onPressOut={() => to(1)}
      onPress={(e) => { haptic.tap(); onPress?.(e); }}
    >
      <Animated.View style={[flat as ViewStyle, { transform: [{ scale: s }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

export function useCountUp(target: number, duration = 1000) {
  const [v] = useState(() => new Animated.Value(target));
  const [n, setN] = useState(target);
  useEffect(() => {
    const id = v.addListener(({ value }) => setN(Math.round(value)));
    Animated.timing(v, { toValue: target, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => v.removeListener(id);
  }, [target, duration, v]);
  return n;
}

// Animated width bar, 0..1.
export function Bar({ value, color, track, height = 8, delay = 0 }: { value: number; color: string; track: string; height?: number; delay?: number }) {
  const [w] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(w, { toValue: Math.max(0, Math.min(1, value)), duration: 800, delay, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [value, delay, w]);
  return (
    <Animated.View style={{ height, borderRadius: height, backgroundColor: track, overflow: "hidden" }}>
      <Animated.View style={{ height, borderRadius: height, backgroundColor: color, width: w.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }} />
    </Animated.View>
  );
}

// Horizontal shake, triggered whenever `trigger` changes.
export function Shake({ trigger, children }: { trigger: unknown; children: ReactNode }) {
  const [x] = useState(() => new Animated.Value(0));
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    Animated.sequence([10, -10, 7, -7, 3, 0].map((toValue) => Animated.timing(x, { toValue, duration: 55, useNativeDriver: native }))).start();
  }, [trigger, x]);
  return <Animated.View style={{ transform: [{ translateX: x }] }}>{children}</Animated.View>;
}

// Expanding ring behind an avatar, loops while mounted.
export function Pulse({ color, size }: { color: string; size: number }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: native }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: color,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
      }}
    />
  );
}

// Spring pop-in for success marks.
export function Pop({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.spring(v, { toValue: 1, delay, useNativeDriver: native, speed: 12, bounciness: 14 }).start();
  }, [delay, v]);
  return <Animated.View style={{ opacity: v, transform: [{ scale: v }] }}>{children}</Animated.View>;
}
