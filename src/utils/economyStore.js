/**
 * economyStore.js — persists coin balances to Supabase
 * All functions are async.
 */

const supabase = require('./supabase');

const STARTING_BALANCE = 100;

async function getBalance(userId) {
  const { data, error } = await supabase
    .from('economy')
    .select('balance')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    // First time user — create row
    await supabase.from('economy').upsert({ user_id: userId, balance: STARTING_BALANCE });
    return STARTING_BALANCE;
  }
  return data.balance;
}

async function setBalance(userId, amount) {
  const val = Math.max(0, Math.round(amount));
  await supabase.from('economy').upsert({ user_id: userId, balance: val });
  return val;
}

async function addBalance(userId, amount) {
  const current = await getBalance(userId);
  return setBalance(userId, current + amount);
}

async function removeBalance(userId, amount) {
  const current = await getBalance(userId);
  return setBalance(userId, current - amount);
}

async function getLeaderboard() {
  const { data, error } = await supabase
    .from('economy')
    .select('user_id, balance')
    .order('balance', { ascending: false })
    .limit(10);

  if (error || !data) return [];
  return data.map(r => ({ userId: r.user_id, balance: r.balance }));
}

module.exports = { getBalance, setBalance, addBalance, removeBalance, getLeaderboard, STARTING_BALANCE };
