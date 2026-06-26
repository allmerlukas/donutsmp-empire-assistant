const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { getBalance, removeBalance, addBalance } = require('../utils/economyStore');
const { createGame, getGame, updateGame, deleteGame, getGameByUser } = require('../utils/gameStore');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newGameId() {
  return 'rr' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

/** Returns the starting number of chambers for a fresh cylinder */
function newRevolver() {
  return 6;
}

/** True Russian Roulette probability: 1/chambersRemaining chance of hitting */
function pullHits(chambersRemaining) {
  return Math.random() < (1 / chambersRemaining);
}

// ─── Embeds ───────────────────────────────────────────────────────────────────

function lobbyEmbed(game) {
  const playerList = Object.values(game.players);
  const lines = playerList.length
    ? playerList.map((p, i) => `\`${i + 1}.\` <@${p.userId}>`)
    : ['*Waiting for players…*'];

  return new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('🔫 Russian Roulette — Lobby')
    .setDescription(
      `**Bet:** ${game.bet.toLocaleString()} coins per player\n` +
      `**Max players:** 6\n\n` +
      `**Players joined (${playerList.length}/6):**\n${lines.join('\n')}`
    )
    .setFooter({ text: 'Join to pay the bet • Host can start or cancel' })
    .setTimestamp();
}

function lobbyButtons(gameId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`rr_join_${gameId}`)
        .setLabel('Join Game')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId(`rr_start_${gameId}`)
        .setLabel('Start Game')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('▶️'),
      new ButtonBuilder()
        .setCustomId(`rr_cancel_${gameId}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌'),
    ),
  ];
}

function turnEmbed(game) {
  const alivePlayers = Object.values(game.players).filter(p => !p.eliminated);
  const currentPlayer = alivePlayers[game.currentTurn % alivePlayers.length];

  const statusLines = Object.values(game.players).map(p => {
    const icon = p.eliminated ? '💀' : '❤️';
    return `${icon} <@${p.userId}>`;
  });

  const shotsFired = 6 - game.chambersRemaining;
  const chambersLeft = game.chambersRemaining;

  return new EmbedBuilder()
    .setColor(0xFFA500)
    .setTitle('🔫 Russian Roulette — In Progress')
    .setDescription(
      `**🎯 Current Turn:** <@${currentPlayer.userId}>\n` +
      `**🪁 Players Alive:** ${alivePlayers.length}\n` +
      `**💰 Pot:** ${game.pot.toLocaleString()} coins\n` +
      `**🔄 Chamber:** ${shotsFired + 1} of 6 (${chambersLeft} remaining — odds: **${Math.round(100/chambersLeft)}%**)\n\n` +
      `**Players:**\n${statusLines.join('\n')}`
    )
    .setFooter({ text: 'The bullet is hidden somewhere in the 6 chambers…' })
    .setTimestamp();
}

function pullTriggerRow(gameId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`rr_pull_${gameId}`)
      .setLabel('Pull Trigger')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔫'),
  );
}

// ─── Game Logic ───────────────────────────────────────────────────────────────

/** Delete the old game message and send a fresh one at the bottom of chat */
async function resendMsg(game, gameId, embed, components = []) {
  await game.lobbyMsg.delete().catch(() => {});
  const newMsg = await game.lobbyMsg.channel.send({ embeds: [embed], components });
  updateGame(gameId, { lobbyMsg: newMsg });
  return newMsg;
}

/** Advance the turn after a surviving pull. Handles cylinder reshuffle automatically. */
async function advanceTurn(game) {
  const gameId = game.gameId;
  let chambersRemaining = game.chambersRemaining - 1;
  let reshuffled = false;

  // If we've gone through all 6 chambers without a hit — reshuffle
  if (chambersRemaining <= 0) {
    chambersRemaining = 6;
    reshuffled = true;
  }

  updateGame(gameId, { chambersRemaining, reshuffled });

  // Advance to next alive player
  const alivePlayers = Object.values(getGame(gameId).players).filter(p => !p.eliminated);
  const nextTurn = (game.currentTurn + 1) % alivePlayers.length;
  updateGame(gameId, { currentTurn: nextTurn });
}

/** Called when a player pulls the trigger. Returns { hit: bool } */
async function processPull(game) {
  return { hit: pullHits(game.chambersRemaining) };
}

/** Handle the full game-over when only 1 player remains */
async function resolveWinner(game) {
  const gameId = game.gameId;
  const winner = Object.values(game.players).find(p => !p.eliminated);
  if (!winner) return;

  await addBalance(winner.userId, game.pot);

  const resultEmbed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('🏆 Russian Roulette — We Have a Survivor!')
    .setDescription(
      `<@${winner.userId}> is the **last one standing** and wins the entire pot!\n\n` +
      `💰 **Winnings:** +${game.pot.toLocaleString()} coins`
    )
    .setFooter({ text: 'Everybody else met their fate…' })
    .setTimestamp();

  await game.lobbyMsg.channel.send({ embeds: [resultEmbed], components: [] }).catch(() => {});
  await game.lobbyMsg.delete().catch(() => {});
  deleteGame(gameId);
}

// ─── Exported handler (called by interactionCreate) ──────────────────────────

/**
 * handleRussianRoulette — routes button interactions for rr_* customIds
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {object} client
 * @param {string} action  — join | start | cancel | pull
 * @param {string} gameId
 */
async function handleRussianRoulette(interaction, client, action, gameId) {
  let game = getGame(gameId);

  // ── JOIN ──────────────────────────────────────────────────────────────────
  if (action === 'join') {
    if (!game || game.phase !== 'lobby')
      return interaction.reply({ content: '❌ This lobby is no longer open.', flags: 64 });
    if (game.players[interaction.user.id])
      return interaction.reply({ content: '❌ You already joined this game.', flags: 64 });
    if (Object.keys(game.players).length >= 6)
      return interaction.reply({ content: '❌ The revolver only has 6 chambers — lobby is full!', flags: 64 });

    const bal = await getBalance(interaction.user.id);
    if (bal < game.bet)
      return interaction.reply({
        content: `❌ You need **${game.bet.toLocaleString()} coins** to join. You have **${bal.toLocaleString()}**.`,
        flags: 64,
      });

    await removeBalance(interaction.user.id, game.bet);
    game.players[interaction.user.id] = { userId: interaction.user.id, eliminated: false };
    updateGame(gameId, { pot: game.pot + game.bet });

    await interaction.update({ embeds: [lobbyEmbed(getGame(gameId))], components: lobbyButtons(gameId) });
  }

  // ── START ─────────────────────────────────────────────────────────────────
  else if (action === 'start') {
    if (!game)
      return interaction.reply({ content: '❌ Game not found.', flags: 64 });
    if (game.hostId !== interaction.user.id)
      return interaction.reply({ content: '❌ Only the host can start the game.', flags: 64 });
    if (game.phase !== 'lobby')
      return interaction.reply({ content: '❌ The game has already started.', flags: 64 });
    if (Object.keys(game.players).length < 2)
      return interaction.reply({ content: '❌ You need at least **2 players** to start.', flags: 64 });

    const bulletChamber = newRevolver();
    updateGame(gameId, {
      phase: 'playing',
      chambersRemaining: bulletChamber, // 6 chambers
      currentTurn: 0,
      reshuffled: false,
    });

    game = getGame(gameId);

    await interaction.deferUpdate();

    const alivePlayers = Object.values(game.players).filter(p => !p.eliminated);
    const currentPlayer = alivePlayers[game.currentTurn];

    const startEmbed = new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle('🔫 Russian Roulette — The Game Begins!')
      .setDescription(
        `The revolver has been loaded with **1 bullet** in a random chamber.\n` +
        `**${Object.keys(game.players).length}** players are competing for **${game.pot.toLocaleString()} coins**!\n\n` +
        `**First up:** <@${currentPlayer.userId}> — do you feel lucky?`
      )
      .setFooter({ text: 'Good luck. You\'ll need it.' })
      .setTimestamp();

    await game.lobbyMsg.edit({ embeds: [startEmbed], components: [pullTriggerRow(gameId)] }).catch(() => {});

    // Privately tell the first player which chamber they're on
    await game.lobbyMsg.channel.send({
      content: `<@${currentPlayer.userId}> — 🔫 You're about to pull **chamber 1 of 6**. Current odds: **17%**. Do you feel lucky?`,
    }).catch(() => {});
  }

  // ── CANCEL ────────────────────────────────────────────────────────────────
  else if (action === 'cancel') {
    if (!game)
      return interaction.reply({ content: '❌ Game not found.', flags: 64 });
    if (game.hostId !== interaction.user.id)
      return interaction.reply({ content: '❌ Only the host can cancel.', flags: 64 });
    if (game.phase === 'playing')
      return interaction.reply({ content: '❌ You cannot cancel a game in progress.', flags: 64 });

    for (const p of Object.values(game.players))
      await addBalance(p.userId, game.bet);

    deleteGame(gameId);

    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('❌ Game Cancelled')
          .setDescription('All bets have been refunded.')
          .setTimestamp(),
      ],
      components: [],
    });
  }

  // ── PULL TRIGGER ──────────────────────────────────────────────────────────
  else if (action === 'pull') {
    if (!game || game.phase !== 'playing')
      return interaction.reply({ content: '❌ No active game.', flags: 64 });

    const alivePlayers = Object.values(game.players).filter(p => !p.eliminated);
    const currentPlayer = alivePlayers[game.currentTurn % alivePlayers.length];

    if (currentPlayer.userId !== interaction.user.id)
      return interaction.reply({
        content: `❌ It's not your turn! Wait for <@${currentPlayer.userId}>.`,
        flags: 64,
      });

    await interaction.deferUpdate();

    const { hit } = await processPull(game);

    if (hit) {
      // ── ELIMINATED ───────────────────────────────────────────────────────
      game.players[interaction.user.id].eliminated = true;

      const stillAlive = Object.values(game.players).filter(p => !p.eliminated);

      const bangEmbed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('💥 BANG! The Bullet Found Its Mark!')
        .setDescription(
          `<@${interaction.user.id}> pulled the trigger on **chamber ${game.chamberPosition + 1}** — and met their end!\n\n` +
          `💀 **Eliminated:** <@${interaction.user.id}>\n` +
          `❤️ **Survivors:** ${stillAlive.length}\n` +
          `💰 **Pot:** ${game.pot.toLocaleString()} coins\n\n` +
          `${stillAlive.length > 1 ? 'The revolver is being reloaded with a fresh bullet…' : ''}`
        )
        .setFooter({ text: 'Their bet stays in the pot.' })
        .setTimestamp();

      if (stillAlive.length <= 1) {
        // Game over — send final bang at bottom
        await resendMsg(game, gameId, bangEmbed, []);
        await resolveWinner(getGame(gameId));
        return;
      }

      // Reshuffle after an elimination — fresh cylinder
      updateGame(gameId, {
        chambersRemaining: 6,
        currentTurn: game.currentTurn % stillAlive.length,
      });

      game = getGame(gameId);
      const nextAlive = Object.values(game.players).filter(p => !p.eliminated);
      const nextPlayer = nextAlive[game.currentTurn % nextAlive.length];

      await resendMsg(game, gameId, bangEmbed, []);

      // Brief pause for drama before showing the next turn
      await new Promise(r => setTimeout(r, 2000));

      game = getGame(gameId);
      const nextAlive2 = Object.values(game.players).filter(p => !p.eliminated);
      const nextPlayer2 = nextAlive2[game.currentTurn % nextAlive2.length];
      await resendMsg(game, gameId, turnEmbed(game), [pullTriggerRow(gameId)]);
      await game.lobbyMsg.channel.send({
        content: `<@${nextPlayer2.userId}> — 🔫 You're up! You're pulling **chamber 1 of 6** on a freshly loaded revolver.`,
      }).catch(() => {});

    } else {
      // ── SURVIVED ─────────────────────────────────────────────────────────
      const chamberNum = game.chamberPosition + 1; // 1-indexed, the chamber they just pulled

      const clickEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('😅 *Click* — You Survived!')
        .setDescription(
          `<@${interaction.user.id}> pulled the trigger on **chamber ${chamberNum} of 6**…\n\n` +
          `**Nothing happened.** The luck holds — for now.\n\n` +
          `💰 **Pot:** ${game.pot.toLocaleString()} coins`
        )
        .setTimestamp();

      await resendMsg(game, gameId, clickEmbed, []);

      // Advance turn
      await advanceTurn(game);
      game = getGame(gameId);

      const nextAlive = Object.values(game.players).filter(p => !p.eliminated);
      const nextPlayer = nextAlive[game.currentTurn % nextAlive.length];
      const nextChamber = game.chamberPosition + 1;

      // Brief pause for drama
      await new Promise(r => setTimeout(r, 1500));

      if (game.reshuffled) {
        await game.lobbyMsg.channel.send({
          content: `🔄 All 6 chambers fired without a hit — **the revolver is being reshuffled** with a new bullet!`,
        }).catch(() => {});
      }

      await resendMsg(game, gameId, turnEmbed(game), [pullTriggerRow(gameId)]);
      await game.lobbyMsg.channel.send({
        content: `<@${nextPlayer.userId}> — 🔫 You're up! Pulling **chamber ${nextChamber} of 6**.`,
      }).catch(() => {});
    }
  }
}

