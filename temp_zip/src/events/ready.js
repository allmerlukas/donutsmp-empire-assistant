const { getAllChecks } = require('../utils/checksStore');
const { resolveCheck } = require('../utils/resolveCheck');

const POLL_INTERVAL = 60 * 1000;

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);

    // Resolve any checks that expired while the bot was offline
    for (const check of getAllChecks()) {
      if (Date.now() >= check.endsAt) await resolveCheck(client, check);
    }

    // Poll every 60 seconds for newly expired checks
    setInterval(async () => {
      for (const check of getAllChecks()) {
        if (Date.now() >= check.endsAt) await resolveCheck(client, check);
      }
    }, POLL_INTERVAL);
  },
};
