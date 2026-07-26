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

---
---

# Owner's launch plan (added 2026-07-26)

Channels the owner picked: portfolio site + footer link, a LinkedIn post, an IG story, and
direct outreach to F1 content creators. Drafts below.

## Sequencing — do it in this order

1. **Portfolio page + footer link.** Permanent, zero-risk, and it's the credibility layer
   everything else points back to.
2. **LinkedIn post.** Warm audience first.
3. **IG story.** Alongside.
4. **Creator outreach LAST.** Outreach with nothing behind it is weak; outreach that points
   at a live writeup is much stronger. It also means if someone shares it, there's already
   a narrative sitting there rather than a bare URL.

## Timing

Send the outreach **Friday evening or Saturday of a race weekend**, when `/weekend` is
showing live predictions rather than its between-races "still setting up our garage" state.
Landing a creator on the holding screen wastes the one impression you get.

The summer break before Zandvoort is good timing to *prepare*: F1 fans are starved for
content and engagement-per-post runs higher against thinner supply.

## Live numbers to pull before posting

`/accuracy` as of 2026-07-26: **3 races scored live, 67% top-3 hit rate, Brier 0.066**
(plus 7 pre-launch testing rounds, correctly not counted). These change every weekend —
**re-check before posting**, and never round them up.

---

## LinkedIn post

> I spent my summer building an F1 prediction site, and the most useful thing I did was
> try to prove it wouldn't work.
>
> Before building anything, I ran the validation: 2023–2025 race data, rolling-origin
> cross-validation (never random k-fold — a season is time-ordered, so that would leak),
> strict guards against using anything race-derived to predict that same race.
>
> The result was not what I wanted.
>
> Predicting the podium from practice telemetry does **not** beat just using grid position
> and championship standings. The fancy version loses to the boring baseline.
>
> One thing did survive: predicting **pit-stop count** from Friday practice tyre
> degradation genuinely beats a track-history baseline. That makes sense — deg → stop count
> is a fairly direct causal link, unlike the podium, which depends on a lot telemetry can't
> see.
>
> So I built the product around that instead of around a claim I couldn't support. Podium
> odds are presented as calibrated probabilities from public signals, not as a telemetry
> edge I don't have. The strategy call is where the model actually earns its place. And
> every prediction is scored against the real result on a public accuracy page — currently
> [X] races in at [Y]% top-3.
>
> The interesting engineering problem turned out not to be the model. It was building an
> interface that stays honest when the honest answer is "we don't know."
>
> [sector4.net]
>
> Stack: Next.js, Python/scikit-learn on Vercel, Claude for the natural-language layer.

**Notes:** LinkedIn suppresses reach on posts with outbound links — consider putting the
URL in the first comment and saying "link in comments." Fill in [X]/[Y] from `/accuracy`.
The hook is the negative result; don't bury it.

---

## Instagram story (3–4 frames)

Stories are visual and low-text. One idea per frame.

**Frame 1** — screenshot of the hero
> built an F1 site 🏎️

**Frame 2** — screenshot of `/weekend` podium odds
> honest podium odds
> (not "trust me bro" predictions)

**Frame 3** — screenshot of `/accuracy` with the chart
> every call gets scored
> against what actually happened
> [X] races in · [Y]% top-3

**Frame 4** — CTA
> sector4.net
> ↑ link sticker

**Notes:** Frame 3 is the differentiator — lead with it if you only post two frames. Use
the link sticker, not "link in bio." Take the screenshots on a race weekend so `/weekend`
shows real predictions.

---

## Creator DMs — tailor each, never send the same text to all three

A near-identical message to several creators reads as a mail-merge and gets ignored. The
shared principle: **lead with the finding, not the ask.** These people are pitched
constantly; a genuine technical result is far more interesting than "check out my site."

### Mar Antaya (LinkedIn)

> Hi Mar — built something I thought might interest you.
>
> I tested whether F1 practice telemetry actually predicts race outcomes better than public
> data. It mostly doesn't: FP pace gave no podium edge over grid position and championship
> standings. The one place it did win was predicting pit-stop count from Friday tyre deg.
>
> Rather than hide that, I built the site around it — podium odds shown as honest
> probabilities, and a public page scoring every call against the real result.
>
> Not asking for a share — genuinely curious whether the "telemetry doesn't beat the grid"
> result matches your read of the sport.
>
> [sector4.net]

### Ena Racing (Instagram)

Keep it shorter and less formal — IG DMs are a different register.

> hey! made a thing you might find fun — an F1 site that gives podium odds but is upfront
> about what it can't predict, and scores every call publicly after the race
>
> the bit I like: I tested whether practice data beats just looking at the grid, and it
> doesn't. built it around that instead of pretending otherwise
>
> sector4.net — no ask, just thought it was your kind of nerdy 🏎️

### Ruth Buscombe (optional — read the notes first)

> Hi Ruth — a question rather than a pitch, if you have a moment.
>
> I ran a validation study on 2023–25 F1 data testing whether practice long-run pace
> predicts the podium better than grid position and championship standings. It doesn't —
> the public baselines win. The only signal that beat its baseline was stop count predicted
> from Friday degradation.
>
> That result surprised me, and you'd know far better than I would: does "practice pace
> tells you much less about finishing order than it feels like it should" match what you saw
> doing this professionally?
>
> Context if useful: [sector4.net] — but the question stands on its own.

**Notes on the Buscombe outreach — read before sending:**

- **Not a stretch in principle.** She's ex-Ferrari/Haas/Sauber race strategy and a Sky F1
  pundit; stop-count strategy is precisely her specialism, and the finding is the kind of
  thing a strategist finds interesting rather than cringeworthy.
- **But expect no reply, for a reason that isn't about quality.** A working/former paddock
  strategist has professional reasons to avoid publicly engaging with a third-party
  *predictions* product. Silence is a category thing, not a verdict on the work. Don't read
  it as rejection and don't follow up twice.
- **The ask must be a question, never a share request.** The version above costs her 30
  seconds and flatters her expertise. "Please check out my site" does neither.
- **Send it last**, after the LinkedIn post exists, so there's something substantive behind
  the link.
