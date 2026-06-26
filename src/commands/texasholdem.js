/**
 * texasholdem.js — No-Limit Texas Hold'em for DonutSmpBot
 * Commands: /texasholdem <buyin>
 *
 * Game Flow:
 *  1. Host opens lobby. Up to 8 players join.
 *  2. Host starts. Each player gets 2 secret hole cards.
 *  3. Betting rounds: Pre-Flop → Flop (3 cards) → Turn (1 card) → River (1 card)
 *  4. Showdown: best 5-card hand from 7 cards wins.
 */

const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');
const { getBalance, removeBalance, addBalance } = require('../utils/economyStore');
const { createGame, getGame, updateGame, deleteGame } = require('../utils/gameStore');
const { freshDeck, displayCards, findWinners } = require('../utils/pokerLogic');

const PHASES = ['preflop', 'flop', 'turn', 'river', 'showdown'];

// ─── Embeds ───────────────────────────────────────────────────────────────────

function lobbyEmbed(game) {
  const players = Object.values(game.players);
  return new EmbedBuilder()
    .setColor(0x2D7D46)
    .setTitle('♠️ Texas Hold\'em — Lobby')
    .setDescription(`Buy-in: **${game.bet.toLocaleString()} coins**\nHost: <@${game.hostId}>`)
    .addFields({ name: `Players (${players.length}/8)`, value: players.length ? players.map(p => `<@${p.userId}>`).join('\n') : '*Waiting for players...*' });
}

function lobbyButtons(gameId, isFull) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`th_join_${gameId}`).setLabel('Join').setStyle(ButtonStyle.Success).setDisabled(isFull),
    new ButtonBuilder().setCustomId(`th_start_${gameId}`).setLabel('▶️ Start').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`th_cancel_${gameId}`).setLabel('❌ Cancel').setStyle(ButtonStyle.Danger),
  );
}

function tableEmbed(game) {
  const players = Object.values(game.players);
  const phase = game.phase;
  let communityStr = game.community.length
    ? displayCards(game.community)
    : '*None yet*';

  const fields = [
    { name: '🃏 Community Cards', value: communityStr },
    { name: '💰 Pot', value: `**${game.pot.toLocaleString()} coins**` },
  ];

  const activePlayers = players.filter(p => !p.folded);
  const currentPlayer = activePlayers[game.currentTurn % activePlayers.length];

  fields.push({
    name: '👥 Players',
    value: players.map(p => {
      if (p.folded) return `~~<@${p.userId}>~~ (folded)`;
      const betStr = (p.roundBet || 0) > 0 ? `bet: **${(p.roundBet).toLocaleString()}**` : (p.hasActed ? '✅ checked' : '⏳ waiting');
      return `<@${p.userId}> — ${betStr}`;
    }).join('\n')
  });

  if (currentPlayer && phase !== 'showdown') {
    fields.push({ name: '🎯 Current Turn', value: `<@${currentPlayer.userId}>` });
  }

  return new EmbedBuilder()
    .setColor(0x2D7D46)
    .setTitle(`♠️ Texas Hold'em — ${phase.charAt(0).toUpperCase() + phase.slice(1)}`)
    .addFields(fields);
}

function actionButtons(gameId, callAmount) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`th_peek_${gameId}`).setLabel('👀 Peek at Cards').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`th_check_${gameId}`).setLabel(callAmount > 0 ? `Call ${callAmount.toLocaleString()}` : 'Check').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`th_raise_${gameId}`).setLabel('Raise').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`th_fold_${gameId}`).setLabel('Fold').setStyle(ButtonStyle.Danger),
  );
}

// ─── Game Logic ───────────────────────────────────────────────────────────────

async function startGame(game, client) {
  const deck = freshDeck();
  const players = Object.values(game.players);

  // Deal 2 hole cards to each player
  for (const p of players) {
    p.hand = [deck.shift(), deck.shift()];
    p.folded = false;
    p.roundBet = 0;
    p.hasActed = false;
    p.totalBet = game.bet; // they already paid buy-in
  }

  updateGame(game.gameId, {
    deck,
    community: [],
    pot: players.length * game.bet,
    phase: 'preflop',
    currentTurn: 0,
    currentBet: 0,
    players: game.players,
  });

  game = getGame(game.gameId);
  const activePlayers = players.filter(p => !p.folded);
  const currentPlayer = activePlayers[game.currentTurn % activePlayers.length];

  await game.lobbyMsg.edit({
    embeds: [tableEmbed(game)],
    components: [actionButtons(game.gameId, 0)]
  });

  // Notify current player
  await game.lobbyMsg.channel.send(`<@${currentPlayer.userId}> it's your turn! Click **👀 Peek at Cards** to see your hand, then act.`);
}

