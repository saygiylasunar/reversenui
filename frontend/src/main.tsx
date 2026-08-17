import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import PromptRoller from './PromptRoller'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <PromptRoller />
  </StrictMode>
)
