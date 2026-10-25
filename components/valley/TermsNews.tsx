"use client";

import { useEffect, useState } from "react";
import { LIBRARY } from "@/lib/library/catalog";
import s from "./TermsNews.module.css";
import { openOutside } from "@/lib/valley/popup";

// The Burrow Gazette: what each plan's source page says today about the credits and limits the
// library relies on (from the Benefit Terms Watcher actor on Apify, or the local fallback).
type Finding = { key: string; name: string; expected: number; seen: number | null; snippet: string; status: "same" | "changed" | "missing" };
type Page = { planId: string; url: string; fetchedAt: string; ok: boolean; title: string; findings: Finding[]; error?: string };
type Report = { ranAt: string | null; engine: "apify" | "local" | null; pages: Page[] };

const money = (n: number | null) => (n == null ? "not found" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
const planTitle = (id: string) => LIBRARY.find((p) => p.id === id)?.title ?? id;
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const ORDER = { changed: 0, missing: 1, same: 2 } as const;

export function TermsNews({ onClose }: { onClose: () => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { void fetch("/api/terms-watch").then((r) => r.json()).then(setReport).catch(() => setErr("Couldn't load the last report.")); }, []);

  async function checkNow() {
    setBusy(true); setErr("");
    try { setReport(await (await fetch("/api/terms-watch", { method: "POST" })).json()); }
    catch { setErr("The check didn't finish. Try again in a minute."); }
    finally { setBusy(false); }
  }

  const pages = report?.pages ?? [];
  const flagged = pages.flatMap((p) => p.findings).filter((f) => f.status !== "same").length;

  return (
    <div className="ev-dialogue-wrap">
      <div className={`ev-panel ev-dialogue ${s.panel}`}>
        <div className="ev-speaker">The Burrow Gazette</div>
        <div className={`ev-body ${s.body}`}>
          <p><b>What changed in your plans&apos; fine print</b></p>
          <p className="ev-sub">
            {report?.ranAt
              ? `Checked ${new Date(report.ranAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ${report.engine === "apify" ? "by our Apify actor" : "on our server"}: ${pages.length} pages, ${flagged} thing${flagged === 1 ? "" : "s"} to look at.`
              : report ? "No check yet. Press Check now to read each plan's source pages." : "Loading..."}
          </p>
          {err && <p className={s.changed}>{err}</p>}
          {pages.map((p) => (
            <section key={`${p.planId}|${p.url}`} className={s.page}>
              <div className={s.head}>
                <b>{planTitle(p.planId)}</b>
                <a href={p.url} target="_blank" rel="noreferrer" onClick={openOutside}>{host(p.url)} ↗</a>
              </div>
              {!p.ok && <p className={s.missing}>Couldn&apos;t read this page: {p.error}</p>}
              <ul className={s.rows}>
                {[...p.findings].sort((a, b) => ORDER[a.status] - ORDER[b.status]).map((f) => (
                  <li key={f.key} className={s[f.status]} title={f.snippet || undefined}>
                    <span>{f.name}</span>
                    <em>
                      {f.status === "same" && `still ${money(f.expected)}`}
                      {f.status === "changed" && `we have ${money(f.expected)}, page says ${money(f.seen)}`}
                      {f.status === "missing" && `${money(f.expected)} not mentioned`}
                    </em>
                    {f.status !== "same" && f.snippet && <q>{f.snippet}</q>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="ev-sub">We compare the amounts on each source page with our library. A flag means the page reads differently, not that your card changed; confirm with your issuer or plan.</p>
        </div>
        <div className="ev-actions">
          <button className="ev-btn" disabled={busy} onClick={() => void checkNow()}>{busy ? "Reading the fine print..." : "Check now"}</button>
          <button className="ev-btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
