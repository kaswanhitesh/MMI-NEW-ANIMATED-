/**
 * Application entry point. Mounts the React tree in StrictMode and loads the
 * global stylesheet (tokens → base → layout → scene) before the first render.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/index.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('index.html must contain <div id="root"> for the application to mount.')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
