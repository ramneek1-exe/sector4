# Promotion copy drafts

Companion to `docs/promotion-strategy.md`. Drafts only — read them before posting, they're
starting points not final copy, and none of the bracketed `[...]` placeholders should ship
unfilled. I didn't hardcode current `/accuracy` numbers since they change every race
weekend; pull the live figures right before posting.

---

## Show HN (news.ycombinator.com)

**Title** (HN strips most formatting, keep it plain):

> Show HN: Sector 4 – An F1 predictor that shows its work, including where it's wrong

**Post body:**

> I built an explainer-led F1 prediction site. The interesting part isn't the
> predictions — it's what I found out validating them first.
>
> I ran a proper ML validation pass on 2023–2025 telemetry data before building
> anything: rolling-origin CV (never random k-fold, the season is time-ordered),
> leakage guards, the works. Result: predicting the podium from FP telemetry does
> **not** beat just using grid position / championship standings. It doesn't win.
>
> The one place telemetry *does* help: predicting **pit-stop count** (1 vs 2 stops)
> from Friday practice tyre degradation. That's a real, measured edge over a
> track-history baseline, and it's the one place the site leans on ML instead of
> public data.
>
> So instead of a fake-confident "predicted winner" tool, it's built around that
> honesty: podium odds are calibrated probabilities from public signals (standings,
> form, grid), strategy calls use the one validated telemetry signal, and everything
> links to a plain-English explanation of *why*. There's a live track record at
> [sector4.net/accuracy](https://sector4.net/accuracy) — this isn't a claim you have
> to take on faith, it's scored after every race.
>
> Stack: Next.js + a Python ML pipeline on Vercel, Claude for the natural-language
> layer (query parsing + grounded narrative generation, not free-floating chat).
>
> [sector4.net](https://sector4.net) — feedback very welcome, especially "this claim
> doesn't hold up" feedback, that's the whole point of `/accuracy` existing.

**Notes:** Don't resubmit if it flops the first time — one shot, HN penalizes repeat
self-submissions. Post on a weekday morning US time for best visibility. Be in the
comments to respond, especially to any "does the methodology actually hold up"
pushback — that's the crowd that will ask, and answering it well is worth more than
the post itself.

---

## r/F1Technical (verify current rules before posting — don't trust this blind)

**Title:**

> [OC] I validated whether F1 telemetry actually beats grid position for predicting the podium (it doesn't — but stop-count prediction does)

**Post body:**

> Built a small side project testing something I was curious about: does practice
> telemetry actually give you a predictive edge over just using grid position or
> championship standings for the podium? Ran it properly — rolling-origin
> cross-validation on 2023–2025 seasons (no random k-fold, the season's
> time-ordered so that would leak), leakage guards on anything race-derived.
>
> Findings, honestly reported either way:
> - Podium prediction from FP pace: **no edge** over grid/standings. Grid position
>   alone is a strong baseline and telemetry didn't beat it.
> - Pit-stop count (1 vs 2 stops) from FP tyre degradation: **real edge**, beats a
>   track-history norm. This tracks — degradation → stop count is a fairly direct
>   causal link, unlike podium which depends on a lot telemetry doesn't capture
>   (strategy calls, race incidents, etc).
>
> Turned it into a small site ([sector4.net](https://sector4.net)) that's upfront
> about this: podium odds are calibrated probabilities from public data, not a
> telemetry-driven "prediction," and strategy calls are the one place it actually
> uses the ML signal. There's a scored track record at `/accuracy` if anyone wants
> to sanity-check the calibration claim against reality.
>
> Curious if this matches others' intuition, or if I'm missing a feature that would
> actually move the podium-prediction needle.

**Notes:** This community skews toward people who'll actually engage with the
methodology — lead with the finding, not the product. If mod rules require
pre-approval for anything linking outside Reddit, message the mods first rather than
posting cold.

---

## X (Twitter) — pinned/launch post

> Spent a while validating whether F1 telemetry actually predicts race outcomes
> before building anything.
>
> Podium from practice pace? No edge over grid position. Told you so, not hiding it.
>
> Pit-stop count from tyre deg? Real edge. That's what the model actually leans on.
>
> Built [sector4.net] around being honest about which is which — odds as calibrated
> probabilities, not fake confidence, with a scored track record instead of a claim
> you have to trust.

**Notes:** Attach a screenshot of `/ask` with a real answer, or the `/accuracy` chart
once there are enough scored races to show the trend line (gated at ≥3 races per the
product's own honesty rule — don't screenshot the pre-chart state and imply there's a
trend yet).

---

## Bio / one-liner (reuse across profiles, directory listings, Product Hunt tagline)

> An F1 companion that's honest about what it knows — calibrated podium odds, real
> strategy signals, and a scored track record instead of a confident guess.
