# Veil: ask AI about private documents, privately

**Live app:** https://veil-hybrid-3fc9f.web.app  
Built for **#BuildHybridAI 2026** with **Firebase AI Logic hybrid inference** (Web / Chrome).

People paste bank letters, lab reports and rental notices into AI chatbots every day, because they need help understanding them. Those documents are full of Aadhaar and PAN numbers, card and account numbers, phone numbers, names and diagnoses. Veil lets you get the same help **without the private parts ever leaving your device**.

## How it works

```
 your document ──► [ON DEVICE] rule-based detectors (Aadhaar/Verhoeff, cards/Luhn, PAN, IFSC, UPI, phones, emails, IDs…)
                 + [ON DEVICE] Gemini Nano entity pass (names, addresses, organisations, health details)   ← InferenceMode.ONLY_ON_DEVICE
                 ──► you review / toggle highlights
                 ──► mask: "Arjun Mehta" → [PERSON_1], "4111 …" → [CARD_1]  (vault stays in memory, never stored)
                 ──► leak check: refuse to send if any hidden value is still in the request
                 ──► answer on MASKED text: Gemini Nano on-device if ready, else Gemini in the cloud  ← PREFER_ON_DEVICE / ONLY_IN_CLOUD / ONLY_ON_DEVICE
                 ──► [ON DEVICE] restore placeholders → real values, highlighted
                 ──► privacy receipt: what ran where (from response.inferenceSource), what was sent
```

The key design rule: **raw text only ever touches the on-device model**. The detection step uses `ONLY_ON_DEVICE`, so if Gemini Nano is missing it throws instead of falling back to the cloud, and Veil falls back to its local rule-based detectors instead. Anything that *can* fall back to the cloud has already been masked, so hybrid fallback is always safe.

## Firebase products used

| Product | Use |
| --- | --- |
| Firebase AI Logic (hybrid, Gemini Developer API) | On-device entity extraction with structured JSON output; answers with on-device/cloud routing and streaming; `inferenceSource` shown to the user |
| App Check (reCAPTCHA Enterprise) | Protects the Gemini API from abuse; enforced for AI Logic |
| Remote Config | Cloud model name and on-device input limit can change without a redeploy |
| Hosting | Serves the app with strict headers (`no-referrer`, no camera/mic/geo) |

No Analytics, no Auth, no database: Veil stores nothing about you. Your "Always hide" list stays in your own browser's localStorage.

## Try it in one minute

1. Open the live app in desktop Chrome.
2. Click a **fictional sample** (Card fraud dispute, Lab report, or Rent increase notice).
3. Review the highlights and the "What the cloud will see" pane, then press **Ask with masked text**.
4. Read the restored answer and the **Privacy receipt**.

To use the on-device path, use Chrome 139+ on desktop. If the pill at the top says "tap to download", click it once to download Gemini Nano. Without it, Veil still works with rule-based on-device masking plus cloud answers.

## Run locally

```bash
npm install
npm test        # 27 unit tests: checksums, detectors, vault/restore, leak guard, parsing, rendering
npm run dev     # uses the App Check debug provider on localhost
```

Windows helpers: `1-install.bat`, `2-firebase-login.bat`, `3-deploy.bat`.

## Code map

- `src/core/detect.js`: local detectors, overlap resolution, name propagation
- `src/core/checksums.js`: Verhoeff (Aadhaar) and Luhn (cards) to cut false positives
- `src/core/vault.js`: masking, tolerant restoring, leak guard, masking of the user's own question
- `src/core/prompts.js`: task prompts, placeholder rules, entity schema, defensive JSON parsing (drops anything not literally in the source)
- `src/ai.js`: Firebase App Check, Remote Config and AI Logic hybrid models
- `src/main.js`: UI flow

## Limits (honest list)

- Rule-based detection can't find every name or address. That's why you review before sending, and why the Gemini Nano pass matters.
- Placeholders hide identities, but the rest of the document's content (e.g. lab values, rent amounts) is still sent so the model can help. Hide anything else you want with "Hide selection".
- The sample documents are fictional; all names and numbers in them are invented.

## License

Apache-2.0
