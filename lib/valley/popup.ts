import type React from "react";

// Open outside links in a separate window so the game tab never navigates away (some embedded
// browsers ignore target="_blank"). Falls back to a normal new tab if popups are blocked.
export function openOutside(e: React.MouseEvent<HTMLAnchorElement>) {
  const url = e.currentTarget.href;
  e.preventDefault();
  // No "noopener" in the features: with it, window.open always returns null and we'd open twice.
  const w = window.open(url, "_blank", "popup,width=1180,height=860");
  if (w) w.opener = null;
  else window.open(url, "_blank", "noopener,noreferrer");
}
