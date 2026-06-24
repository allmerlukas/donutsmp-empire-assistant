const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { addBalance, getBalance } = require('../utils/economyStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('spawn')
    .setDescription('Admin only: Spawn coins into the economy')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption(o =>
      o.setName('amount')
        .setDescription('Amount of coins to spawn')
        .setRequired(true)
        .setMinValue(1)
    )
    .addUserOption(o =>
      o.setName('user')
        .setDescription('Who gets the coins (defaults to you)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    const target = interaction.options.getUser('user') ?? interaction.user;

    addBalance(target.id, amount);

    const embed = new EmbedBuilder()
      .setColor(0x2ECC71)
      .setTitle('🪄 Coins Spawned!')
      .setDescription(`Successfully spawned **${amount.toLocaleString()} coins** for **${target.displayName}**.\n\nNew balance: **${getBalance(target.id).toLocaleString()} coins**`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
