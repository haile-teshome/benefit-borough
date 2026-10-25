import type { Outfit } from "./pixel/animals";

// The valley's residents: villagers who stand and chat in town, two who wander, and a keeper in
// every shop. Their small talk is about the same deadlines the farm is about.

export type Npc = {
  id: string; name: string; species: string; x: number; z: number; outfit: Outfit;
  talk: string[]; // what they say when you press E
  route?: [number, number][]; // wanderers loop through these points
};

export const NPCS: Npc[] = [
  { id: "okafor", name: "Dr. Okafor", species: "bear", x: -23.7, z: -1.3, outfit: { body: "#F4F4F0", badge: "#4AA3E0" },
    talk: ["If a crown can wait a few weeks, January's fresh dental maximum pays for it.", "Same teeth, same work. Splitting the plan across years is just paperwork."] },
  { id: "nurse", name: "Nurse Pip", species: "rabbit", x: -22.1, z: -1.2, outfit: { body: "#F4F4F0", badge: "#E04848" },
    talk: ["Met your deductible? Then anything your doctor already ordered is cheapest before January 1.", "We never suggest new care just to use a balance. Ruth would have my ears."] },
  { id: "teller", name: "Teller Mo", species: "cat", x: 15.4, z: -1.2, outfit: { body: "#3FA66B", hat: "cap", hatColor: "#2F6E46" },
    talk: ["A first overdraft fee? Ask. We refund it more often than you'd think.", "Duplicate charge on your card? You have 60 days from the statement to dispute it."] },
  { id: "clerk", name: "Clerk Juno", species: "fox", x: 17.1, z: -1.2, outfit: { body: "#8E5BD0", hat: "cap", hatColor: "#5E3A99" },
    talk: ["Bought something that went on sale? Most stores match their own price for about two weeks.", "Store cards with deferred interest are sneaky. Pay the balance before the promo ends."] },
  { id: "chef", name: "Chef Bun", species: "rabbit", x: 19.2, z: -14.6, outfit: { body: "#FFFFFF", hat: "chef" },
    talk: ["Dining dollars don't roll over. December 14, poof.", "Too many dining dollars? Send them to a friend. Don't buy a hundred muffins."] },
  { id: "diner", name: "Moss", species: "deer", x: 20.8, z: -13.6, outfit: { scarf: "#3FA6A0" },
    talk: ["I almost let $200 of dining dollars expire last year.", "The Commons sells soup that tastes like a deadline. In a good way."] },
  { id: "bertie", name: "Old Bertie", species: "bear", x: 4.4, z: 2.75, outfit: { scarf: "#C9483A" },
    talk: ["Sit a spell. The fountain sparkles more at night.", "Ruth said no to me once. Sunscreen. She was right, I never burn."] },
  { id: "mayor", name: "Mayor Maple", species: "deer", x: 3.0, z: 3.4, outfit: { body: "#6A4C93", hat: "cap", hatColor: "#3A2357" },
    talk: ["Welcome to Expire Valley, where nothing good goes to waste.", "Open enrollment opens November 1 at the Benefits Office. Don't skip it."] },
  { id: "postman", name: "Postman Pete", species: "fox", x: 0, z: 6, outfit: { body: "#3E8ED0", hat: "cap", hatColor: "#2B5F8E" },
    talk: ["Letters for the farms! Somebody mailed dining dollars yesterday.", "If your letterbox flag is up, you've got mail."],
    route: [[0, 6], [0, 15.2], [-7, 15.6], [0, 15.6], [0, 6], [7, 1], [13, 1.2], [21, 1.2], [8, 0.6], [-8, 0.6], [-14, 1.2], [-20, 1.2], [-8, 0.8], [-2, 5]] },
  { id: "granny", name: "Granny Fern", species: "rabbit", x: -6, z: -5.5, outfit: { scarf: "#E07BB0" },
    talk: ["I feed the ducks at the pond every morning.", "Back in my day nobody read the benefits summary. Now look at you."],
    route: [[-6, -5.5], [-9.5, -9], [-12.6, -13], [-12.4, -15.6], [-12.6, -13], [-9.5, -9], [-6, -5.5], [-2.5, -3]] },
];

