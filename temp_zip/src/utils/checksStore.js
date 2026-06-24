/**
 * checksStore.js — persists active activity checks to data/checks.json
 */

const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'data', 'checks.json');

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

function addCheck({ guildId, channelId, messageId, logChannelId, endsAt }) {
  const data = load();
  data[messageId] = { guildId, channelId, messageId, logChannelId, endsAt };
  save(data);
}

function removeCheck(messageId) {
  const data = load();
  delete data[messageId];
  save(data);
}

function getAllChecks() {
  return Object.values(load());
}

module.exports = { addCheck, removeCheck, getAllChecks };
