// api/tenant-config.js

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  // 1) CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    // preflight
    return res.status(204).end()
  }

  // 2) Validate
  const { host } = req.query
  if (req.method !== 'GET' || !host) {
    return res
      .status(400)
      .json({ error: 'GET /api/tenant-config?host=<your-domain> required' })
  }

  // 3) Query Supabase
  const { data, error } = await supabase
    .from('tenants')
    .select('id, n8n_webhook_url, theme')
    .eq('domain', host)
    .maybeSingle()        // returns `data=null` if not found
  if (error) {
    console.error('Supabase error:', error)
    return res.status(500).json({ error: error.message })
  }
  if (!data) {
    return res
      .status(404)
      .json({ error: `No tenant configured for host="${host}"` })
  }

  // 4) Normalize theme
  let themeObj = data.theme
  if (typeof themeObj === 'string') {
    try { themeObj = JSON.parse(themeObj) }
    catch {
      console.warn('Invalid JSON in theme column:', data.theme)
      themeObj = {}
    }
  }

  // 5) Return exactly what your front end expects
  return res.status(200).json({
    tenantId:      data.id,                // map the real PK
    n8nWebhookURL: data.n8n_webhook_url,   // keep your camelCase on the JSON key
    theme:         themeObj
  })
}
