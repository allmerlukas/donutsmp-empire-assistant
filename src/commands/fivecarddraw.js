/**
 * fivecarddraw.js — No-Limit Five Card Draw poker for DonutSmpBot
 * Commands: /fivecarddraw <buyin>
 *
 * Game Flow:
 *  1. Host opens lobby. Up to 8 players join.
 *  2. Host starts. Each player gets 5 secret cards.
 *  3. Betting round 1.
 *  4. Draw phase — each player clicks "Swap Cards" and picks cards to discard (0–3).
 *  5. Betting round 2.
 *  6. Showdown — best 5-card hand wins.
 */

const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder
} = require('discord.js');
const { getBalance, removeBalance, addBalance } = require('../utils/economyStore');
const { createGame, getGame, updateGame, deleteGame } = require('../utils/gameStore');
const { freshDeck, displayCards, findWinners } = require('../utils/pokerLogic');

// ─── Embeds ───────────────────────────────────────────────────────────────────

function lobbyEmbed(game) {
  const players = Object.values(game.players);
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🃏 Five Card Draw — Lobby')
    .setDescription(`Buy-in: **${game.bet.toLocaleString()} coins**\nHost: <@${game.hostId}>`)
    .addFields({ name: `Players (${players.length}/8)`, value: players.length ? players.map(p => `<@${p.userId}>`).join('\n') : '*Waiting for players...*' });
}

function lobbyButtons(gameId, isFull) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fcd_join_${gameId}`).setLabel('Join').setStyle(ButtonStyle.Success).setDisabled(isFull),
    new ButtonBuilder().setCustomId(`fcd_start_${gameId}`).setLabel('▶️ Start').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`fcd_cancel_${gameId}`).setLabel('❌ Cancel').setStyle(ButtonStyle.Danger),
  );
}

function tableEmbed(game) {
  const players = Object.values(game.players);
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🃏 Five Card Draw — ${game.phase === 'betting1' ? 'Betting Round 1' : game.phase === 'draw' ? 'Draw Phase' : game.phase === 'betting2' ? 'Betting Round 2' : 'Showdown'}`)
    .addFields(
      { name: '💰 Pot', value: `**${game.pot.toLocaleString()} coins**` },
      {
        name: '👥 Players',
        value: players.map(p =>
          `${p.folded ? '~~' : ''}<@${p.userId}>${p.folded ? '~~ (folded)' : ''} — ${game.phase === 'draw' ? (p.swapped ? '✅ Swapped' : '⏳ Deciding...') : `bet: **${(p.roundBet || 0).toLocaleString()}**`}`
        ).join('\n')
      }
    );
}

function bettingButtons(gameId, callAmount) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fcd_peek_${gameId}`).setLabel('👀 Peek at Cards').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`fcd_check_${gameId}`).setLabel(callAmount > 0 ? `Call ${callAmount.toLocaleString()}` : 'Check').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`fcd_raise_${gameId}`).setLabel('Raise').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`fcd_fold_${gameId}`).setLabel('Fold').setStyle(ButtonStyle.Danger),
  );
}

function drawButtons(gameId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fcd_peek_${gameId}`).setLabel('👀 Peek at Cards').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`fcd_swap_${gameId}`).setLabel('🔄 Swap Cards').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`fcd_keepall_${gameId}`).setLabel('✅ Keep All').setStyle(ButtonStyle.Success),
  );
}

// ─── Game Logic ───────────────────────────────────────────────────────────────

async function startGame(game, client) {
  const deck = freshDeck();
  const players = Object.values(game.players);

  for (const p of players) {
    p.hand = [deck.shift(), deck.shift(), deck.shift(), deck.shift(), deck.shift()];
    p.folded = false;
    p.roundBet = 0;
    p.swapped = false;
  }

  updateGame(game.gameId, {
    deck,
    pot: players.length * game.bet,
    phase: 'betting1',
    currentTurn: 0,
    currentBet: 0,
    players: game.players,
  });

  game = getGame(game.gameId);
  const activePlayers = players.filter(p => !p.folded);
  const currentPlayer = activePlayers[game.currentTurn % activePlayers.length];

  await game.lobbyMsg.edit({
    embeds: [tableEmbed(game)],
    components: [bettingButtons(game.gameId, 0)]
  });

  await game.lobbyMsg.channel.send(`🃏 Cards dealt! <@${currentPlayer.userId}> goes first. Click **👀 Peek at Cards** to see your hand.`);
}

