// api/tenant-config.js

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  // allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*')

  const { host } = req.query
  if (!host) {
    return res.status(400).json({ error: 'Missing host query parameter' })
  }

  // pull id (the PK), webhook URL, and theme JSON from your tenants table
  const { data, error } = await supabase
    .from('tenants')
    .select('id, n8n_webhook_url, theme')
    .eq('domain', host)
    .single()

  if (error) {
    console.error('Supabase error:', error)
    return res.status(500).json({ error: error.message })
  }

  // parse the theme JSON string
  let themeObj = {}
  try {
    themeObj = JSON.parse(data.theme)
  } catch (e) {
    console.warn('Invalid JSON in theme column:', data.theme)
  }

  // return exactly the shape your front-end expects
  return res.status(200).json({
    tenantId:       data.id,                // <= use the real PK here
    n8nWebhookURL:  data.n8n_webhook_url,   // keep your naming
    theme:          themeObj
  })
}
