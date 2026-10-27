import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { CRMProvider } from './store'
import App from './App'
import './brand.css'
import './styles.css'

createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><CRMProvider><App /></CRMProvider></BrowserRouter></StrictMode>)
