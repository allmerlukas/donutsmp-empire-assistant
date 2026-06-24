const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', '..', 'data', 'levels.json');
let levels = {};

// Cooldown map: userId -> timestamp
const cooldowns = new Map();
const COOLDOWN_MS = 60 * 1000; // 1 minute

// Load on startup
if (fs.existsSync(dataPath)) {
  try {
    levels = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch (err) {
    console.error('Failed to load levels.json:', err);
  }
}

function save() {
  try {
    fs.writeFileSync(dataPath, JSON.stringify(levels, null, 2));
  } catch (err) {
    console.error('Failed to save levels.json:', err);
  }
}

function getUserLevel(userId) {
  if (!levels[userId]) {
    levels[userId] = { level: 0, xp: 0 };
    save();
  }
  return levels[userId];
}

// Requirement to reach NEXT level based on current level
// Level 0 -> 1: 100 XP
// Level 1 -> 2: 110 XP
// Level 2 -> 3: 120 XP
function getXpRequirement(currentLevel) {
  return 100 + (currentLevel * 10);
}

/**
 * Attempts to add XP to a user.
 * Returns true if they leveled up, false otherwise.
 * Returns null if they were on cooldown.
 */
function addMessageXp(userId) {
  const now = Date.now();
  const lastMsg = cooldowns.get(userId) || 0;

  if (now - lastMsg < COOLDOWN_MS) {
    return null; // On cooldown
  }

  cooldowns.set(userId, now);

  const data = getUserLevel(userId);
  const xpGained = Math.floor(Math.random() * 11) + 15; // 15 to 25 XP
  data.xp += xpGained;

  let leveledUp = false;
  let req = getXpRequirement(data.level);

  while (data.xp >= req) {
    data.xp -= req;
    data.level += 1;
    leveledUp = true;
    req = getXpRequirement(data.level);
  }

  save();
  return leveledUp ? data.level : false;
}

function removePoints(userId, amount) {
  const data = getUserLevel(userId);
  data.xp -= amount;
  
  // Handle de-leveling if XP goes below 0
  while (data.xp < 0 && data.level > 0) {
    data.level -= 1;
    data.xp += getXpRequirement(data.level);
  }

  // If level is 0 and XP is negative, cap at 0
  if (data.level === 0 && data.xp < 0) {
    data.xp = 0;
  }

  save();
  return data;
}

module.exports = {
  getUserLevel,
  getXpRequirement,
  addMessageXp,
  removePoints
};
