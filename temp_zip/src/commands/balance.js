const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance }                        = require('../utils/economyStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your coin balance')
    .addUserOption(o =>
      o.setName('user')
        .setDescription('Check another user\'s balance')
        .setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    const bal    = getBalance(target.id);

    const embed = new EmbedBuilder()
      .setColor(0xF1C40F)
      .setTitle('💰 Balance')
      .setDescription(`**${target.displayName}** has **${bal.toLocaleString()} coins**`)
      .setThumbnail(target.displayAvatarURL())
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
