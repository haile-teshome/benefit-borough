import type React from "react";

// Tiny 12x12 pixel-art icons for shop items and the phone, drawn as SVG so they stay crisp at any
// size and match the burrow's art. Each letter is a palette color; "." is transparent.

const PAL: Record<string, string> = {
  k: "#3b2412", w: "#fffaf0", "+": "#ffffff", r: "#e2574c", o: "#f08a3c", y: "#f2c94c", g: "#3fa66b", G: "#2f6e46",
  b: "#3e8ed0", p: "#f49ac8", u: "#8e5bd0", v: "#5e3a99", t: "#3fa6a0", n: "#8a4f22", s: "#b8b0a8", d: "#4a4458", c: "#f3e3c3",
};

const SHAPES: Record<string, string[]> = {
  bottle: ["....kkkk....", "....kssk....", "...kkkkkk...", "...kt+ttk...", "...kt+ttk...", "...kttttk...", "...kwwwwk...", "...kwwwwk...", "...kttttk...", "...kt+ttk...", "...kttttk...", "....kkkk...."],
  roller: ["............", "............", "..kkkkkkkk..", ".kuuuuuuuuk.", "ku+u+u+u+uuk", "kuuuuuuuuuuk", "kuuuuuuuuuuk", "kvvvvvvvvvvk", ".kvvvvvvvvk.", "..kkkkkkkk..", "............", "............"],
  shoe: ["............", "............", "......kkk...", ".....krrrk..", "....krrwrk..", "..kkrrrrrk..", ".krrrrrrrrk.", "krrr+rrrrrk.", "krrrrrrrrrrk", "kwwwwwwwwwwk", ".kkkkkkkkkk.", "............"],
  headphones: ["...kkkkkk...", "..kddddddk..", ".kd......dk.", ".kd......dk.", "kd........dk", "kd........dk", "kkkk....kkkk", "kppk....kppk", "kp+k....kp+k", "kppk....kppk", "kkkk....kkkk", "............"],
  chair: ["...kkkkkk...", "..kbbbbbbk..", "..kb+bbbbk..", "..kbbbbbbk..", "..kbbbbbbk..", "..kkkkkkkk..", ".kbbbbbbbbk.", ".kkkkkkkkkk.", ".....kk.....", "....kddk....", "..kkdkkdkk..", "..k......k.."],
  glasses: ["............", "............", "............", "kkkkk..kkkkk", "kt+tkkkkt+tk", "ktttk..ktttk", "ktttk..ktttk", "kkkkk..kkkkk", "............", "............", "............", "............"],
  tube: ["....kkkk....", "....kddk....", "...kkkkkk...", "...kyyyyk...", "...ky+yyk...", "...koooook..", "...kowwok...", "...kooook...", "...kyyyyk...", "...kyyyyk...", "..kyyyyyyk..", "..kkkkkkkk.."],
  kit: ["............", "....kkkk....", "....k..k....", ".kkkkkkkkkk.", ".kwwwwwwwwk.", ".kwwwrrwwwk.", ".kwwrrrrwwk.", ".kwwrrrrwwk.", ".kwwwrrwwwk.", ".kwwwwwwwwk.", ".kkkkkkkkkk.", "............"],
  pill: ["............", "............", "............", "..kkkkkkkk..", ".krrrrkwwwk.", "kr+rrrkwwwwk", "krrrrrkwwwwk", ".krrrrkwwwk.", "..kkkkkkkk..", "............", "............", "............"],
  thermometer: [".....kk.....", "....kwwk....", "....kwwk....", "....kwrk....", "....kwrk....", "....kwrk....", "....kwrk....", "...kkrrkk...", "...krrrrk...", "...kr+rrk...", "...krrrrk...", "....kkkk...."],
  heart: ["............", "..kkk..kkk..", ".krrrkkrrrk.", "kr+rrrrrrrrk", "krrrrrrrrrrk", "krrrrrrrrrrk", ".krrrrrrrrk.", "..krrrrrrk..", "...krrrrk...", "....krrk....", ".....kk.....", "............"],
  dumbbell: ["............", "............", "............", ".kk......kk.", "kddk....kddk", "kddkkkkkkddk", "kddssssssddk", "kddkkkkkkddk", "kddk....kddk", ".kk......kk.", "............", "............"],
  tooth: ["............", "..kkk..kkk..", ".kwwwkkwwwk.", "kw+wwwwwwwwk", "kwwwwwwwwwwk", "kwwwwwwwwwwk", ".kwwwwwwwwk.", ".kwwwkkwwwk.", ".kwwk..kwwk.", ".kwk....kwk.", "..k......k..", "............"],
  bag: ["............", "....kkkk....", "...k....k...", "..kkkkkkkk..", "..kppppppk..", "..kp+ppppk..", "..kppppppk..", "..kppwwppk..", "..kppppppk..", "..kppppppk..", "..kkkkkkkk..", "............"],
  cup: ["............", "...s..s..s..", "....s..s....", "..kkkkkkkk..", "..knnnnnnk..", "..kcc+ccck..", "..kcccccck..", "..kcccccck..", "...kcccck...", "....kkkk....", "..kkkkkkkk..", "............"],
  book: ["............", "..kkkkkkkk..", "..kbbbbbbwk.", "..kb+bbbbwk.", "..kbbyybbwk.", "..kbbbbbbwk.", "..kbbbbbbwk.", "..kbbbbbbwk.", "..kbbbbbbwk.", "..kkkkkkkkk.", "............", "............"],
  laptop: ["............", "..kkkkkkkk..", "..kttttttk..", "..kt+ttttk..", "..kttttttk..", "..kttttttk..", "..kkkkkkkk..", ".ksssssssssk", "kssssssssssk", "kkkkkkkkkkkk", "............", "............"],
  gift: ["............", "...k....k...", "....k..k....", ".kkkkkkkkkk.", ".kyyyrryyyk.", ".kkkkkkkkkk.", "..kyyrryyk..", "..ky+rryyk..", "..kyyrryyk..", "..kyyrryyk..", "..kkkkkkkk..", "............"],
  phone: ["..kkkkkkkk..", ".kp+ppppppk.", "kppkkkkkkppk", "kkk.kppk.kkk", "...kppppk...", "..kppppppk..", ".kppkppkppk.", ".kprppppprk.", ".kpppkkpppk.", ".kppppppppk.", "..kkkkkkkk..", "............"],
};

