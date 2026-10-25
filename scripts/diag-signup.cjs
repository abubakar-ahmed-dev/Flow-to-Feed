const fs = require('fs');
function parseEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const web = parseEnv('apps/web/.env');
const api = parseEnv('apps/api/.env');
const url = web.VITE_SUPABASE_URL;
const pub = web.VITE_SUPABASE_PUBLISHABLE_KEY;
console.log('url ok:', !!url, '| pub prefix:', pub.slice(0, 16), '| len:', pub.length);
const { createClient } = require('@supabase/supabase-js');
const anon = createClient(url, pub);
(async () => {
  const email = `diag-${Date.now()}@flowtofeed.test`;
  const password = 'Diag-' + Date.now() + '!a';
  const su = await anon.auth.signUp({ email, password });
  console.log('signUp error:', su.error ? su.error.message : 'none');
  console.log('signUp session:', su.data?.session ? 'YES' : 'NULL');
  const si = await anon.auth.signInWithPassword({ email, password });
  console.log('signIn error:', si.error ? si.error.message : 'none');
  console.log('signIn session:', si.data?.session ? 'YES' : 'NULL');
  const admin = createClient(url, api.SUPABASE_SECRET_KEY ?? api.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  if (su.data?.user) await admin.auth.admin.deleteUser(su.data.user.id);
  console.log('cleaned');
  process.exit(0);
})();
