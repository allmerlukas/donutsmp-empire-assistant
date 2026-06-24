const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance, removeBalance, addBalance } = require('../utils/economyStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gift')
    .setDescription('Gift coins to another player')
    .addUserOption(o =>
      o.setName('user').setDescription('Who to gift coins to').setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName('amount').setDescription('How many coins').setRequired(true).setMinValue(1)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    if (target.id === interaction.user.id)
      return interaction.reply({ content: '❌ You cannot gift yourself.', flags: 64 });
    if (target.bot)
      return interaction.reply({ content: '❌ You cannot gift bots.', flags: 64 });

    const balance = getBalance(interaction.user.id);
    if (balance < amount)
      return interaction.reply({ content: `❌ You only have **${balance.toLocaleString()} coins**.`, flags: 64 });

    removeBalance(interaction.user.id, amount);
    addBalance(target.id, amount);

    const embed = new EmbedBuilder()
      .setColor(0x2ECC71)
      .setTitle('🎁 Gift Sent!')
      .setDescription(
        `**${interaction.user.displayName}** gifted **${amount.toLocaleString()} coins** to **${target.displayName}**!`
      )
      .addFields(
        { name: 'Your balance',              value: `${getBalance(interaction.user.id).toLocaleString()} coins`, inline: true },
        { name: `${target.displayName}'s balance`, value: `${getBalance(target.id).toLocaleString()} coins`,  inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
