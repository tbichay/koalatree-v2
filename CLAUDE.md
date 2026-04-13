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
- Additionally show inline errors for form validation
- Never silently swallow errors with `catch { /* */ }`
