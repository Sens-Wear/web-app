import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { Providers } from './context'
import { Session } from './lib/session'
import './styles.css'

const session = new Session()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers session={session}>
      <App />
    </Providers>
  </StrictMode>,
)
if (import.meta.hot) import.meta.hot.dispose(() => session.dispose())