// ─── Module exports ───────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('russianroulette')
    .setDescription('Open a multiplayer Russian Roulette lobby! Last one alive wins the pot.')
    .addIntegerOption(o =>
      o.setName('bet')
        .setDescription('Amount each player must pay to enter')
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction, client) {
    const bet = interaction.options.getInteger('bet');

    if (getGameByUser(interaction.user.id))
      return interaction.reply({ content: '❌ You already have an active game.', flags: 64 });

    const id = newGameId();
    const game = createGame({
      gameId: id,
      type: 'russianroulette',
      hostId: interaction.user.id,
      bet,
      pot: 0,
      maxPlayers: 6,
      channelId: interaction.channelId,
      bulletChamber: 0,
      chamberPosition: 0,
      currentTurn: 0,
      reshuffled: false,
    });

    // Host auto-joins
    const bal = await getBalance(interaction.user.id);
    if (bal < bet)
      return interaction.reply({ content: `❌ You need **${bet.toLocaleString()} coins** to host. You have **${bal.toLocaleString()}**.`, flags: 64 });

    await removeBalance(interaction.user.id, bet);
    game.players[interaction.user.id] = { userId: interaction.user.id, eliminated: false };
    updateGame(id, { pot: bet });

    await interaction.reply({ embeds: [lobbyEmbed(getGame(id))], components: lobbyButtons(id) });
    const msg = await interaction.fetchReply();
    updateGame(id, { lobbyMsg: msg });
  },

  // Exported for interactionCreate.js
  handleRussianRoulette,
  lobbyEmbed,
  lobbyButtons,
};
