# /learn content cluster analysis

2026-07-26. SERP-overlap analysis of the 45-concept library, adapted from the
`claude-seo` cluster methodology. That skill is designed to plan *new* blog clusters;
this instead applies its SERP-overlap + hub-and-spoke rules to the content that already
exists, to answer three questions: are any pages competing with each other, is anything
orphaned, and is the structure right for how Google actually ranks these queries.

## 1. Cannibalization check — PASS, no action needed

Tested the highest-risk adjacent pairs by comparing live top-10 SERPs (shared-URL count
is the signal; the methodology's threshold is 7+ = merge, 4-6 = same cluster, 2-3 =
interlink, 0-1 = keep separate):

| Pair | Shared URLs in top 10 | Verdict |
|---|---|---|
| `dirty-air` vs `slipstream-tow` | 0 | Correctly separate |
| `tyre-degradation` vs `graining` | 1 | Correctly separate |

Google treats these as genuinely distinct queries, so splitting them across separate
pages is right. **No merges needed.** Same-domain-different-URL appearances (f1chronicle,
f1-fansite each rank separate glossary entries for both terms) further confirm the
atomized structure is viable in this niche.

## 2. Orphan pages — FAIL, 19 of 45 (42%)

Every concept carries a hand-authored `related` array (average 2.11 outbound links), but
these were never made reciprocal. 19 concepts have **zero inbound links** from any other
concept:

`marbles`, `sector-characteristics`, `slipstream-tow`, `dnf-reliability`, `graining`,
`tyre-allocation`, `fuel-corrected-pace`, `front-rear-wing`, `floor-diffuser`,
`wake-turbulence`, `track-limits`, `red-flag-restarts`, `time-penalties`, `parc-ferme`,
`formation-lap-start`, `sustainable-fuel`, `power-unit-allocation`, `brake-by-wire`,
`minimum-weight`

17 of the 19 came in with the 2026-07-26 expansion (PR #59): the new concepts link
*outward* to the established ones, but nothing was added pointing *back*. The result is a
one-directional graph where new pages are reachable only from the `/learn` index, not
from related content.

This matters beyond SEO link equity: a reader on `tyre-degradation` is never offered
`graining`, even though graining is the single most likely follow-up question.

**Recommended fix:** make `related` reciprocal, and top up thin cases so every concept has
≥2 inbound links. Data-only change to `concepts.json`, no code, low risk. The existing
`concepts.consistency.test.ts` can gain an orphan assertion to prevent regression.

## 3. Existing hubs (highest inbound links) — natural pillar candidates

| Concept | Inbound |
|---|---|
| `tyre-degradation` | 9 |
| `qualifying-vs-race-pace` | 9 |
| `dirty-air` | 7 |
| `stop-count-strategy` | 6 |
| `undercut-overcut` | 5 |
| `pit-lane-time-loss` | 5 |

The link graph already elects sensible hubs without anyone designing it — these are the
concepts the model and the narratives lean on most. Worth preserving deliberately rather
than by accident.

## 4. Strategic finding: don't try to out-glossary the glossaries

The SERPs for head terms (`F1 glossary`, `F1 terms explained`, `what is tyre degradation`)
are saturated with established explainer sites — GPFans, F1Chronicle, f1-fansite,
Safety Car Club, F1 History, Motorsport.com — and the pages that rank are **consolidated
2,000+ word "ultimate guides"** that bundle many concepts at once (e.g. *"F1 Tyre
Degradation Explained: The Ultimate Guide to F1 Tyre Wear & Strategy"* covers degradation,
graining, and blistering in one page).

Sector 4's concept pages are 210-285 words each. **They will not outrank those on head
terms**, and trying to win that fight by inflating every page into a 2,000-word guide
would be a poor use of effort and would work against the product's "read it in a minute"
premise.

**Where Sector 4 can actually win:** every concept carries a `whyItMatters` field tying it
to the live product — *"Sector 4's stop-count model leans on degradation measured in
Friday practice, where steeper deg points toward an extra stop."* No competing glossary
can write that sentence, because none of them run a model. That, plus concepts linked
inline from live prediction narratives, is a genuine differentiator rather than a
commodity glossary entry.

The implication for content strategy: compete on **specific long-tail + "why does this
matter for this weekend"** intent, not on head-term glossary queries.

## 5. Recommended actions, in priority order

1. **Fix the 19 orphans** (make `related` reciprocal + add an orphan guard to the
   consistency test). Cheap, data-only, fixes a real regression introduced by the
   expansion.
2. **Leave the page structure alone.** No merges, no consolidation into mega-guides.
   Cannibalization check passed; the atomized structure suits the niche and the product.
3. **Do not chase head-term glossary rankings.** Saturated by incumbents with far more
   authority and much longer pages. Lean on the product-linked angle instead.
4. Consider (later, optional) giving `/learn` real introductory prose rather than a bare
   card index — currently ~60 words of intro above the grid. Modest upside; not urgent.
