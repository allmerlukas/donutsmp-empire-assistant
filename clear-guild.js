require('dotenv').config();
const { REST, Routes } = require('discord.js');

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, '1460707418467209248'),
      { body: [] },
    );
    console.log('✅ Guild commands cleared.');
  } catch (err) {
    console.error(err);
  }
})();
