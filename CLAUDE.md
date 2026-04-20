@AGENTS.md

# UX Rules — MUST follow for ALL new features

## Toast Feedback (MANDATORY)
Every async operation MUST use the toast system:
```typescript
const toast = useToast();
const tid = toast.loading("Operation wird ausgefuehrt...");
try {
  const res = await fetch(...);
  if (res.ok) toast.success("Fertig!", tid);
  else toast.error("Fehlgeschlagen", tid);
} catch { toast.error("Netzwerkfehler", tid); }
```
- Import: `import { useToast } from "@/app/components/Toasts";`
- For components outside ToastProvider: use `onNotify` callback prop
- Auto-save actions (picker selections): `toast.info("Zugewiesen")`
- Long operations: `toast.update(tid, "Schritt 2/5...")` for progress

## Button Naming (CONSISTENT)
- First-time generation: **"Generieren"**
- Re-generation: **"Neu generieren"**
- Batch operations: **"Alle generieren"** (always regenerates ALL, no skipping)
- Save: **"Speichern"**
- NO emojis in action buttons (only in tab navigation)

## Loading States
- Every button that triggers an async operation MUST show a loading state
- Use `disabled={loading}` + button text changes: "Generiert..." / "Speichert..."
- Long operations (>5s): use toast.update() for progress

## Error Handling
- Every error MUST be shown via toast.error()

## External API Image/Audio Upload (CRITICAL — learned the hard way)
When an external API needs to FETCH an asset from a URL:
- Vercel Blob **private-store URLs** → **NOT accessible** by external APIs (403 from Vercel)
- Vercel Blob `getDownloadUrl()` → **DOES NOT SIGN private URLs** — it only appends `?download=1` as a browser download-vs-inline hint, and still returns 403 on private stores. (Verified 2026-04-20 with @vercel/blob@2.3.2.)
- Vercel Blob **access mode cannot be changed after store creation** (per Vercel docs). You must create a new store, re-upload, and switch tokens.
- Vercel Blob **public-store URLs** → work out of the box; random-suffix filenames (`addRandomSuffix: true`) keep them unguessable.
- For private stores, use a **server-side proxy route** that calls `get(url, { access: "private" })` and streams the body. See `app/api/canzoia/jobs/[jobId]/audio.mp3/route.ts` + `lib/canzoia/audio-token.ts` for the token-signed pattern (HMAC-based, works in `<audio src>` tags).
- Data URIs → work for small images (<5MB), may fail for larger ones
- fal.ai `uploadToFal()` → gives public URLs → **WORKS** (but costs credits)
- Wikipedia/rate-limited URLs → external APIs get 429 → **FAILS**
- Always test with `curl -sI` first before debugging complex integration code
- Additionally show inline errors for form validation
- Never silently swallow errors with `catch { /* */ }`
