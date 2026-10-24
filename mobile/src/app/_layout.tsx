import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ExpireProvider } from "@/state";
import { c } from "@/ui/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ExpireProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="tile/[id]" options={{ presentation: "modal" }} />
        </Stack>
      </ExpireProvider>
    </SafeAreaProvider>
  );
}
