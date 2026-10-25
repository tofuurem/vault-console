import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { migrateBrowserVaultConsoleStorage } from './application/storage/browser-storage-migration.ts'

migrateBrowserVaultConsoleStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
