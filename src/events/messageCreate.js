const { EmbedBuilder } = require('discord.js');
const { addMessageXp } = require('../utils/levelStore');

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const newLevel = await addMessageXp(message.author.id);

    if (newLevel) {
      try {
        const channel = await client.channels.fetch('1513606925974114474');
        if (channel) {
          const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('🎉 Level Up!')
            .setDescription(`Congratulations <@${message.author.id}>!\nYou just advanced to **Level ${newLevel}**!`)
            .setThumbnail(message.author.displayAvatarURL())
            .setTimestamp();
            
          await channel.send({ content: `<@${message.author.id}>`, embeds: [embed] });
        }
      } catch (err) {
        console.error('Failed to send level up message:', err);
      }
    }
  },
};
