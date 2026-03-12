const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Load .env.local
const envContent = fs.readFileSync('.env.local', 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) envVars[match[1]] = match[2];
});

const supabase = createClient(
  envVars.NEXT_PUBLIC_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function reset() {
  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) { console.error('List error:', listErr); return; }

  const user = users.find(u => u.email === 'Christianferrer@outlook.com');
  if (!user) { console.log('User not found'); return; }
  console.log('Found user:', user.id);

  const { data: parent } = await supabase
    .from('parents')
    .select('family_id')
    .eq('auth_user_id', user.id)
    .limit(1)
    .single();

  if (!parent) {
    console.log('No parent/family found');
  } else {
    const fid = parent.family_id;
    console.log('Family ID:', fid);

    const tables = ['intervention_feedback', 'messages', 'routines', 'events', 'tasks', 'children', 'parents'];
    for (const t of tables) {
      const { error } = await supabase.from(t).delete().eq('family_id', fid);
      console.log('Delete', t, ':', error ? error.message : 'OK');
    }
    const { error: famErr } = await supabase.from('families').delete().eq('id', fid);
    console.log('Delete families:', famErr ? famErr.message : 'OK');
  }

  const { error: delErr } = await supabase.auth.admin.deleteUser(user.id);
  console.log('Delete auth user:', delErr ? delErr.message : 'OK');
  console.log('Done! You can now register again from scratch.');
}

reset();
