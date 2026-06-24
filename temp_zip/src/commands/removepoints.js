const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { removePoints } = require('../utils/levelStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removepoints')
    .setDescription('Admin only: Remove level XP from a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName('user').setDescription('User to remove XP from').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount of XP to remove').setRequired(true).setMinValue(1)),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    if (target.bot) return interaction.reply({ content: '❌ Bots do not have a rank.', flags: 64 });

    const newData = removePoints(target.id, amount);

    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('📉 Points Removed')
      .setDescription(`Successfully removed **${amount} XP** from <@${target.id}>.`)
      .addFields(
        { name: 'New Level', value: `${newData.level}`, inline: true },
        { name: 'New XP', value: `${newData.xp}`, inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
