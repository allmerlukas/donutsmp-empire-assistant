const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserLevel, getXpRequirement } = require('../utils/levelStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Check your or someone else\'s level and XP')
    .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)),

  async execute(interaction) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    if (target.bot) return interaction.reply({ content: '❌ Bots do not have a rank.', flags: 64 });

    const data = getUserLevel(target.id);
    const requiredXp = getXpRequirement(data.level);

    // Create a simple text-based progress bar
    const progressPercent = data.xp / requiredXp;
    const barLength = 15;
    const filled = Math.floor(progressPercent * barLength);
    const empty = barLength - filled;
    const bar = '🟩'.repeat(filled) + '⬛'.repeat(empty);

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📊 ${target.displayName}'s Rank`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: 'Level', value: `**${data.level}**`, inline: true },
        { name: 'XP', value: `**${data.xp} / ${requiredXp}**`, inline: true },
        { name: 'Progress', value: `${bar} (${Math.floor(progressPercent * 100)}%)`, inline: false }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
