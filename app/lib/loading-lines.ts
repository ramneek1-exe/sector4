/** Owner-authored loading lines — one picked at random per query. Verbatim; do not edit copy. */
export const LOADING_LINES: readonly string[] = [
  "We are checking...",
  "Boxing for mediums...",
  "⚠️ Investigating the 'inchident'...",
  "Just got told it's a motor race. Now going car racing...",
  "Bwoahhh...",
  "Updating the words of wisdom...",
  "Changing the f*****g car...",
  "Getting my gloves and steering wheel...",
  "Calling the World Champion Hotline...",
  "Leaving the space for Fernando...",
  "Giving Ocon a +5s penalty...",
  "Asking Carlos for the pancake recipe...",
  "Playing Mariah Carayyy...",
  "Going up and down, side to side like a rollercoaster...",
  "Licking the stamp and sending it...",
];

export function pickLoadingLine(): string {
  return LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)];
}
