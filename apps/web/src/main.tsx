import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/bricolage-grotesque'
import './index.css'
import App from './App.tsx'
// Checked inline (not via config.ts) so the bundler can drop the account screens and auth client entirely
// from builds with accounts switched off.
const Accounts = import.meta.env.VITE_FEATURE_ACCOUNTS === 'true' ? lazy(() => import('./account/Accounts')) : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {Accounts && (
      <Suspense fallback={null}>
        <Accounts />
      </Suspense>
    )}
  </StrictMode>,
)
