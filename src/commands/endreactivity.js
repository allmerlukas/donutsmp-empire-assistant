const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getAllChecks } = require('../utils/checksStore');
const { resolveCheck } = require('../utils/resolveCheck');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('endreactivity')
    .setDescription('End an activity check early and post results immediately')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt
        .setName('message_id')
        .setDescription('The ID of the activity check message')
        .setRequired(true)
    ),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: 64 });

    const messageId = interaction.options.getString('message_id');
    const checks    = getAllChecks();
    const check     = checks.find(c => c.messageId === messageId);

    if (!check) {
      return interaction.editReply({
        content: '❌ No active activity check found with that message ID.',
      });
    }

    if (check.guildId !== interaction.guildId) {
      return interaction.editReply({
        content: '❌ That activity check belongs to a different server.',
      });
    }

    await interaction.editReply({ content: '⏳ Ending activity check and fetching results...' });
    await resolveCheck(client, check);
    await interaction.editReply({ content: '✅ Activity check ended. Results posted in the log channel.' });
  },
};
