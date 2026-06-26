/**
 * diceduel.js — 1v1 Dice Duel
 *
 * Flow:
 *  1. /diceduel <bet> → public lobby, host auto-joins & bet is deducted
 *  2. Exactly 1 other player joins (their bet is also deducted)
 *  3. Host clicks Start → animated dice roll → results posted
 *  4. Higher roll wins the pot (bet × 2). Tie → both refunded
 *  5. Host can cancel at any time (both players refunded)
 *
 * Button customIds:
 *   dd_join_<gameId>   — handled in interactionCreate.js
 *   dd_start_<gameId>  — handled in interactionCreate.js
 *   dd_cancel_<gameId> — handled in interactionCreate.js
 */

const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');

const { getBalance, removeBalance, addBalance } = require('../utils/economyStore');
const { createGame, getGame, updateGame, deleteGame, getGameByUser } = require('../utils/gameStore');

// ─── ID generator ─────────────────────────────────────────────────────────────

function newGameId() {
  return 'dd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

// ─── Dice helpers ─────────────────────────────────────────────────────────────

const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function rollDice() {
  return Math.floor(Math.random() * 6) + 1; // 1-6
}

function diceEmoji(value) {
  return DICE_FACES[value - 1];
}

// ─── Embed builders ───────────────────────────────────────────────────────────

function lobbyEmbed(game) {
  const playerList = Object.values(game.players);
  const playersStr = playerList.length === 0
    ? '*No players yet*'
    : playerList.map(p => `• <@${p.userId}>`).join('\n');

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎲 Dice Duel — Lobby')
    .setDescription('A 1v1 dice rolling showdown! The higher roll wins the pot.')
    .addFields(
      { name: '💰 Bet',     value: `${game.bet.toLocaleString()} coins`, inline: true },
      { name: '👥 Players', value: `${playerList.length}/2`,             inline: true },
      { name: '🎮 Joined',  value: playersStr },
    )
    .setFooter({ text: 'Host starts when 2 players have joined • Bet deducted on join' })
    .setTimestamp();
}

function lobbyButtons(gameId, isFull) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`dd_join_${gameId}`)
      .setLabel('Join')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅')
      .setDisabled(isFull),
    new ButtonBuilder()
      .setCustomId(`dd_start_${gameId}`)
      .setLabel('Start Duel')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎲')
      .setDisabled(!isFull),
    new ButtonBuilder()
      .setCustomId(`dd_cancel_${gameId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌'),
  );
}

function rollingEmbed(frame, game) {
  const players = Object.values(game.players);
  const dots    = '.'.repeat((frame % 3) + 1);

  return new EmbedBuilder()
    .setColor(0xFEE75C)
    .setTitle(`🎲 Dice Duel — Rolling${dots}`)
    .setDescription('Both players are rolling their dice...')
    .addFields(
      { name: `🎲 ${players[0] ? `<@${players[0].userId}>` : 'Player 1'}`, value: DICE_FACES[frame % 6], inline: true },
      { name: 'VS',                                                          value: '⚔️',                 inline: true },
      { name: `🎲 ${players[1] ? `<@${players[1].userId}>` : 'Player 2'}`, value: DICE_FACES[(frame + 3) % 6], inline: true },
    );
}

function resultEmbed(game) {
  const [p1, p2] = Object.values(game.players);
  const r1 = p1.roll, r2 = p2.roll;
  const tie = r1 === r2;

  let color      = 0x5865F2;
  let outcomeStr = '';

  if (tie) {
    color      = 0xFEE75C;
    outcomeStr = '🤝 **It\'s a tie! Both players are refunded.**';
  } else {
    const winner = r1 > r2 ? p1 : p2;
    const loser  = r1 > r2 ? p2 : p1;
    color        = 0x57F287;
    outcomeStr   = `🏆 **<@${winner.userId}> wins ${(game.bet * 2).toLocaleString()} coins!**\n😢 <@${loser.userId}> loses their bet.`;
  }

  return new EmbedBuilder()
    .setColor(color)
    .setTitle('🎲 Dice Duel — Results!')
    .setDescription(outcomeStr)
    .addFields(
      {
        name:   `<@${p1.userId}>`,
        value:  `${diceEmoji(r1)} Rolled **${r1}**`,
        inline: true,
      },
      { name: '⚔️', value: 'VS', inline: true },
      {
        name:   `<@${p2.userId}>`,
        value:  `${diceEmoji(r2)} Rolled **${r2}**`,
        inline: true,
      },
    )
    .setFooter({ text: `Pot: ${(game.bet * 2).toLocaleString()} coins` })
    .setTimestamp();
}

// ─── Game logic ───────────────────────────────────────────────────────────────

/**
 * Animate and resolve the duel.
 * Called from interactionCreate.js after host presses Start.
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {Object} game
 */
async function startGame(interaction, game) {
  const players = Object.values(game.players);

  if (players.length < 2) {
    return interaction.reply({ content: '❌ Need exactly 2 players to start!', flags: 64 });
  }

  updateGame(game.gameId, { phase: 'rolling' });

  // Disable all buttons while rolling
  await interaction.update({
    embeds:     [rollingEmbed(0, game)],
    components: [lobbyButtons(game.gameId, true)],
  });

  // Animate dice rolling
  for (let i = 1; i <= 4; i++) {
    await new Promise(r => setTimeout(r, 700));
    try {
      await game.lobbyMsg.edit({ embeds: [rollingEmbed(i, game)], components: [] });
    } catch { /* ignore */ }
  }

  // Roll dice
  players[0].roll = rollDice();
  players[1].roll = rollDice();

  const r1  = players[0].roll;
  const r2  = players[1].roll;
  const tie = r1 === r2;
  const pot = game.bet * 2;

  if (tie) {
    // Refund both
    await addBalance(players[0].userId, game.bet);
    await addBalance(players[1].userId, game.bet);
  } else {
    const winner = r1 > r2 ? players[0] : players[1];
    await addBalance(winner.userId, pot);
  }

  await new Promise(r => setTimeout(r, 500));

  try {
    await game.lobbyMsg.edit({ embeds: [resultEmbed(game)], components: [] });
  } catch { /* ignore */ }

  deleteGame(game.gameId);
}

/**
 * Cancel the game and refund all players.
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {Object} game
 */
async function cancelGame(interaction, game) {
  for (const player of Object.values(game.players)) {
    await addBalance(player.userId, game.bet);
  }

  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('🎲 Dice Duel — Cancelled')
    .setDescription('The duel was cancelled. All bets have been refunded.')
    .setTimestamp();

  await interaction.update({ embeds: [embed], components: [] });
  deleteGame(game.gameId);
}

// ─── Command definition ───────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('diceduel')
    .setDescription('Challenge someone to a 1v1 dice duel!')
    .addIntegerOption(o =>
      o.setName('bet')
        .setDescription('Amount of coins to bet')
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    const bet = interaction.options.getInteger('bet');

    if (getGameByUser(interaction.user.id))
      return interaction.reply({ content: '❌ You already have an active game.', flags: 64 });

    const balance = await getBalance(interaction.user.id);
    if (balance < bet)
      return interaction.reply({ content: `❌ You only have **${balance.toLocaleString()} coins**.`, flags: 64 });

    const gameId = newGameId();
    const game   = createGame({
      gameId,
      hostId:    interaction.user.id,
      bet,
      maxPlayers: 2,
      channelId: interaction.channelId,
      phase:     'lobby',
    });

    await removeBalance(interaction.user.id, bet);
    game.players[interaction.user.id] = { userId: interaction.user.id };

    await interaction.reply({
      embeds:     [lobbyEmbed(game)],
      components: [lobbyButtons(gameId, false)],
    });

    const msg = await interaction.fetchReply();
    updateGame(gameId, { lobbyMsg: msg });
  },

  // Exported for interactionCreate.js
  startGame,
  cancelGame,
  lobbyEmbed,
  lobbyButtons,
};
