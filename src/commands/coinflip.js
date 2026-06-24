const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getBalance, removeBalance, addBalance } = require('../utils/economyStore');
const { createGame, getGame, updateGame, deleteGame, getGameByUser } = require('../utils/gameStore');

function newGameId() {
  return 'cf' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

function lobbyEmbed(game) {
  const count   = Object.keys(game.players).length;
  const players = count === 0
    ? '*No players yet*'
    : Object.values(game.players).map(p => `• <@${p.userId}>`).join('\n');

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🪙 Coinflip Lobby')
    .addFields(
      { name: 'Bet',     value: `${game.bet.toLocaleString()} coins`, inline: true },
      { name: 'Players', value: `${count}/2`,        inline: true },
      { name: 'Joined',  value: players }
    )
    .setFooter({ text: 'Bet is deducted when you join • Host starts the game' })
    .setTimestamp();
}

function lobbyButtons(gameId, isFull) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`cf_join_${gameId}`)
      .setLabel('Join')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅')
      .setDisabled(isFull),
    new ButtonBuilder()
      .setCustomId(`cf_start_${gameId}`)
      .setLabel('Start Game')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('▶️'),
    new ButtonBuilder()
      .setCustomId(`cf_cancel_${gameId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌')
  );
}

function chooseButtons(gameId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`cf_pick_heads_${gameId}`)
      .setLabel('Heads')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🗣️'),
    new ButtonBuilder()
      .setCustomId(`cf_pick_tails_${gameId}`)
      .setLabel('Tails')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🪙')
  );
}

async function startGame(game, client) {
  updateGame(game.gameId, { phase: 'choosing' });
  game = getGame(game.gameId);

  const embed = new EmbedBuilder()
    .setColor(0xF1C40F)
    .setTitle('🪙 Coinflip — Choosing Sides')
    .setDescription('The game has started!\n**First player to click a button gets that side!**\n*(The other player gets the opposite side automatically)*')
    .addFields(
      { name: 'Players', value: Object.values(game.players).map(p => `<@${p.userId}>`).join(' **VS** ') }
    )
    .setTimestamp();

  try {
    await game.lobbyMsg.edit({ embeds: [embed], components: [chooseButtons(game.gameId)] });
  } catch {}
}

async function resolveGame(game, client, clickerId, sidePicked) {
  const playerIds = Object.keys(game.players);
  const otherId   = playerIds.find(id => id !== clickerId);

  const clickerSide = sidePicked;
  const otherSide   = sidePicked === 'heads' ? 'tails' : 'heads';

  game.players[clickerId].side = clickerSide;
  game.players[otherId].side   = otherSide;

  // Flip the coin
  const isHeads = Math.random() < 0.5;
  const result  = isHeads ? 'heads' : 'tails';
  const resultStr = isHeads ? '🗣️ Heads' : '🪙 Tails';

  const winnerId = clickerSide === result ? clickerId : otherId;
  
  const pot = game.bet * 2;
  addBalance(winnerId, pot);

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle(`🪙 Coinflip Result: It's ${resultStr}!`)
    .setDescription(`🎉 **<@${winnerId}> won ${pot.toLocaleString()} coins!** 🎉`)
    .addFields(
      { name: `<@${clickerId}>`, value: `Picked: **${clickerSide.toUpperCase()}**`, inline: true },
      { name: `<@${otherId}>`, value: `Assigned: **${otherSide.toUpperCase()}**`, inline: true }
    )
    .setTimestamp();

  try {
    await game.lobbyMsg.edit({ embeds: [embed], components: [] });
  } catch {}

  deleteGame(game.gameId);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Start a 1v1 coinflip game')
    .addIntegerOption(o =>
      o.setName('bet')
        .setDescription('Amount of coins to bet')
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction, client) {
    const bet = interaction.options.getInteger('bet');

    if (getGameByUser(interaction.user.id))
      return interaction.reply({ content: '❌ You already have an active game.', flags: 64 });

    const balance = getBalance(interaction.user.id);
    if (balance < bet)
      return interaction.reply({ content: `❌ You only have **${balance.toLocaleString()} coins**.`, flags: 64 });

    const id   = newGameId();
    const game = createGame({ gameId: id, type: 'coinflip', hostId: interaction.user.id, bet, maxPlayers: 2, channelId: interaction.channelId });

    removeBalance(interaction.user.id, bet);
    game.players[interaction.user.id] = {
      userId: interaction.user.id
    };

    await interaction.reply({ embeds: [lobbyEmbed(game)], components: [lobbyButtons(id, false)] });
    const msg = await interaction.fetchReply();
    updateGame(id, { lobbyMsg: msg });
  },

  startGame,
  resolveGame,
  lobbyEmbed,
  lobbyButtons,
};