// Who says what to whom. "{player}" and "{rescued}" are filled in from the game.
export type Chat = { a: string; b: string; lines: [0 | 1, string][] };
export const CHATTER: Chat[] = [
  { a: "okafor", b: "nurse", lines: [[0, "Third patient this week who waited on crowns until January."], [1, "And paid double because the dental max reset?"], [0, "Split it across plan years. Same teeth, half the bill."]] },
  { a: "nurse", b: "okafor", lines: [[0, "Half the valley has met their deductible by now."], [1, "Then ordered imaging should happen before January 1."], [0, "I'll put it on the bulletin board."]] },
  { a: "teller", b: "clerk", lines: [[0, "Someone downgraded their Gold card inside the 30 days."], [1, "Full refund?"], [0, "Every cent. Most people never ask."]] },
  { a: "clerk", b: "teller", lines: [[0, "Target dropped the AirPods to $199.99 today."], [1, "Anyone who paid $249 has two weeks to ask for the difference."], [0, "I'll tell the next person in line."]] },
  { a: "chef", b: "diner", lines: [[0, "Dining dollars vanish December 14."], [1, "I've got way too many."], [0, "Send the extra to a friend. Don't eat it all in soup."]] },
  { a: "diner", b: "chef", lines: [[0, "Is the soup FSA eligible?"], [1, "Ha! Ask Ruth. Actually, don't."]] },
  { a: "bertie", b: "mayor", lines: [[0, "{player} has rescued {rescued} so far."], [1, "And Ruth checked every single harvest."], [0, "Good. Somebody should."]] },
  { a: "mayor", b: "bertie", lines: [[0, "Open enrollment opens November 1."], [1, "Skip it and there's no FSA next year, right?"], [0, "At most jobs, yes. Mark the calendar."]] },
  { a: "postman", b: "bertie", lines: [[0, "Morning, Bertie! Letters for the farms."], [1, "Anything good?"], [0, "Somebody mailed dining dollars to a friend."]] },
  { a: "postman", b: "mayor", lines: [[0, "Mayor! The Benefits Office wants its calendar back."], [1, "Tell them November 1 is circled twice."]] },
  { a: "postman", b: "teller", lines: [[0, "Statements for the Quarter."], [1, "Mind the duplicate charges in there."]] },
  { a: "postman", b: "nurse", lines: [[0, "Explanation of benefits for the clinic!"], [1, "Every EOB tells a story."]] },
  { a: "granny", b: "bertie", lines: [[0, "The ducks were hungry today."], [1, "So was I. The bakery takes dining dollars."]] },
  { a: "granny", b: "mayor", lines: [[0, "Mayor, the pond crystals are glowing again."], [1, "Valley magic. Don't tell the auditors."]] },
];

// The keeper behind each shop's counter, by building id.
export type Keeper = { name: string; species: string; outfit: Outfit; hello: string };
export const KEEPERS: Record<string, Keeper> = {
  pharmacy: { name: "Pharmacist Hazel", species: "deer", outfit: { body: "#F4F4F0", badge: "#3FA66B" }, hello: "Paid for prescriptions out of pocket? Your FSA can pay you back. Here's what I see for you." },
  clinic: { name: "Dr. Patel", species: "cat", outfit: { body: "#F4F4F0", badge: "#4AA3E0" }, hello: "Your deductible is met. Anything I've already ordered costs least before January 1." },
  dental: { name: "Hygienist Gus", species: "bear", outfit: { body: "#BFD9EC", badge: "#3E8ED0" }, hello: "Open wide! Kidding. Let's talk about your annual maximum instead." },
  bank: { name: "Banker Ivy", species: "cat", outfit: { body: "#2F6E46", hat: "cap", hatColor: "#1F4E31" }, hello: "Fees, bonuses, disputes, card perks: I read every line of your statements. Here's what's worth claiming." },
  store: { name: "Clerk Rosa", species: "fox", outfit: { body: "#8E5BD0" }, hello: "Price matches at the front, the travel desk is upstairs, and the store card has a deadline." },
  market: { name: "Farmer Fen", species: "cow", outfit: { body: "#3FA66B" }, hello: "Nothing expiring in here except the bananas. Fresh every morning." },
  commons: { name: "Cook Dot", species: "rabbit", outfit: { body: "#FFFFFF", hat: "chef" }, hello: "Dining dollars expire December 14. Let's make sure none of yours do." },
  hall: { name: "Clerk Otto", species: "bear", outfit: { body: "#3E6E9E", hat: "cap", hatColor: "#2B4E73" }, hello: "Open enrollment runs November 1 to 21. Policies renew around then too." },
  library: { name: "Librarian Wren", species: "cat", outfit: { body: "#2F6E46", glasses: true }, hello: "Reading your benefits summary is a superpower. We have it in large print." },
  bakery: { name: "Baker Rye", species: "bear", outfit: { body: "#FFFFFF", hat: "chef" }, hello: "Fresh bread, and yes, we take dining dollars." },
  florist: { name: "Florist Lila", species: "rabbit", outfit: { body: "#E07BB0" }, hello: "Marigolds are in season. They remind me of mileage, somehow." },
  cottage1: { name: "Rosie", species: "shiba", outfit: { scarf: "#D8574A" }, hello: "Come in! Cinnamon rolls are almost ready." },
  cottage2: { name: "Willow", species: "husky", outfit: { scarf: "#3FA6A0" }, hello: "Hear the wind chimes? They ring when someone saves money. Probably." },
  cottage3: { name: "Maple", species: "cat", outfit: { scarf: "#D8743E" }, hello: "Shh, the cat's napping. The other cat." },
  inn: { name: "Innkeeper Sol", species: "alpaca", outfit: { scarf: "#6A4C93" }, hello: "Rooms by the night, no resort fees. Ever." },
};
