const { getAllChecks } = require('../utils/checksStore');
const { resolveCheck } = require('../utils/resolveCheck');

const POLL_INTERVAL = 60 * 1000;

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);

    // Resolve any checks that expired while the bot was offline
    try {
      const checks = await getAllChecks();
      for (const check of checks) {
        if (Date.now() >= check.endsAt) await resolveCheck(client, check);
      }
    } catch (err) {
      console.error('[ActivityCheck] Failed to load checks on startup:', err.message);
    }

    // Poll every 60 seconds for newly expired checks
    setInterval(async () => {
      try {
        const checks = await getAllChecks();
        for (const check of checks) {
          if (Date.now() >= check.endsAt) await resolveCheck(client, check);
        }
      } catch (err) {
        console.error('[ActivityCheck] Poll error:', err.message);
      }
    }, POLL_INTERVAL);
  },
};
