# Token Counter: Claude vs Gemini vs OpenAI

A React + TypeScript app that counts tokens for a set of text samples using the **official token counting API of three providers**, shown side by side in one interface:

| Provider | Official endpoint | SDK call |
| --- | --- | --- |
| Anthropic Claude | [`POST /v1/messages/count_tokens`](https://docs.anthropic.com/en/docs/build-with-claude/token-counting) | `client.messages.countTokens()` |
| Google Gemini | [`POST /v1beta/models/{model}:countTokens`](https://ai.google.dev/api/tokens) | `ai.models.countTokens()` |
| OpenAI | [`POST /v1/responses/input_tokens`](https://developers.openai.com/api/docs/guides/token-counting) | `client.responses.inputTokens.count()` |

**Live demo:** https://tokeniser-gamma.vercel.app

## Features

- **One UI, three providers.** Enter a key for any or all providers. A single **Count Tokens** button counts every sample with every provider that has a key, so each sample card shows the three counts side by side.
- **Bring your own keys.** Each provider has its own masked key field with Show and Clear buttons.
- **Built-in samples.** Single words, sentences, a paragraph, code, multilingual text and emoji. You can also add samples of your own.
- **Model picker per provider.** Starts with a list of current models. **Load models** fetches the exact models your key can use.
- **Totals table.** Shows the total tokens and how many samples were counted for each provider and model.
- **Errors stay separate.** A bad key for one provider stops only that provider; the others keep counting. Each provider shows its own status message.
- **Loading states and cancel.** Each result shows a spinner while it is counted. Requests run 3 at a time per provider, and **Cancel** stops everything.
- **Fast first load.** Each provider's SDK is downloaded only the first time it is used, so the first page load is about 74 kB gzipped.
- **Responsive.** The layout works on phones and desktops, supports light and dark mode, and is keyboard- and screen-reader-friendly.

## Tech stack

- [Vite](https://vite.dev) + React 19 + TypeScript
- Official SDKs: [`@anthropic-ai/sdk`](https://github.com/anthropics/anthropic-sdk-typescript), [`@google/genai`](https://github.com/googleapis/js-genai), [`openai`](https://github.com/openai/openai-node)
- No backend. The browser calls each provider's API directly.

## Getting started

**Prerequisites:** Node.js 20 or newer, and at least one API key:

- Anthropic: [Claude Console](https://console.anthropic.com/settings/keys)
- Gemini: [Google AI Studio](https://aistudio.google.com/apikey)
- OpenAI: [OpenAI dashboard](https://platform.openai.com/api-keys)

```bash
git clone https://github.com/ShaliniCR/Tokeniser.git
cd Tokeniser
npm install
npm run dev        # http://localhost:5173
```

Open the app, paste one or more API keys, and click **Count Tokens**.

### Other scripts

| Command           | What it does                                     |
| ----------------- | ------------------------------------------------ |
| `npm run build`   | Type-checks and builds the production bundle into `dist/` |
| `npm run preview` | Serves the production build locally              |
| `npm run lint`    | Runs oxlint                                      |

## Deployment

This is a static site, so no environment variables or secrets are needed.

- **Vercel:** import the repo. The framework preset is Vite, the build command is `npm run build`, and the output folder is `dist`. `vercel.json` adds the security headers.
- **Netlify:** set the build command to `npm run build` and the publish directory to `dist`. `public/_headers` adds the security headers.
- **GitHub Pages / other static hosts:** upload `dist/`.

## Project structure

```
src/
├── App.tsx                    # Layout, per-provider state, parallel counting runs
├── components/
│   ├── ApiKeyInput.tsx        # Masked key field (show / clear)
│   └── SampleCard.tsx         # One sample + a token badge per provider
├── data/samples.ts            # Predefined text samples
├── providers/
│   ├── types.ts               # Provider interface shared by the UI
│   ├── registry.ts            # Provider metadata, default models, key checks (no SDK code)
│   ├── anthropic.ts           # Anthropic SDK: count, list models, error mapping
│   ├── gemini.ts              # Gemini SDK: count, list models, retries, error mapping
│   └── openai.ts              # OpenAI SDK: count, list models, error mapping
└── index.css                  # Design tokens + responsive styles
```

Adding another provider means writing one `providers/<name>.ts` file and one entry in `registry.ts`. The UI needs no changes.

## How the APIs are used

Each sample is sent as a single user message:

```ts
// Anthropic
await anthropic.messages.countTokens({ model, messages: [{ role: 'user', content: text }] }); // → input_tokens
// Gemini
await gemini.models.countTokens({ model, contents: text });                                  // → totalTokens
// OpenAI
await openai.responses.inputTokens.count({ model, input: text });                             // → input_tokens
```

Notes:

- **The counts aren't directly comparable.** Each provider uses its own tokenizer, and Anthropic and OpenAI also include the small fixed overhead of wrapping text in a message. That difference is the point of the side-by-side view: the same text costs a different number of tokens with each provider.
- **Retries:** the Anthropic and OpenAI SDKs retry rate-limit (429), server (5xx) and network errors up to 2 times. The Gemini SDK doesn't retry, so the app retries 429 and 5xx errors itself with backoff.
- **Changing a model** clears that provider's results, because token counts are model-specific.

## Security: how API keys are handled

| Expectation | How this app meets it |
| --- | --- |
| **Not hardcoded** | The code contains no keys and no `.env` file. Every user types in their own keys. |
| **Not stored** | Keys exist only in React state, in memory. They are never written to `localStorage`, `sessionStorage`, cookies, IndexedDB or the URL. Reloading or closing the tab removes them, and each **Clear** button removes a key right away. |
| **Not logged** | The app never logs keys or request headers, and its error messages don't include keys. |
| **Each key goes only to its own provider** | The Anthropic key goes only to `api.anthropic.com`, the Gemini key only to `generativelanguage.googleapis.com` (in a header, not the URL), and the OpenAI key only to `api.openai.com`, all over HTTPS. There is no proxy or analytics. The production build includes a Content Security Policy whose `connect-src` lists only those three hosts, so the browser blocks requests anywhere else. |
| **Not leaked by the browser** | Inputs have `autocomplete="off"`, spellcheck off, and password-manager opt-outs. The page sets `Referrer-Policy: no-referrer` and `X-Frame-Options: DENY`. |

**About `dangerouslyAllowBrowser`:** the Anthropic and OpenAI SDKs block browser use by default because a key shipped inside a frontend bundle can be read by anyone. Here no key is ever part of the bundle. Each user types in their own keys, and each key goes only to its own provider. That is the bring-your-own-key case this flag exists for. If an app uses **its own** keys on behalf of users, the keys must stay on a server, and the frontend should call a small backend proxy instead.

**Tip:** for testing, create separate keys with low spend limits, and delete them afterwards.

## Error handling

Errors are handled separately for each provider. A fatal error stops only that provider's requests.

| Situation | Message shown | Effect |
| --- | --- | --- |
| No keys entered | "Enter at least one API key…" | Nothing is sent |
| Badly formed key (wrong prefix, spaces, too short) | Shown under that key field | Nothing is sent |
| Invalid key (Anthropic/OpenAI: 401; Gemini: 400 `API_KEY_INVALID`) | "Invalid … API key…" | Stops that provider |
| 403 Permission denied, API disabled or key restricted | Provider-specific message | Stops that provider |
| 404 Unknown model | "Model not found… try Load models" | Stops that provider |
| OpenAI 429 `insufficient_quota` | "No remaining quota…" | Stops that provider |
| 429 Rate limited | "Rate limit reached…" (after retries) | Other samples continue |
| 400 Bad request | The API's error message | Other samples continue |
| 5xx Server error | "The … API is having trouble…" | Other samples continue |
| Network failure, or an SDK fails to load | "Could not reach…" / "Could not load…" | Stops that provider |
| User clicks Cancel | "Counting cancelled." | Requests still running are cancelled for every provider |
