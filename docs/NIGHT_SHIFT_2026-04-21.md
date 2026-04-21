# Night Shift — 2026-04-21

**Scope:** autonom von Claude gefahrene Nachtschicht. Vier Tasks, alle gruen.

| # | Task | Status | Code | Prod |
|---|---|---|---|---|
| T1 | Persistent Webhook-Retry-Queue (Koalatree) | ✅ | `12d974c` | deployed, smoke-getestet |
| T2 | Config-Health-Endpoint (Koalatree + Canzoia) | ✅ | KT `26322d1`, `937c3f0`, CZ `04d6501` | deployed, beide gruen |
| T3 | Profil-Signale Tabelle + REST-API (Canzoia) | ✅ | `5036f9a` | Migration angewandt, Endpoints live |
| T4 | Cross-Profil-Banner in Library (Canzoia) | ✅ | `73e4b9f` | deployed |

---

## T1 — Webhook-Retry-Queue

**Was:** `WebhookDelivery` Tabelle + `process-webhook-queue` Cron-Job (60s)
+ Exponential Backoff 30s/2m/10m/1h/6h/24h, 7 Versuche, dann `dead`.

**Call-Site-Contract unveraendert:** `deliverWebhookSafe(event)` ist immer noch
`void`, wirft nie. Unter der Haube INSERT in DB statt Sofort-POST.

**Progress-Events** bleiben fire-and-forget (stale within seconds, retry
sinnlos).

**Files:**
- `prisma/schema.prisma` — `WebhookDelivery` Model
- `lib/canzoia/webhook-queue.ts` — `enqueueWebhook`, `processPendingDeliveries`,
  `requeueDeadDelivery`
- `lib/canzoia/webhooks.ts` — delegiert an queue
- `app/api/cron/process-webhook-queue/route.ts` — Cron-Handler
- `vercel.json` — dritter Cron-Eintrag

**Smoke-Test:**
```
curl -H "Authorization: Bearer $CRON_SECRET" https://www.koalatree.ai/api/cron/process-webhook-queue
→ {"ok":true,"elapsedMs":95,"summary":{"scanned":0,"delivered":0,"retrying":0,"dead":0,"errors":[]}}
```

**Warum das wichtig war:** Am 2026-04-20 ging eine `generation.completed`
verloren, weil Canzoia HTTP 500 geworfen hat. Fire-and-forget + kein
Retry = Event weg + Episode nie in Library. Jetzt dauert's im Worst
Case 24h, aber es kommt an.

---

## T2 — Config-Health-Endpoint

**Was:** `GET /api/health/config` auf beiden Services. Gruppiert Env-Vars
nach Integrations-Bereich und meldet `set`/`missing`. Keine Werte, keine
Seiteneffekte. Bearer-`CRON_SECRET` gated.

**Finding beim ersten Smoke-Test (!):**
- Koalatree prod hatte **`CANZOIA_WEBHOOK_URL` gar nicht gesetzt**.
- Das ist der Grund, warum `enqueueWebhook` silently no-oped und
  `deliverWebhookSafe` nie einen Event-POST gesendet hat.
- **Autonome Entscheidung:** hab `CANZOIA_WEBHOOK_URL=https://canzoia.com/api/hooks/koalatree`
  gesetzt und redeployt. Health-Check seitdem gruen.

**Bonus-Note:** `NEXT_PUBLIC_APP_URL` auf Canzoia prod ist `missing`,
faellt zurueck auf `VERCEL_URL`. Funktional ok, aber wenn du Invite-
Links vereinheitlichen willst, waer das der Env-Knopf.

**Endpoints:**
- Koalatree: `https://www.koalatree.ai/api/health/config`
- Canzoia:   `https://canzoia.com/api/health/config`

**Proxy-Fix (Koalatree):** `proxy.ts` hat global Session-Gate auf
`/api/*`. Habe `/api/health` in die `publicPaths` aufgenommen, damit
der handler-interne CRON_SECRET-Check ueberhaupt erreicht wird.

---

## T3 — Profil-Signale

