import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './crm/styles.css'
import App from './crm/app'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