// Palette swaps so one shape can be many items.
const VARIANTS: Record<string, [string, Record<string, string>]> = {
  mat: ["roller", { u: PAL.g, v: PAL.G }],
  pad: ["kit", { r: PAL.o }],
  tv: ["laptop", { t: PAL.d }],
  food: ["bag", { p: PAL.n }],
  groceries: ["bag", { p: PAL.g }],
  suitcase: ["bag", { p: PAL.b }],
};

// Pick an icon from what the item is.
const RULES: [RegExp, string][] = [
  [/bottle|flask|tumbler/i, "bottle"], [/foam roller|roller/i, "roller"], [/yoga|mat\b/i, "mat"], [/shoe|sneaker|running/i, "shoe"],
  [/headphone|earbud|airpod/i, "headphones"], [/chair|desk/i, "chair"], [/glasses|lens|eye|vision|optical/i, "glasses"],
  [/sunscreen|spf|lotion|cream|gel/i, "tube"], [/first aid|bandage|brace|knee/i, "kit"], [/heating pad|heat/i, "pad"],
  [/allergy|medicine|pill|tablet|vitamin|ibuprofen/i, "pill"], [/thermometer/i, "thermometer"], [/blood pressure|oximeter|pulse|heart/i, "heart"],
  [/gym|dumbbell|weight|fitness/i, "dumbbell"], [/tooth|dental|floss|night guard/i, "tooth"], [/coffee|pastr|latte/i, "cup"],
  [/book|textbook|course|class|language|exam|certification/i, "book"], [/laptop|computer|macbook|ipad/i, "laptop"],
  [/stream|tv|disney|netflix/i, "tv"], [/uber|eats|dinner|food|takeout/i, "food"], [/grocer|market/i, "groceries"],
  [/bag fee|luggage|suitcase|flight|airline/i, "suitcase"], [/saks|lululemon|gift|clothing|leggings/i, "bag"],
];
export const iconFor = (text: string) => RULES.find(([re]) => re.test(text))?.[1] ?? "gift";

export function PixelIcon({ name, size = 48, className }: { name: string; size?: number; className?: string }) {
  const [shape, swap] = VARIANTS[name] ?? [name, {}];
  const rows = SHAPES[shape] ?? SHAPES.gift;
  const cells: React.ReactElement[] = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const fill = swap[ch] ?? PAL[ch];
    if (fill) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={fill} />);
  }));
  return <svg className={className} width={size} height={size} viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden="true">{cells}</svg>;
}
