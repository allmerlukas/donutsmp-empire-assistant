const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getLeaderboard, getBalance }        = require('../utils/economyStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the richest players or look up a specific player')
    .addUserOption(o =>
      o.setName('user').setDescription('Look up a specific player\'s rank').setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const target = interaction.options.getUser('user');
    const lb     = getLeaderboard();

    // --- Single player lookup ---
    if (target) {
      const rank = lb.findIndex(e => e.userId === target.id) + 1;
      const bal  = getBalance(target.id);

      const embed = new EmbedBuilder()
        .setColor(0xF1C40F)
        .setTitle(`📊 ${target.displayName}'s Rank`)
        .setDescription(
          `**Rank:** ${rank > 0 ? `#${rank} of ${lb.length}` : 'Unranked'}\n` +
          `**Balance:** ${bal.toLocaleString()} coins`
        )
        .setThumbnail(target.displayAvatarURL())
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // --- Top 10 leaderboard ---
    const top10 = lb.slice(0, 10);
    const medals = ['🥇','🥈','🥉'];

    const lines = await Promise.all(top10.map(async (entry, i) => {
      let name;
      try {
        const user = await interaction.client.users.fetch(entry.userId);
        name = user.displayName;
      } catch {
        name = `Unknown`;
      }
      const prefix = medals[i] ?? `**${i + 1}.**`;
      return `${prefix} **${name}** — ${entry.balance.toLocaleString()} coins`;
    }));

    const embed = new EmbedBuilder()
      .setColor(0xF1C40F)
      .setTitle('🏆 Richest Players')
      .setDescription(lines.length ? lines.join('\n') : '*No players yet.*')
      .setFooter({ text: 'Use /leaderboard @user to look up someone not in the top 10' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
