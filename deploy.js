require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'src', 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsPath, file));
  commands.push(cmd.data.toJSON());
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Deploying slash commands to guild...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, '1460707418467209248'),
      { body: commands },
    );
    console.log('✅ Commands deployed to guild instantly.');
  } catch (err) {
    console.error(err);
  }
})();
