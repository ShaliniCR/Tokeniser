import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Production-only Content Security Policy. The page may only talk to
 * api.anthropic.com, so even injected script could not exfiltrate the API key
 * to another origin. (Skipped in dev because Vite's HMR needs inline scripts
 * and a websocket.)
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src https://api.anthropic.com",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ')

function cspPlugin(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
  }
}

// https://vite.dev/config/
export default defineConfig({
  // The Anthropic SDK is the bulk of the bundle (~150 kB gzipped); that's expected.
  build: { chunkSizeWarningLimit: 800 },
  plugins: [react(), cspPlugin()],
})