async function startDrawPhase(game, client) {
  // Reset swap flags
  for (const p of Object.values(game.players)) {
    p.swapped = false;
    p.roundBet = 0;
  }

  updateGame(game.gameId, { phase: 'draw', currentBet: 0 });
  game = getGame(game.gameId);

  await game.lobbyMsg.edit({
    embeds: [tableEmbed(game)],
    components: [drawButtons(game.gameId)]
  });

  await game.lobbyMsg.channel.send(`🔄 **Draw Phase!** Everyone click **🔄 Swap Cards** to discard up to 3 cards, or **✅ Keep All** to stay.`);
}

async function startBettingRound2(game, client) {
  const activePlayers = Object.values(game.players).filter(p => !p.folded);
  if (activePlayers.length <= 1) return resolveGame(game, client);

  for (const p of Object.values(game.players)) p.roundBet = 0;
  updateGame(game.gameId, { phase: 'betting2', currentTurn: 0, currentBet: 0 });
  game = getGame(game.gameId);

  const currentPlayer = activePlayers[0];

  await game.lobbyMsg.edit({
    embeds: [tableEmbed(game)],
    components: [bettingButtons(game.gameId, 0)]
  });

  await game.lobbyMsg.channel.send(`💰 **Betting Round 2!** <@${currentPlayer.userId}> goes first.`);
}

async function resolveGame(game, client) {
  const activePlayers = Object.values(game.players).filter(p => !p.folded);

  let winnerIds;
  if (activePlayers.length === 1) {
    winnerIds = [activePlayers[0].userId];
  } else {
    winnerIds = findWinners(activePlayers.map(p => ({ userId: p.userId, hand: p.hand })));
  }

  const share = Math.floor(game.pot / winnerIds.length);
  for (const uid of winnerIds) await addBalance(uid, share);

  const winnerStr = winnerIds.map(id => `<@${id}>`).join(', ');
  const resultEmbed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('🃏 Five Card Draw — Showdown!')
    .setDescription(`🏆 Winner(s): ${winnerStr}\n💰 Each wins **${share.toLocaleString()} coins**`)
    .addFields({
      name: '🙌 Hands Revealed',
      value: activePlayers.map(p =>
        `<@${p.userId}>: ${displayCards(p.hand)}`
      ).join('\n')
    });

  await game.lobbyMsg.edit({ embeds: [resultEmbed], components: [] });
  deleteGame(game.gameId);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fivecarddraw')
    .setDescription('Start a No-Limit Five Card Draw poker lobby!')
    .addIntegerOption(o =>
      o.setName('buyin').setDescription('Coin buy-in for all players').setRequired(true).setMinValue(1)
    ),

  async execute(interaction, client) {
    const bet = interaction.options.getInteger('buyin');
    const bal = await getBalance(interaction.user.id);
    if (bal < bet)
      return interaction.reply({ content: `❌ You need **${bet.toLocaleString()}** coins. You have **${bal.toLocaleString()}**.`, flags: 64 });

    await removeBalance(interaction.user.id, bet);

    const gameId = `fcd_${interaction.user.id}_${Date.now()}`;
    const game = createGame({
      gameId, hostId: interaction.user.id, bet, maxPlayers: 8,
      pot: bet, phase: 'lobby', currentTurn: 0, currentBet: 0,
    });
    game.players[interaction.user.id] = { userId: interaction.user.id, hand: [], folded: false, roundBet: 0, swapped: false };

    const msg = await interaction.reply({
      embeds: [lobbyEmbed(game)],
      components: [lobbyButtons(gameId, false)],
      fetchReply: true
    });

    updateGame(gameId, { lobbyMsg: msg });
  },

  lobbyEmbed, lobbyButtons, tableEmbed, bettingButtons, drawButtons,
  startGame, startDrawPhase, startBettingRound2, resolveGame,
};
