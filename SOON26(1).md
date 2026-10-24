# **Scope — Build Brief**

**Tagline:** Point at the problem. Get it fixed. Have someone over (similar to Uber)

**One-liner:** A phone-camera AI intake that turns a home problem into a standard, priceable job spec, then dispatches the nearest qualified pro. It starts with Mold Busters' virtual assessments, and each new trade is just a new JSON template.

**Context:** 48h hackathon (SOON, Oct 23–25). 

---

## **1\. Core loop (must work end to end)**

1. Homeowner taps **Scan a problem** on the phone.  
2. The intake agent guides the capture one shot at a time, using the trade template's `required_shots`.  
3. After each photo, a vision LLM checks it.  
   * Blurry or wrong subject: ask for a retake.  
   * Good: mark the shot as captured and ask for the next one.  
4. The agent asks 2–3 tap-to-answer questions from the template.  
5. The agent outputs a **JobSpec** with a confidence score.  
6. **Deterministic pricing** calculates the price from spec fields × the provider's rate card. The LLM never produces a price.  
7. **Matching** filters providers by trade and radius, then ranks them by rating and ETA.  
8. The spec appears in the **Pro dashboard** (laptop). The pro taps Accept, and the phone switches to an ETA screen. After the job, the homeowner rates it.  
9. **Fallbacks:**  
   * Confidence below 0.6: hand off to a human agent, with the spec attached.  
   * No provider in range: offer a Mold Busters virtual call.

## **2\. Stack**

* **Next.js (App Router) PWA**, one codebase with `/` (homeowner, mobile) and `/pro` (dashboard, laptop).  
* **Hosting:** Render. HTTPS is required for phone camera access. For local dev, use a `cloudflared` tunnel.  
* **DB:** Postgres via Prisma.  
* **Vision/agent:** Anthropic API (`claude-sonnet-5-5`, key in `ANTHROPIC_API_KEY`). Responses must be JSON-only, validated with zod.  
* **Realtime:** poll every 2s (acceptable for the demo) or use SSE. No websockets infra.  
* **Camera:** `<input type="file" accept="image/*" capture="environment">`, plus a `getUserMedia` live view if time allows.

## **3\. Data model**

Home(id, address, createdAt)  
Scan(id, homeId, trade, photos\[\] {shotId, url, ok}, answers json, status)  
JobSpec(id, scanId, trade, fields json, severity 1-5, areaM2, confidence, summary, priceLow, priceHigh)  
Provider(id, name, trades\[\], lat, lng, rating, rateCard json)  
Job(id, specId, providerId, status: pending\|accepted\|en\_route\|done\|handoff, eta)  
Rating(id, jobId, stars)

`Home` \+ its Scans/Jobs \= the **Home Record** shown on the home screen.

## **4\. Trade templates (`/templates/*.json`) — adding a trade \= adding a file**

Template has to have flexibility \- not all circumstances are the same (for instance not every wall will have two sides for the mold example. Also there should be an additional note section where uses can additional note)

{  
  "trade": "mold",  
  "required\_shots": \[  
    {"id":"wide\_room","prompt":"Step back and show the whole room"},  
    {"id":"closeup\_affected","prompt":"Get close to the affected spot"},  
    {"id":"ceiling\_above","prompt":"Now the ceiling above it"},  
    {"id":"adjacent\_wall","prompt":"Show the wall next to it"},  
    {"id":"likely\_water\_source","prompt":"Any window, pipe or vent nearby?"}  
  \],  
  "questions": \[  
    {"id":"duration","q":"How long has it been visible?","options":\["\< 1 week","1-4 weeks","Months"\]},  
    {"id":"smell","q":"Musty smell?","options":\["Yes","No"\]},  
    {"id":"leak","q":"Recent leak or flooding?","options":\["Yes","No","Not sure"\]}  
  \],  
  "outputs": \["affected\_area\_m2","severity","likely\_moisture\_source","recommended\_service"\]  
}

Ship `mold.json` (required) and `plumbing_sink.json` (second trade for the demo).

**Rate card example:** `{ "base": 150, "per_m2": 40, "severity_multiplier": [1,1,1.2,1.5,2] }`. Price range \= calculated price ±15%.

## **5\. AI policies (enforce in prompts and UI)**

* Never diagnose. The output wording is "visible growth likely, testing recommended."  
* Every quote is labelled "Estimate — confirmed by provider."  
* Blur faces and documents in photos before storing them (stretch goal; otherwise, show a capture tip telling users to avoid them).  
* Do not make false premises 

## **6\. UI — one action per screen**

**Style:**

* White background, near-black text (\#0A0A0A), one accent color (\#2F6BFF).  
* Inter font, large type, 16px rounded cards, generous whitespace.  
* One primary button per screen. No menus, no typing in the homeowner flow.

| Screen | Contents |
| ----- | ----- |
| Home | Large **Scan a problem** button; Home Record cards below |
| Scan | Full-screen camera, one line of AI guidance, 5 progress dots |
| Clarify | 2–3 questions as tappable chips |
| Spec | Issue title, severity bar, area, price range, **Book \[Provider\] · \[time\]** |
| Track | Provider card \+ ETA → 5-star rating when done |
| `/pro` | Queue of specs (photos, AI summary, confidence), **Accept** / **Ask for more** |

## **7\. Provider side (`/pro`, laptop)**

**User:** a provider company's dispatcher or technician (demo: Mold Busters). A hardcoded provider is selected via `?provider=<id>`, with no auth.

| View | Contents | Actions |
| ----- | ----- | ----- |
| **Queue** | Tabs: *New* · *Needs review* (low confidence / handoff) · *Active* · *Done*. Each card shows trade, severity, area, price range, distance, confidence badge, age | Click to open the spec |
| **Spec detail** | Photo grid labelled by shot, AI summary, extracted fields, answers, calculated price range, confidence | **Accept** · **Ask for more** · **Decline** |
| **Accept** | Pick a time slot (3 seeded options) and confirm the price (pre-filled with the calculated value, editable within the range) | Confirm → Job `accepted`, homeowner sees provider \+ ETA |
| **Connects with google calendar** |  |  |
| **Ask for more** | Pick missing shots/questions from the template, or add a free-text request | Send → homeowner's phone gets notification Scan for only those items; spec returns to *New* when done |
| **Active job** | Status stepper: accepted → en\_route → done | Advance status (drives the homeowner's Track screen) |
| **Needs review** | Handoff jobs with the full spec attached, acting as the "human agent" view | Accept, ask for more, or route to a Mold Busters virtual call |
| **Rate card** | Simple form editing `base`, `per_m2`, `severity_multiplier` for this provider | Save → new specs are priced with it (proves pricing is deterministic) |

