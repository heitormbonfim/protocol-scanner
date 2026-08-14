import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { USE_MOCK } from './lib/config.ts'

function render() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

async function bootstrap() {
  if (!USE_MOCK) {
    render()
    return
  }

  // Import lazily so MSW is never pulled into a production bundle that runs
  // against the real endpoints.
  const { startMockWorker } = await import('./mocks/browser.ts')
  try {
    await startMockWorker()
  } catch (error) {
    // Refuse to fall back to the network. If mocking was requested and the
    // worker did not register, rendering anyway would send real submissions to
    // a live service while the developer believed they were mocked.
    document.getElementById('root')!.innerHTML =
      '<pre style="padding:1.5rem;white-space:pre-wrap">' +
      'Falha ao iniciar o mock (MSW).\n\n' +
      'Rode `pnpm msw:init` e recarregue, ou defina VITE_USE_MOCK=false ' +
      'para usar as URLs reais.\n\n' +
      String(error) +
      '</pre>'
    return
  }

  render()
}

void bootstrap()
