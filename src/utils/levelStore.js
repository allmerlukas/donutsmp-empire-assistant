/**
 * levelStore.js — persists XP/levels to Supabase
 * All functions are async.
 */

const supabase = require('./supabase');

// Cooldown map: userId -> timestamp (in memory is fine, resets on restart)
const cooldowns = new Map();
const COOLDOWN_MS = 60 * 1000; // 1 minute

function getXpRequirement(currentLevel) {
  return 100 + (currentLevel * 10);
}

async function getUserLevel(userId) {
  const { data, error } = await supabase
    .from('levels')
    .select('xp, level')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    await supabase.from('levels').upsert({ user_id: userId, xp: 0, level: 0 });
    return { xp: 0, level: 0 };
  }
  return { xp: data.xp, level: data.level };
}

/**
 * Attempts to add XP to a user from a message.
 * Returns the new level if they leveled up, false if not, null if on cooldown.
 */
async function addMessageXp(userId) {
  const now = Date.now();
  const lastMsg = cooldowns.get(userId) || 0;
  if (now - lastMsg < COOLDOWN_MS) return null;

  cooldowns.set(userId, now);

  const data = await getUserLevel(userId);
  const xpGained = Math.floor(Math.random() * 11) + 15; // 15–25 XP
  data.xp += xpGained;

  let leveledUp = false;
  let req = getXpRequirement(data.level);
  while (data.xp >= req) {
    data.xp -= req;
    data.level += 1;
    leveledUp = true;
    req = getXpRequirement(data.level);
  }

  await supabase.from('levels').upsert({ user_id: userId, xp: data.xp, level: data.level });
  return leveledUp ? data.level : false;
}

async function removePoints(userId, amount) {
  const data = await getUserLevel(userId);
  data.xp -= amount;

  while (data.xp < 0 && data.level > 0) {
    data.level -= 1;
    data.xp += getXpRequirement(data.level);
  }
  if (data.level === 0 && data.xp < 0) data.xp = 0;

  await supabase.from('levels').upsert({ user_id: userId, xp: data.xp, level: data.level });
  return data;
}

async function getLeaderboard() {
  const { data, error } = await supabase
    .from('levels')
    .select('user_id, xp, level')
    .order('level', { ascending: false })
    .order('xp', { ascending: false })
    .limit(10);

  if (error || !data) return [];
  return data.map(r => ({ userId: r.user_id, xp: r.xp, level: r.level }));
}

module.exports = { getUserLevel, getXpRequirement, addMessageXp, removePoints, getLeaderboard };
