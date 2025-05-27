// api/tenant-config.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const { host } = req.query;
  if (!host) return res.status(400).json({ error: 'Missing host parameter' });

  // Initialize Supabase client
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const sb = createClient(supabaseUrl, supabaseKey);

  // Fetch tenant by domain
  const { data, error } = await sb
    .from('tenants')
    .select('id,name,domain,api_key,n8n_webhook_url,theme')
    .eq('domain', host)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Tenant not found' });
  }

  const { id: tenantId, n8n_webhook_url: n8nWebhookURL, theme } = data;
  return res.json({ tenantId, n8nWebhookURL, theme });
}
