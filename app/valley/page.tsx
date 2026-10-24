"use client";

import dynamic from "next/dynamic";
import "./valley.css";

// three.js and the SpacetimeDB socket are browser-only.
const ValleyApp = dynamic(() => import("@/components/valley/Valley"), { ssr: false, loading: () => <div className="ev-loading">Loading Expire Valley…</div> });

export default function Page() {
  return <ValleyApp />;
}