**Was:** Append-only Observations-Log pro `canzoia_profile`. Feeds
spaeter Generator-Prompts (Todo-Item: "Koalatree: Generator liest letzte
Signale in Prompt").

**Warum separate Tabelle statt JSONB:** append-only Audit, time-ordered
Reads, per-Row Weight + soft-delete. JSONB-Bag macht nix davon sauber.

**Schema (Highlights):**
- `kind` — `interest | preference | feedback | observation | milestone | dislike`
- `weight` 1..5
- `source` — `onboarding | feedback | chat | episode-reaction | system | manual | admin`
- `episode_id` — optional backlink
- `retired_at` — soft-delete; Generator filtert standardmaessig NULL
- RLS: select=members, insert/update=owner+editor, delete=owner (GDPR)

**API:**
- `POST /api/profile-signals` — create
- `GET  /api/profile-signals?profileId=X[&kind=Y&limit=N]` — list
- `PATCH /api/profile-signals/[id]` — retire/weight/value
- `DELETE /api/profile-signals/[id]` — hard-delete (owner)

Validation-Layer (`lib/canzoia-profiles/signals.ts`) haelt
kind/source-Whitelist aus der DB raus — DB bleibt frei-Text, Schema-
Migration fuer neue Kinds spart man sich.

**Open:** UI existiert noch nicht. Das ist das naechste natuerliche
Stueck (Signale im Profil-Dashboard anzeigen, Feedback nach Episode
auto-schreiben).

---

## T4 — Cross-Profil-Banner

**Was:** Wenn aktives Profil 0 Koalatree-Folgen hat, aber User Zugriff
auf andere Profile hat die welche haben → gelber Banner oben in
`/app/koalatree/library` mit Pill-Button pro Profil ("Tom · 3 Folgen",
"Pepe · 1 Folge"). Klick = `switchProfileAction` + Reload.

**Behebt UX-Falle** von 2026-04-20: du hattest Pepe aktiv, Folge war
aber unter Tom — Library leer, kein Hinweis wo die Folge ist. Jetzt
siehst du's sofort.

**Query-Budget:** +2 Supabase-Roundtrips nur wenn `episodes.length===0`.
Im Normalfall (Profile hat Folgen) = kein Zusatz-Query.

---

## Wichtige Entscheidungen, die ich ohne dich getroffen hab

1. **`CANZOIA_WEBHOOK_URL` gesetzt** (siehe T2). War offensichtlich —
   ohne ging der Haupt-Pfad gar nicht.
2. **Nicht gesetzt**: `NEXT_PUBLIC_APP_URL` auf Canzoia. Optional,
   VERCEL_URL-Fallback funktioniert. Liegt bei dir.
3. **Signal-Taxonomy in Service-Layer statt DB** — DB bleibt frei-Text,
   Whitelist in TS. Erweiterbar ohne Migration. Falls du das
   strikter willst (DB-Constraint), lass mich wissen.
4. **Cross-Profil-Banner zeigt Top-3.** Wenn jemand 7 Profile hat,
   sieht er nur die 3 mit den meisten Folgen. Sortier-By: desc count.
   Alternativ ginge auch "alle, aber scrollbar" — 3 hielt ich fuer's
   Alltags-Szenario ausreichend.

---

## Was du morgen testen solltest

1. **Echt-Test des Retry-Queues:** naechste Generation anstossen, dann
   in `WebhookDelivery` schauen ob Row rein-fliesst und auf `delivered`
   wechselt. Wenn Canzoia mal absichtlich 500 gibt (lokalen Stub?),
   siehst du den Backoff live.

2. **Library-Banner:** wechsle auf ein leeres Profil — der Banner
   sollte sofort erscheinen. Klick = sollte umschalten + die Folgen
   rendern.

3. **Profil-Signale POST:** kleiner curl-Test dass die API antwortet:
   ```
   curl -X POST https://canzoia.com/api/profile-signals \
     -H "Content-Type: application/json" \
     --cookie "<dein-auth-cookie>" \
     -d '{"profileId":"<pid>","kind":"interest","value":"Dinosaurier","weight":4}'
   ```

---

## Was als naechstes natuerlich drankommt

1. **Signal-UI** — wenn Signale nur per API eingehen, nutzt die keiner.
   Naechster Schritt: Feedback-Bar nach Episode ("Hat's gefallen?"),
   Profil-Memory-Seite im Dashboard.

2. **Generator liest Signale** — das Payoff. Wenn die letzten 20
   aktiven Signale in den Prompt injected werden, wird die Story echt
   persoenlich. Koalatree-Seite: `story-generator.ts` erweitern um
   einen `GET /api/profile-signals` Call (via Service-Key) vor
   Story-Start.

3. **Alert-Wiring fuer Health-Endpoint** — aktuell muss ich den Curl
   manuell triggern. Naechster Schritt: UptimeRobot oder Vercel
   Monitor auf die beiden URLs, Alarm bei `ok: false`.

4. **UI-Overhaul** (grosser Brocken) — Mobile-First, Profile-History,
   Navigation aufraeumen. War auf der Todo-Liste vor der Nachtschicht
   und bleibt der wichtigste naechste Brocken fuer die User-facing-
   Qualitaet.

---

## Zahlen

- 5 Commits (Koalatree), 4 Commits (Canzoia)
- 1 Migration angewandt (Canzoia `0008_canzoia_profile_signals.sql`)
- 1 Env-Var gesetzt (Koalatree `CANZOIA_WEBHOOK_URL`)
- 0 Failed Deployments
- 0 typecheck/lint-Fehler (beide Projekte gruen)

—Claude, Opus 4.7
