import { useEffect } from 'react'
import CrmApp from '../../../crm/src/App'
import { CRMProvider } from '../../../crm/src/store'
import { porVencer, refrescar } from '../lib/auth'
import '../../../crm/src/brand.css?crm-shell'
import '../../../crm/src/styles.css?crm-shell'

export default function CrmShell() {
  useEffect(() => {
    const previous = document.title
    document.title = 'LiciHub CRM · Espacio comercial'
    return () => { document.title = previous }
  }, [])
  useEffect(() => {
    const id = window.setInterval(() => {
      if (porVencer()) void refrescar().catch(() => {})
    }, 30_000)
    return () => window.clearInterval(id)
  }, [])
  return <div className="crm-shell"><CRMProvider><CrmApp /></CRMProvider></div>
}
