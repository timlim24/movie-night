import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { loadConfig } from './lib/config'
import './styles.css'

const root = createRoot(document.getElementById('root')!)

loadConfig()
  .then(() =>
    root.render(
      <StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StrictMode>,
    ),
  )
  .catch(() => {
    root.render(<div className="fatal">Не вдалося завантажити налаштування. Онови сторінку.</div>)
  })
