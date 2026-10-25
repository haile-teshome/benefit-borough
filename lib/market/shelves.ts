import type { Balance, Category } from "../types";

// What each shop stocks: things people really buy with benefits, by theme. Picking an item sends
// the Bazaar's agents to find the best one your unspent benefit covers. Ruth still reviews each
// offer, so an item a benefit doesn't cover (e.g. most electric toothbrushes) gets a clear no.

export type ShelfItem = { label: string; icon: string; need: string; covers: Category[]; match?: RegExp };

export const SHELVES: Record<string, ShelfItem[]> = {
  pharmacy: [
    { label: "Contact lens solution", icon: "👁️", need: "multi-purpose contact lens solution for soft lenses, with a case", covers: ["fsa", "hsa"] },
    { label: "Sunscreen SPF 50", icon: "🧴", need: "broad-spectrum SPF 50 sunscreen for daily use", covers: ["fsa", "hsa"] },
    { label: "First aid kit", icon: "🩹", need: "a well-stocked home first aid kit", covers: ["fsa", "hsa"] },
    { label: "Allergy relief", icon: "🤧", need: "24-hour non-drowsy allergy medicine, generic", covers: ["fsa", "hsa"] },
    { label: "Reading glasses", icon: "👓", need: "reading glasses +1.5 strength", covers: ["fsa", "hsa", "vision"] },
    { label: "Thermometer", icon: "🌡️", need: "a fast, accurate digital thermometer", covers: ["fsa", "hsa"] },
  ],
  clinic: [
    { label: "Blood pressure monitor", icon: "🩺", need: "an upper-arm blood pressure monitor, clinically validated", covers: ["fsa", "hsa"] },
    { label: "Knee brace", icon: "🦵", need: "a knee brace for running support", covers: ["fsa", "hsa"] },
    { label: "Heating pad", icon: "♨️", need: "an electric heating pad for back pain", covers: ["fsa", "hsa"] },
    { label: "Pulse oximeter", icon: "💓", need: "a fingertip pulse oximeter", covers: ["fsa", "hsa"] },
    { label: "Gym membership", icon: "🏋️", need: "a gym membership near me that my health plan's fitness reimbursement covers", covers: ["fitness", "stipend"] },
  ],
  dental: [
    { label: "Night guard", icon: "🦷", need: "a dental night guard for teeth grinding", covers: ["fsa", "hsa"] },
    { label: "Water flosser", icon: "💧", need: "a cordless water flosser", covers: ["fsa", "hsa"] },
    { label: "Electric toothbrush", icon: "🪥", need: "an electric toothbrush", covers: ["fsa", "hsa", "stipend"] },
  ],
  store: [
    { label: "Saks: something under the credit", icon: "🛍️", need: "a gift at Saks Fifth Avenue that fits within my Saks credit", covers: ["card_credit"], match: /saks/i },
    { label: "Uber Eats dinner", icon: "🥡", need: "an Uber Eats dinner order", covers: ["card_credit"], match: /uber/i },
    { label: "Streaming month", icon: "📺", need: "a month of a streaming service my digital entertainment credit covers", covers: ["card_credit"], match: /digital|entertainment|streaming/i },
    { label: "Checked bag fee", icon: "🧳", need: "an airline checked-bag fee on my next flight", covers: ["card_credit"], match: /airline|travel/i },
    { label: "lululemon", icon: "🧘", need: "lululemon workout gear within my lululemon credit", covers: ["card_credit"], match: /lululemon/i },
  ],
  market: [
    { label: "Yoga mat", icon: "🧘", need: "a durable non-slip yoga mat for home workouts", covers: ["stipend"] },
    { label: "Foam roller", icon: "🌀", need: "a foam roller for muscle recovery after running", covers: ["stipend"] },
    { label: "Running shoes", icon: "👟", need: "neutral running shoes for daily training", covers: ["stipend"] },
    { label: "Noise-cancelling headphones", icon: "🎧", need: "noise-cancelling headphones for working from home", covers: ["stipend"] },
    { label: "Desk chair", icon: "🪑", need: "an ergonomic home office chair", covers: ["stipend"] },
  ],
  commons: [
    { label: "Coffee and pastries", icon: "☕", need: "coffee and pastries on campus with my dining dollars", covers: ["dining"] },
    { label: "Campus market groceries", icon: "🥕", need: "groceries at the campus market that accept dining dollars", covers: ["dining"] },
  ],
  library: [
    { label: "Textbooks", icon: "📖", need: "the textbook for my class, cheapest new or rental", covers: ["stipend"] },
    { label: "Laptop for school", icon: "💻", need: "a reliable laptop for school and work under $900", covers: ["stipend"] },
    { label: "Certification exam", icon: "📝", need: "a professional certification exam voucher in my field", covers: ["stipend"] },
    { label: "Language course", icon: "🗣️", need: "a well-reviewed online language course", covers: ["stipend"] },
  ],
  hall: [
    { label: "Online course", icon: "🎓", need: "a well-reviewed online course to grow my career skills", covers: ["stipend"] },
    { label: "Professional books", icon: "📚", need: "the best recent book on my field, hardcover", covers: ["stipend"] },
    { label: "Standing desk", icon: "🖥️", need: "an electric standing desk for my home office", covers: ["stipend"] },
    { label: "Summer day camp", icon: "🏕️", need: "a summer day camp for my child (ages 6-10)", covers: ["dcfsa"] },
  ],
};

// The unspent benefit that would pay for this item: covered category (and merchant, for card
// credits), most money left first.
export function payerFor(item: ShelfItem, benefits: Balance[]): Balance | undefined {
  return benefits.filter((b) => item.covers.includes(b.category) && (!item.match || item.match.test(b.label))).sort((a, b) => b.amount - a.amount)[0];
}
