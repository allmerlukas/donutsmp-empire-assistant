const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://rhilvtewpaageydqykdw.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoaWx2dGV3cGFhZ2V5ZHF5a2R3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjMyMDc0OCwiZXhwIjoyMDk3ODk2NzQ4fQ.OWDS8H2drgimVlhdilIm_9uCHNE-8r6NpQNlB8B7UfE';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function setup() {
  console.log('Setting up Supabase tables...');

  // Create economy table
  const { error: e1 } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS economy (
        user_id TEXT PRIMARY KEY,
        balance BIGINT NOT NULL DEFAULT 0
      );
    `
  });
  if (e1) console.log('economy table note:', e1.message);
  else console.log('✅ economy table ready');

  // Create levels table
  const { error: e2 } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS levels (
        user_id TEXT PRIMARY KEY,
        xp BIGINT NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 0
      );
    `
  });
  if (e2) console.log('levels table note:', e2.message);
  else console.log('✅ levels table ready');

  // Test connection
  const { data, error: e3 } = await supabase.from('economy').select('count').limit(1);
  if (e3) console.log('❌ Connection test failed:', e3.message);
  else console.log('✅ Supabase connection confirmed!');
}

setup().catch(console.error);
