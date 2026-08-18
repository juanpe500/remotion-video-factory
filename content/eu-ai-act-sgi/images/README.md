# Images — eu-ai-act-sgi (Terminal style)

> **STATUS (2026-08-18): all 4 generated and verified compositing.** They are
> produced reproducibly, not hunted by hand — run:
>
> ```
> npx tsx scripts/generate-images.ts eu-ai-act-sgi
> ```
>
> The manifest `sources.json` in this folder drives it. Each job is either a
> live-web screenshot (`type: "url"`) or a local HTML mockup (`type: "html"`,
> files under `mockups/`). To tweak one, edit the manifest/mockup and re-run
> with the output filename as an extra arg, e.g. `... eu-ai-act-sgi step2-consent-example.jpg`.
>
> What each one ended up being:
> - `hook-eu-ai-act.jpg` — real screenshot of the Article 50 page
>   (artificialintelligenceact.eu/article/50).
> - `step1-label-example.jpg` — real screenshot of contentcredentials.org (C2PA).
> - `step2-consent-example.jpg` — custom HTML mockup (`mockups/consent-gate.html`).
> - `step3-log-example.jpg` — custom HTML mockup (`mockups/audit-log.html`).

The rest of this file is the original sourcing brief, kept for reference.

---

Files land at `public/eu-ai-act-sgi/images/<name>`.
`ImageBeats` in `Terminal.tsx` picks them up automatically the next time the
video renders. A beat with no file yet just stays empty; nothing breaks.

Spec for all of them: landscape, ~1200px+ wide, jpg or png. They render at
640px wide with a green border, so a clean legible screenshot matters more
than resolution.

## 1. `hook-eu-ai-act.jpg` — shows 0:02–0:22

**Search:** the actual EUR-Lex page for the EU AI Act, Article 50
(transparency obligations) — https://eur-lex.europa.eu, search "Regulation
(EU) 2024/1689 Article 50". Screenshot the article text itself (not the
homepage) — this is the actual legal text the whole video is about.

**Fallback if that's a pain to screenshot cleanly:** a photo of the EU
flags outside the European Parliament/Commission in Brussels. Less
specific but still on-topic.

## 2. `step1-label-example.jpg` — shows 0:25–0:32 (Step 1: labeling)

**Search:** "AI generated content label example" or "Content Credentials
C2PA icon" or a screenshot of ChatGPT/Midjourney/DALL-E output that shows
a visible "AI-generated" badge or watermark. Needs to visibly show a
disclosure label on AI output — that's the whole point of this step.

## 3. `step2-consent-example.jpg` — shows 0:32–0:40 (Step 2: consent)

**Search:** "app permission consent dialog screenshot" or "opt-in toggle
UI example" — any clean screenshot of an explicit consent gate (not a
pre-checked box — the script specifically calls that out).

## 4. `step3-log-example.jpg` — shows 0:40–0:47 (Step 3: generation log)

**Search:** "audit log dashboard screenshot" or "admin panel event log
table" — any SaaS admin/audit-log UI showing a table with timestamp/
user/action columns.

---

Once you've got these, tell me and I'll wire up an actual search/fetch
script so future videos don't need this manual round-trip.
