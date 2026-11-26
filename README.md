# Token Counter

A React + TypeScript app that shows how many tokens a set of text samples uses, counted by Anthropic's official [Token Counting API](https://docs.anthropic.com/en/docs/build-with-claude/token-counting) (`POST /v1/messages/count_tokens`).

**Live demo:** https://tokeniser-gamma.vercel.app

## Features

- **Bring your own key.** You enter an Anthropic API key in a masked field. You can show it or clear it.
- **Built-in samples.** Single words, sentences, a paragraph, code, multilingual text and emoji. You can also add samples of your own.
- **Model picker.** Choose Claude Opus 5.5, Sonnet 5.5 or Haiku 5.5. Token counts differ by model.
- **One-click counting.** The **Count Tokens** button counts every sample. Requests run 3 at a time, and you can cancel a run partway.
- **Clear results.** Each sample shows its own count, loading spinner or error. A summary shows the total tokens and how many samples were counted.
- **Error handling.** Invalid keys, missing permissions, unknown models, rate limits, server errors, timeouts and network failures each get a clear message. If the key is bad, the app stops the run at the first failure instead of failing every sample.
- **Responsive.** The layout works on phones and desktops, supports light and dark mode, and is keyboard- and screen-reader-friendly.

## Tech stack

- [Vite](https://vite.dev) + React 19 + TypeScript
- The official [`@anthropic-ai/sdk`](https://github.com/anthropics/anthropic-sdk-typescript) (`client.messages.countTokens`)
- No backend. The browser calls `api.anthropic.com` directly.

## Getting started

**Prerequisites:** Node.js 20 or newer, and an Anthropic API key from the [Claude Console](https://console.anthropic.com/settings/keys).

```bash
git clone <your-repo-url>
cd <repo-folder>
npm install
npm run dev        # http://localhost:5173
```

Open the app, paste your API key, and click **Count Tokens**.

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
├── App.tsx                    # Page layout, run orchestration, results state
├── components/
│   ├── ApiKeyInput.tsx        # Masked key field (show / clear)
│   └── SampleCard.tsx         # One sample + its token badge
├── data/samples.ts            # Predefined text samples
├── lib/tokenCounter.ts        # SDK client, countTokens call, error mapping, key validation
└── index.css                  # Design tokens + responsive styles
```

## How the API is used

For each sample, the app sends:

```ts
const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
const { input_tokens } = await client.messages.countTokens({
  model: 'claude-opus-5-5',
  messages: [{ role: 'user', content: sampleText }],
});
```

Notes:

- The count includes the small fixed overhead of wrapping the text in a user message. That makes it the real number of input tokens the text would use in a request.
- Token counting is free, but it has its own rate limits. The SDK automatically retries rate-limit (429), server (5xx) and network errors up to 2 times with backoff.

## Security: how the API key is handled

| Expectation | How this app meets it |
| --- | --- |
| **Not hardcoded** | The code contains no key and no `.env` file. Every user types in their own key. |
| **Not stored** | The key exists only in React state, in memory. It is never written to `localStorage`, `sessionStorage`, cookies, IndexedDB or the URL. Reloading or closing the tab removes it, and the **Clear** button removes it right away. |
| **Not logged** | The app never logs the key or the request headers, and its error messages don't include the key. |
| **Sent only to Anthropic** | The key goes only to `https://api.anthropic.com` over HTTPS, in the `x-api-key` header. There is no proxy or analytics. The production build includes a Content Security Policy with `connect-src https://api.anthropic.com`, so the browser blocks any request to another origin. |
| **Not leaked by the browser** | The input has `autocomplete="off"`, spellcheck off, and password-manager opt-outs. The page sets `Referrer-Policy: no-referrer` and `X-Frame-Options: DENY`. |

**About `dangerouslyAllowBrowser`:** the SDK blocks browser use by default because a key shipped inside a frontend bundle can be read by anyone. Here the key is never part of the bundle. Each user types in their own key, and it never leaves their browser except to go to Anthropic. That is the bring-your-own-key case this flag exists for. If an app uses **its own** key on behalf of users, the key must stay on a server, and the frontend should call a small backend proxy instead.

**Tip:** for testing, create a separate API key with a low spend limit in the Claude Console, and delete it afterwards.

## Error handling

| Situation | Message shown | Run behaviour |
| --- | --- | --- |
| Empty or badly formed key (no `sk-ant-` prefix, contains spaces) | Shown under the key field; no request is sent | Not started |
| 401 Invalid key | "Invalid API key…" | Stops all requests |
| 403 Permission denied | "This API key does not have permission…" | Stops all requests |
| 404 Unknown model | "The selected model was not found…" | Stops all requests |
| 429 Rate limited | "Rate limit reached…" (after automatic retries) | Other samples continue |
| 400 Bad request | The API's error message | Other samples continue |
| 5xx Server error | "Anthropic API is having trouble…" | Other samples continue |
| Timeout or network failure | "Timed out…" / "Could not reach the Anthropic API…" | Timeout: other samples continue. Network failure: stops all requests |
| User clicks Cancel | "Counting cancelled." | Requests still running are cancelled |
