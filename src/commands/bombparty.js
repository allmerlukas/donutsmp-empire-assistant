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
  return 'bp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

/** Random fuse duration in milliseconds (12–35 seconds) */
function randomFuse() {
  return (Math.floor(Math.random() * 24) + 12) * 1000; // 12–35 s
}

// ─── Embeds ───────────────────────────────────────────────────────────────────

function lobbyEmbed(game) {
  const playerIds = game.playerOrder ?? [];
  const lines = playerIds.length
    ? playerIds.map((id, i) => `\`${i + 1}.\` <@${id}>`)
    : ['*Waiting for players…*'];

  return new EmbedBuilder()
    .setColor(0xFF6B00)
    .setTitle('💣 Bomb Party — Lobby')
    .setDescription(
      `**Bet:** ${game.bet.toLocaleString()} coins per player\n` +
      `**Pot:** ${game.pot.toLocaleString()} coins\n\n` +
      `**Players joined (${playerIds.length}):**\n${lines.join('\n')}`
    )
    .setFooter({ text: 'Join to pay the bet • Host can start or cancel • Minimum 2 players' })
    .setTimestamp();
}

function lobbyButtons(gameId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`bp_join_${gameId}`)
        .setLabel('Join Game')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId(`bp_start_${gameId}`)
        .setLabel('Start Game')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('▶️'),
      new ButtonBuilder()
        .setCustomId(`bp_cancel_${gameId}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌'),
    ),
  ];
}

function gameEmbed(game) {
  const statusLines = game.playerOrder.map(id => {
    const alive = game.alivePlayers[id];
    const icon = alive ? '❤️' : '💀';
    const bombMark = game.bombHolder === id ? ' 💣' : '';
    return `${icon} <@${id}>${bombMark}`;
  });

  const holderLine = game.bombHolder
    ? `**💣 Bomb Holder:** <@${game.bombHolder}>\n`
    : '';

  return new EmbedBuilder()
    .setColor(0xFF4500)
    .setTitle('💣 Bomb Party — In Progress')
    .setDescription(
      `${holderLine}` +
      `**💰 Pot:** ${game.pot.toLocaleString()} coins\n` +
      `**👥 Alive:** ${Object.values(game.alivePlayers).filter(Boolean).length}\n\n` +
      `**Players:**\n${statusLines.join('\n')}`
    )
    .setFooter({ text: 'The fuse is burning… pass it before it blows!' })
    .setTimestamp();
}

function bombButtons(gameId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`bp_pass_${gameId}`)
        .setLabel('💣 Pass Bomb!')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`bp_fold_${gameId}`)
        .setLabel('🏳️ Fold')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function explosionEmbed(game, eliminatedId) {
  const statusLines = game.playerOrder.map(id => {
    const alive = game.alivePlayers[id];
    return `${alive ? '❤️' : '💀'} <@${id}>`;
  });

  const aliveCount = Object.values(game.alivePlayers).filter(Boolean).length;

  return new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('💥 BOOM! The Bomb Exploded!')
    .setDescription(
      `<@${eliminatedId}> held the bomb too long and got **blown up**!\n\n` +
      `💀 **Eliminated:** <@${eliminatedId}>\n` +
      `❤️ **Survivors:** ${aliveCount}\n` +
      `💰 **Pot:** ${game.pot.toLocaleString()} coins\n\n` +
      `**Players:**\n${statusLines.join('\n')}`
    )
    .setFooter({ text: 'Their bet stays in the pot.' })
    .setTimestamp();
}

function foldEmbed(game, foldedId) {
  const statusLines = game.playerOrder.map(id => {
    const alive = game.alivePlayers[id];
    return `${alive ? '❤️' : '💀'} <@${id}>`;
  });

  const aliveCount = Object.values(game.alivePlayers).filter(Boolean).length;

  return new EmbedBuilder()
    .setColor(0xFFA500)
    .setTitle('🏳️ Player Folded!')
    .setDescription(
      `<@${foldedId}> chose to **fold** and walk away (losing their bet).\n\n` +
      `💀 **Eliminated:** <@${foldedId}>\n` +
      `❤️ **Survivors:** ${aliveCount}\n` +
      `💰 **Pot:** ${game.pot.toLocaleString()} coins\n\n` +
      `**Players:**\n${statusLines.join('\n')}`
    )
    .setFooter({ text: 'Their bet stays in the pot.' })
    .setTimestamp();
}

function winEmbed(game, winnerId) {
  return new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('🏆 Bomb Party — We Have a Winner!')
    .setDescription(
      `<@${winnerId}> is the **last one standing** and survives the blast!\n\n` +
      `💰 **Winnings:** +${game.pot.toLocaleString()} coins`
    )
    .setFooter({ text: 'Everyone else got blown up. Better luck next time.' })
    .setTimestamp();
}

// ─── Game Logic ───────────────────────────────────────────────────────────────

/**
 * Delete the old game message and send a new one at the bottom of the channel.
 * Updates `game.lobbyMsg` in the store.
 */
async function resendMsg(game, gameId, embed, components = []) {
  await game.lobbyMsg.delete().catch(() => {});
  const channel = game.lobbyMsg.channel;
  const newMsg = await channel.send({ embeds: [embed], components });
  updateGame(gameId, { lobbyMsg: newMsg });
  return newMsg;
}

/**
 * Get the next alive player after `currentHolderId` in playerOrder (wraps around).
 */
function nextAlivePlayer(game, currentHolderId) {
  const { playerOrder, alivePlayers } = game;
  const idx = playerOrder.indexOf(currentHolderId);
  const len = playerOrder.length;
  for (let i = 1; i <= len; i++) {
    const candidate = playerOrder[(idx + i) % len];
    if (alivePlayers[candidate]) return candidate;
  }
  return null; // Should never happen if ≥2 alive
}

/**
 * Arm a new fuse for the current bomb holder.
 * Clears any existing fuse first.
 * @param {import('discord.js').Client} client
 * @param {string} gameId
 */
function armFuse(client, gameId) {
  const game = getGame(gameId);
  if (!game) return;

  // Clear old fuse if any
  if (game.fuseTimeout != null) clearTimeout(game.fuseTimeout);

  const delay = randomFuse();
  const timeoutId = setTimeout(() => handleExplosion(client, gameId), delay);
  updateGame(gameId, { fuseTimeout: timeoutId });
}

/**
 * Called when the fuse runs out — eliminate the current bomb holder.
 * @param {import('discord.js').Client} client
 * @param {string} gameId
 */
async function handleExplosion(client, gameId) {
  const game = getGame(gameId);
  if (!game || game.phase !== 'playing') return;

  const eliminatedId = game.bombHolder;
  if (!eliminatedId) return;

  // Eliminate the holder
  game.alivePlayers[eliminatedId] = false;

  const aliveIds = game.playerOrder.filter(id => game.alivePlayers[id]);

  const boom = explosionEmbed(game, eliminatedId);

  // Send explosion message at bottom
  await resendMsg(game, gameId, boom, []);

  if (aliveIds.length <= 1) {
    // Game over
    const winnerId = aliveIds[0] ?? null;
    if (winnerId) {
      await addBalance(winnerId, game.pot);
      const channel = getGame(gameId)?.lobbyMsg?.channel;
      if (channel) {
        await channel.send({ embeds: [winEmbed(game, winnerId)], components: [] }).catch(() => {});
      }
    }
    const currentGame = getGame(gameId);
    if (currentGame?.lobbyMsg) {
      await currentGame.lobbyMsg.delete().catch(() => {});
    }
    deleteGame(gameId);
    return;
  }

  // Pass the bomb to the next alive player and arm a new fuse
  const nextHolder = nextAlivePlayer(game, eliminatedId);
  updateGame(gameId, { bombHolder: nextHolder });

  // Brief dramatic pause before showing the new game state
  await new Promise(r => setTimeout(r, 1500));

  const freshGame = getGame(gameId);
  if (!freshGame) return;

  await resendMsg(freshGame, gameId, gameEmbed(freshGame), bombButtons(gameId));

  // Ping the new holder
  const channel = getGame(gameId)?.lobbyMsg?.channel;
  if (channel) {
    await channel.send({
      content: `<@${nextHolder}> — 💣 The bomb is now in **your** hands! Pass it quick!`,
    }).catch(() => {});
  }

  armFuse(client, gameId);
}

// ─── Exported handler (called by interactionCreate) ──────────────────────────

/**
 * handleBombParty — routes all bp_* button interactions.
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {import('discord.js').Client} client
 * @param {string} action  — join | start | cancel | pass | fold
 * @param {string} gameId
 */
async function handleBombParty(interaction, client, action, gameId) {
  let game = getGame(gameId);

  // ── JOIN ──────────────────────────────────────────────────────────────────
  if (action === 'join') {
    if (!game || game.phase !== 'lobby')
      return interaction.reply({ content: '❌ This lobby is no longer open.', flags: 64 });
    if (game.alivePlayers[interaction.user.id] !== undefined)
      return interaction.reply({ content: '❌ You already joined this game.', flags: 64 });

    const bal = await getBalance(interaction.user.id);
    if (bal < game.bet)
      return interaction.reply({
        content: `❌ You need **${game.bet.toLocaleString()} coins** to join. You have **${bal.toLocaleString()}**.`,
        flags: 64,
      });

    await removeBalance(interaction.user.id, game.bet);
    game.playerOrder.push(interaction.user.id);
    game.alivePlayers[interaction.user.id] = true;
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
    if (game.playerOrder.length < 2)
      return interaction.reply({ content: '❌ You need at least **2 players** to start.', flags: 64 });

    // Pick a random starting bomb holder
    const startIdx = Math.floor(Math.random() * game.playerOrder.length);
    const firstHolder = game.playerOrder[startIdx];

    updateGame(gameId, {
      phase: 'playing',
      bombHolder: firstHolder,
    });

    game = getGame(gameId);

    await interaction.deferUpdate();

    // Replace lobby message with game embed at current position (don't resend yet)
    await game.lobbyMsg.edit({ embeds: [gameEmbed(game)], components: bombButtons(gameId) }).catch(() => {});

    // Ping the first holder
    await game.lobbyMsg.channel.send({
      content: `<@${firstHolder}> — 💣 The bomb starts with **you**! Pass it before it blows!`,
    }).catch(() => {});

    // Arm the first fuse
    armFuse(client, gameId);
  }

  // ── CANCEL ────────────────────────────────────────────────────────────────
  else if (action === 'cancel') {
    if (!game)
      return interaction.reply({ content: '❌ Game not found.', flags: 64 });
    if (game.hostId !== interaction.user.id)
      return interaction.reply({ content: '❌ Only the host can cancel.', flags: 64 });
    if (game.phase === 'playing')
      return interaction.reply({ content: '❌ You cannot cancel a game in progress.', flags: 64 });

    // Refund all players
    for (const id of game.playerOrder)
      await addBalance(id, game.bet);

    deleteGame(gameId);

    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('❌ Bomb Party Cancelled')
          .setDescription('All bets have been refunded. Nobody exploded today.')
          .setTimestamp(),
      ],
      components: [],
    });
  }

  // ── PASS ──────────────────────────────────────────────────────────────────
  else if (action === 'pass') {
    if (!game || game.phase !== 'playing')
      return interaction.reply({ content: '❌ No active game found.', flags: 64 });
    if (game.bombHolder !== interaction.user.id)
      return interaction.reply({
        content: `❌ You don't have the bomb! <@${game.bombHolder}> is holding it.`,
        flags: 64,
      });

    // Disarm current fuse
    if (game.fuseTimeout != null) clearTimeout(game.fuseTimeout);

    const nextHolder = nextAlivePlayer(game, interaction.user.id);
    if (!nextHolder) {
      // Shouldn't happen, but handle gracefully
      return interaction.reply({ content: '❌ Something went wrong finding the next player.', flags: 64 });
    }

    updateGame(gameId, { bombHolder: nextHolder });
    game = getGame(gameId);

    await interaction.deferUpdate();

    // Resend game embed at bottom with new holder
    await resendMsg(game, gameId, gameEmbed(game), bombButtons(gameId));

    // Ping new holder
    const channel = getGame(gameId)?.lobbyMsg?.channel;
    if (channel) {
      await channel.send({
        content: `<@${nextHolder}> — 💣 The bomb has been passed to **you**! Quick, pass it!`,
      }).catch(() => {});
    }

    // Arm a new fuse for the new holder
    armFuse(client, gameId);
  }

  // ── FOLD ──────────────────────────────────────────────────────────────────
  else if (action === 'fold') {
    if (!game || game.phase !== 'playing')
      return interaction.reply({ content: '❌ No active game found.', flags: 64 });
    if (game.bombHolder !== interaction.user.id)
      return interaction.reply({
        content: `❌ You can only fold when you're holding the bomb.`,
        flags: 64,
      });

    // Disarm current fuse
    if (game.fuseTimeout != null) clearTimeout(game.fuseTimeout);

    const foldedId = interaction.user.id;

    // Eliminate the folder
    game.alivePlayers[foldedId] = false;

    const aliveIds = game.playerOrder.filter(id => game.alivePlayers[id]);

    await interaction.deferUpdate();

    const foldMsg = foldEmbed(game, foldedId);
    await resendMsg(game, gameId, foldMsg, []);

    if (aliveIds.length <= 1) {
      // Game over
      const winnerId = aliveIds[0] ?? null;
      if (winnerId) {
        await addBalance(winnerId, game.pot);
        const channel = getGame(gameId)?.lobbyMsg?.channel;
        if (channel) {
          await channel.send({ embeds: [winEmbed(game, winnerId)], components: [] }).catch(() => {});
        }
      }
      const currentGame = getGame(gameId);
      if (currentGame?.lobbyMsg) {
        await currentGame.lobbyMsg.delete().catch(() => {});
      }
      deleteGame(gameId);
      return;
    }

    // Pass bomb to next alive player and arm new fuse
    const nextHolder = nextAlivePlayer(game, foldedId);
    updateGame(gameId, { bombHolder: nextHolder });

    // Brief pause for drama
    await new Promise(r => setTimeout(r, 1500));

    const freshGame = getGame(gameId);
    if (!freshGame) return;

    await resendMsg(freshGame, gameId, gameEmbed(freshGame), bombButtons(gameId));

    const channel = getGame(gameId)?.lobbyMsg?.channel;
    if (channel) {
      await channel.send({
        content: `<@${nextHolder}> — 💣 The bomb is now in **your** hands (after a fold)! Pass it quick!`,
      }).catch(() => {});
    }

    armFuse(client, gameId);
  }
}

