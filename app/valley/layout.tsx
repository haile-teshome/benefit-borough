import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Benefit Borough",
  description: "A cozy multiplayer farm where every benefit you're about to lose grows as a crop.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
