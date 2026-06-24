/**
 * economyStore.js — persists coin balances to data/economy.json
 * Everyone starts with 100 coins on first use.
 */

const fs   = require('fs');
const path = require('path');

const FILE             = path.join(__dirname, '..', '..', 'data', 'economy.json');
const STARTING_BALANCE = 100;

function load() {
  try {
    if (!fs.existsSync(FILE)) return {};
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch { return {}; }
}

function save(data) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function getBalance(userId) {
  const data = load();
  if (data[userId] === undefined) {
    data[userId] = STARTING_BALANCE;
    save(data);
  }
  return data[userId];
}

function setBalance(userId, amount) {
  const data = load();
  data[userId] = Math.max(0, Math.round(amount));
  save(data);
  return data[userId];
}

function addBalance(userId, amount) {
  return setBalance(userId, getBalance(userId) + amount);
}

function removeBalance(userId, amount) {
  return setBalance(userId, getBalance(userId) - amount);
}

function getLeaderboard() {
  const data = load();
  return Object.entries(data)
    .map(([userId, balance]) => ({ userId, balance }))
    .sort((a, b) => b.balance - a.balance);
}

module.exports = { getBalance, setBalance, addBalance, removeBalance, getLeaderboard, STARTING_BALANCE };
