// /api/tenant-config.js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  try {
    const { host } = req.query
    if (!host) {
      return res.status(400).json({ error: 'Missing host query parameter' })
    }

    // Adjust the table/name columns to match your Supabase schema
    const { data, error } = await supabase
      .from('tenants')
      .select('tenantId, n8nWebhookURL, theme')
      .eq('domain', host)
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return res.status(500).json({ error: error.message })
    }
    return res.status(200).json(data)
  } catch (err) {
    console.error('Unexpected error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