async function advancePhase(game, client) {
  const activePlayers = Object.values(game.players).filter(p => !p.folded);

  // If only 1 player left, they win
  if (activePlayers.length === 1) {
    return resolveGame(game, client, activePlayers);
  }

  const phaseIdx = PHASES.indexOf(game.phase);
  const nextPhase = PHASES[phaseIdx + 1];

  if (!nextPhase || nextPhase === 'showdown') {
    return resolveGame(game, client, activePlayers);
  }

  // Reset round bets and acted flags
  for (const p of Object.values(game.players)) { p.roundBet = 0; p.hasActed = false; }

  // Deal community cards
  const newCards = [];
  if (nextPhase === 'flop') { newCards.push(game.deck.shift(), game.deck.shift(), game.deck.shift()); }
  else if (nextPhase === 'turn' || nextPhase === 'river') { newCards.push(game.deck.shift()); }

  const community = [...game.community, ...newCards];

  updateGame(game.gameId, {
    phase: nextPhase,
    community,
    currentTurn: 0,
    currentBet: 0,
  });

  game = getGame(game.gameId);
  const currentPlayer = activePlayers[0];

  await game.lobbyMsg.edit({
    embeds: [tableEmbed(game)],
    components: [actionButtons(game.gameId, 0)]
  });

  await game.lobbyMsg.channel.send(`🃏 **${nextPhase.charAt(0).toUpperCase() + nextPhase.slice(1)}!** <@${currentPlayer.userId}> goes first.`);
}

async function resolveGame(game, client, activePlayers) {
  const allCommunity = game.community;

  let winnerIds;
  if (activePlayers.length === 1) {
    winnerIds = [activePlayers[0].userId];
  } else {
    // Build hand arrays: hole cards + community cards
    const hands = activePlayers.map(p => ({
      userId: p.userId,
      hand: [...p.hand, ...allCommunity]
    }));
    winnerIds = findWinners(hands);
  }

  const share = Math.floor(game.pot / winnerIds.length);
  for (const uid of winnerIds) await addBalance(uid, share);

  const winnerStr = winnerIds.map(id => `<@${id}>`).join(', ');
  const resultEmbed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('♠️ Texas Hold\'em — Showdown!')
    .setDescription(`🏆 Winner(s): ${winnerStr}\n💰 Each wins **${share.toLocaleString()} coins**`)
    .addFields(
      { name: '🃏 Community Cards', value: allCommunity.length ? displayCards(allCommunity) : '*None*' },
      {
        name: '🙌 Hands',
        value: activePlayers.map(p =>
          `<@${p.userId}>: ${displayCards(p.hand)}`
        ).join('\n')
      }
    );

  await game.lobbyMsg.edit({ embeds: [resultEmbed], components: [] });
  deleteGame(game.gameId);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('texasholdem')
    .setDescription('Start a No-Limit Texas Hold\'em poker lobby!')
    .addIntegerOption(o =>
      o.setName('buyin').setDescription('Coin buy-in for all players').setRequired(true).setMinValue(1)
    ),

  async execute(interaction, client) {
    const bet = interaction.options.getInteger('buyin');
    const bal = await getBalance(interaction.user.id);
    if (bal < bet)
      return interaction.reply({ content: `❌ You need **${bet.toLocaleString()}** coins. You have **${bal.toLocaleString()}**.`, flags: 64 });

    await removeBalance(interaction.user.id, bet);

    const gameId = `th_${interaction.user.id}_${Date.now()}`;
    const game = createGame({
      gameId, hostId: interaction.user.id, bet, maxPlayers: 8,
      community: [], pot: bet, phase: 'lobby', currentTurn: 0, currentBet: 0,
    });
    game.players[interaction.user.id] = { userId: interaction.user.id, hand: [], folded: false, roundBet: 0 };

    const msg = await interaction.reply({
      embeds: [lobbyEmbed(game)],
      components: [lobbyButtons(gameId, false)],
      fetchReply: true
    });

    updateGame(gameId, { lobbyMsg: msg });
  },

  lobbyEmbed, lobbyButtons, tableEmbed, actionButtons, startGame, advancePhase, resolveGame,
};
