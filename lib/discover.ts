import { z } from "zod";
import { claudeEnabled, searchStructured } from "./engine/claude";

// When you create your farmer, Ruth looks up the benefits that come with who you are: your
// employer's published benefits, your health plan's fitness reimbursement, your school's perks.
// Every fact she returns carries the page it came from and the words on that page, and you confirm
// it before anything is planted. What she can't source she leaves out; she never guesses a number.

export type Who = { employer?: string; jobType?: string; insurer?: string; healthPlan?: string; school?: string; homeState?: string };

import { FACTS, type FactKey, type Found } from "./findings";
export type { Found, FactKey };

export const FoundSchema = z.object({
  facts: z.array(z.object({
    key: z.enum(Object.keys(FACTS) as [FactKey, ...FactKey[]]),
    value: z.string().describe("the value: a plain number for amounts and percents, yes/no, or short text"),
    source: z.string().describe("URL of the page that states it"),
    quote: z.string().describe("the words on that page, copied exactly"),
  })),
  notes: z.array(z.string()).describe("Short notes on what couldn't be confirmed"),
});

export async function discover(w: Who): Promise<{ found: Found | null; searches: number }> {
  if (!claudeEnabled()) return { found: null, searches: 0 };
  const parts = [
    w.employer && `Employer: ${w.employer}${w.jobType ? ` (${w.jobType})` : ""}`,
    w.insurer && `Health insurance carrier: ${w.insurer}${w.healthPlan ? `, plan: ${w.healthPlan}` : ""}`,
    w.school && `School: ${w.school}`,
    w.homeState && `State: ${w.homeState}`,
  ].filter(Boolean);
  if (!parts.length) return { found: null, searches: 0 };
  const r = await searchStructured({
    system: `You research the employee and member benefits that come with a person's employer, health plan and school, for a benefits app. Prefer official pages (the employer's careers or benefits page, the carrier's member pages, the school's site); reputable reporting is acceptable when no official page exists. Report only facts you found on a page, each with its URL and an exact quote; leave out anything you can't source. Never estimate. Facts you can report:\n${Object.entries(FACTS).map(([k, v]) => `- ${k}: ${v}`).join("\n")}`,
    user: `Find the publicly documented benefits for this person.\n${parts.join("\n")}`,
    schema: FoundSchema, maxSearches: 8, effort: "medium",
  });
  if (!r.data) return { found: null, searches: r.searches };
  const facts: Found["facts"] = {};
  for (const f of r.data.facts) if (/^https?:\/\//.test(f.source) && f.value.trim() && !facts[f.key]) facts[f.key] = { value: f.value.trim(), source: f.source, quote: f.quote };
  return { found: { facts, notes: r.data.notes }, searches: r.searches };
}