// ─── Module exports ───────────────────────────────────────────────────────────

const data = new SlashCommandBuilder()
  .setName('bombparty')
  .setDescription('Start a Bomb Party! Pass the bomb before the fuse runs out — last survivor wins the pot.')
  .addIntegerOption(o =>
    o.setName('bet')
      .setDescription('Amount each player must pay to enter')
      .setRequired(true)
      .setMinValue(1)
  );

async function execute(interaction, client) {
  const bet = interaction.options.getInteger('bet');

  if (getGameByUser(interaction.user.id))
    return interaction.reply({ content: '❌ You already have an active game.', flags: 64 });

  const bal = await getBalance(interaction.user.id);
  if (bal < bet)
    return interaction.reply({
      content: `❌ You need **${bet.toLocaleString()} coins** to host. You have **${bal.toLocaleString()}**.`,
      flags: 64,
    });

  const id = newGameId();
  const game = createGame({
    gameId: id,
    type: 'bombparty',
    hostId: interaction.user.id,
    bet,
    pot: 0,
    channelId: interaction.channelId,
    // Bomb-party-specific state
    playerOrder: [],    // ordered list of all userIds (alive + dead)
    alivePlayers: {},   // userId -> boolean (true = alive)
    bombHolder: null,   // userId of current holder
    fuseTimeout: null,  // setTimeout ID (clearable)
  });

  // Host auto-joins
  await removeBalance(interaction.user.id, bet);
  game.playerOrder.push(interaction.user.id);
  game.alivePlayers[interaction.user.id] = true;
  updateGame(id, { pot: bet });

  await interaction.reply({ embeds: [lobbyEmbed(getGame(id))], components: lobbyButtons(id) });
  const msg = await interaction.fetchReply();
  updateGame(id, { lobbyMsg: msg });
}

module.exports = {
  data,
  execute,
  handleBombParty,
  lobbyEmbed,
  lobbyButtons,
};
