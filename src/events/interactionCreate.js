const { EmbedBuilder } = require('discord.js');
const { getBalance, removeBalance, addBalance } = require('../utils/economyStore');
const { getGame, updateGame, deleteGame }       = require('../utils/gameStore');
const { handTotal, isBlackjack }               = require('../utils/cardUtils');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {

    // ─── Slash commands ───────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction, client);
      } catch (err) {
        console.error(`[Command Error] /${interaction.commandName}:`, err);
        const msg = { content: '❌ Something went wrong.', flags: 64 };
        if (interaction.replied || interaction.deferred)
          await interaction.followUp(msg).catch(() => {});
        else
          await interaction.reply(msg).catch(() => {});
      }
      return;
    }

    // ─── Blackjack buttons ────────────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('bj_')) {
      const parts  = interaction.customId.split('_'); // ['bj', action, gameId]
      const action = parts[1];
      const gameId = parts[2];
      await handleBlackjack(interaction, client, action, gameId);
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────

async function handleBlackjack(interaction, client, action, gameId) {
  const {
    startGame, checkAllDone,
    lobbyEmbed, lobbyButtons,
    playerHandEmbed, hitStandRow, showHandRow,
  } = require('../commands/blackjack');

  const game = getGame(gameId);

  // ── JOIN ──────────────────────────────────────────────────────────────────
  if (action === 'join') {
    if (!game || game.phase !== 'lobby')
      return interaction.reply({ content: '❌ This lobby is no longer open.', flags: 64 });
    if (game.players[interaction.user.id])
      return interaction.reply({ content: '❌ You already joined this game.', flags: 64 });
    if (Object.keys(game.players).length >= game.maxPlayers)
      return interaction.reply({ content: '❌ The game is full.', flags: 64 });

    const bal = getBalance(interaction.user.id);
    if (bal < game.bet)
      return interaction.reply({
        content: `❌ You need **${game.bet.toLocaleString()} coins** to join. You have **${bal.toLocaleString()}**.`,
        flags: 64
      });

    removeBalance(interaction.user.id, game.bet);
    game.players[interaction.user.id] = {
      userId: interaction.user.id, hand: [], status: 'waiting', done: false
    };

    const isFull = Object.keys(game.players).length >= game.maxPlayers;
    await interaction.update({
      embeds:     [lobbyEmbed(game)],
      components: [lobbyButtons(gameId, isFull)]
    });
  }

  // ── START ─────────────────────────────────────────────────────────────────
  else if (action === 'start') {
    if (!game)
      return interaction.reply({ content: '❌ Game not found.', flags: 64 });
    if (game.hostId !== interaction.user.id)
      return interaction.reply({ content: '❌ Only the host can start the game.', flags: 64 });
    if (game.phase !== 'lobby')
      return interaction.reply({ content: '❌ The game has already started.', flags: 64 });

    await interaction.deferUpdate();
    await startGame(game, client);
  }

  // ── CANCEL ────────────────────────────────────────────────────────────────
  else if (action === 'cancel') {
    if (!game)
      return interaction.reply({ content: '❌ Game not found.', flags: 64 });
    if (game.hostId !== interaction.user.id)
      return interaction.reply({ content: '❌ Only the host can cancel.', flags: 64 });

    // Refund all players
    for (const p of Object.values(game.players))
      addBalance(p.userId, game.bet);

    deleteGame(gameId);

    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('❌ Game Cancelled')
          .setDescription('All bets have been refunded.')
          .setTimestamp()
      ],
      components: []
    });
  }

  // ── SHOW HAND (ephemeral) ─────────────────────────────────────────────────
  else if (action === 'hand') {
    if (!game || game.phase !== 'playing')
      return interaction.reply({ content: '❌ No active game.', flags: 64 });

    const player = game.players[interaction.user.id];
    if (!player)
      return interaction.reply({ content: '❌ You are not in this game.', flags: 64 });

    // Already done — just show final hand
    if (player.done)
      return interaction.reply({
        embeds:     [playerHandEmbed(player)],
        components: [],
        flags:      64
      });

    // Show hand + Hit/Stand ephemerally
    await interaction.reply({
      embeds:     [playerHandEmbed(player)],
      components: [hitStandRow(gameId)],
      flags:      64
    });
  }

  // ── HIT ───────────────────────────────────────────────────────────────────
  else if (action === 'hit') {
    if (!game || game.phase !== 'playing')
      return interaction.reply({ content: '❌ No active game found.', flags: 64 });

    const player = game.players[interaction.user.id];
    if (!player || player.done)
      return interaction.reply({ content: '❌ You are already done.', flags: 64 });

    const card = game.deck.shift();
    player.hand.push(card);
    const total = handTotal(player.hand);

    if (total >= 21) {
      // Bust or exactly 21 — auto-finish
      player.status = total > 21 ? 'bust' : 'stand';
      player.done   = true;
      if (player.timeout) { clearTimeout(player.timeout); player.timeout = null; }

      await interaction.update({ embeds: [playerHandEmbed(player)], components: [] });
      await checkAllDone(game, client);
    } else {
      await interaction.update({
        embeds:     [playerHandEmbed(player)],
        components: [hitStandRow(gameId)]
      });
    }
  }

  // ── STAND ─────────────────────────────────────────────────────────────────
  else if (action === 'stand') {
    if (!game || game.phase !== 'playing')
      return interaction.reply({ content: '❌ No active game found.', flags: 64 });

    const player = game.players[interaction.user.id];
    if (!player || player.done)
      return interaction.reply({ content: '❌ You are already done.', flags: 64 });

    player.status = 'stand';
    player.done   = true;
    if (player.timeout) { clearTimeout(player.timeout); player.timeout = null; }

    await interaction.update({ embeds: [playerHandEmbed(player)], components: [] });
    await checkAllDone(game, client);
  }
}
