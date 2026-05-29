// Daily-rotating launch quotes for the dashboard greeting card.
//
// Cycles through 20 hand-curated lines, picking one per UTC day. All users
// see the same quote on a given calendar day (good for shared screenshots /
// support — "did you see today's quote?").

export const LAUNCH_QUOTES = [
  "Every legendary token started with a single click.",
  "Liquidity flows where conviction grows.",
  "The chain rewards those who ship, not those who wait.",
  "Your next mint could change everything. Or nothing. Ship anyway.",
  "Memes today, blue chips tomorrow.",
  "On Solana, the only thing faster than your tx is your imagination.",
  "Most people overestimate a year. Underestimate the next 24 hours.",
  "Tokens are easy. Communities are everything.",
  "Code the launch. Let the market do the rest.",
  "A bad market for tokens is a great market for builders.",
  "If you can mint it, you can monetize it.",
  "The block doesn't care about your feelings. Ship clean.",
  "Speed wins. Atomic bundles win twice.",
  "Liquidity is opinion. Conviction is currency.",
  "First mover. First liquidity. First exit.",
  "What you ship today funds what you ship tomorrow.",
  "Solana ticks every 400ms. So should your decisions.",
  "Every good chart starts with someone hitting Launch.",
  "Markets don't reward sleep. They reward shipping.",
  "Distribution is destiny. Concentration is fragility.",
] as const;

/// Deterministic daily picker. Index is `floor(now / 86_400_000) mod LAUNCH_QUOTES.length`,
/// where the divisor is one day in ms. Same quote all day, different quote
/// each day, cycles through the full set in `LAUNCH_QUOTES.length` days.
///
/// Optional `seedDate` for testing — pass a `Date` to pick the quote for that day.
export function quoteOfTheDay(seedDate: Date = new Date()): string {
  const dayNum = Math.floor(seedDate.getTime() / 86_400_000);
  return LAUNCH_QUOTES[Math.abs(dayNum) % LAUNCH_QUOTES.length];
}

/// Greeting suffix based on the local time of day.
/// 5:00–11:59 → "morning", 12:00–17:59 → "afternoon", else "evening".
export function greetingFor(date: Date = new Date()): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return "Good morning.";
  if (h >= 12 && h < 18) return "Good afternoon.";
  return "Good evening.";
}
