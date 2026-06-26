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

    // ─── Coinflip buttons ─────────────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('cf_')) {
      const parts  = interaction.customId.split('_'); // ['cf', action, ...]
      let action = parts[1];
      let gameId = parts[2];
      let arg = null;
      if (action === 'pick') {
        arg = parts[2];
        gameId = parts[3];
      }
      await handleCoinflip(interaction, client, action, gameId, arg);
    }

    // ─── Party Roulette buttons ───────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('rlp_')) {
      const parts  = interaction.customId.split('_'); // ['rlp', action, gameId]
      const action = parts[1];
      const gameId = parts[2];
      await handleRouletteParty(interaction, client, action, gameId);
    }

    // ─── Bomb Party buttons ───────────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('bp_')) {
      const parts  = interaction.customId.split('_'); // ['bp', action, ...gameId]
      const action = parts[1];
      const gameId = parts.slice(2).join('_');
      const { handleBombParty } = require('../commands/bombparty');
      await handleBombParty(interaction, client, action, gameId);
    }

    // ─── Russian Roulette buttons ─────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('rr_')) {
      const raw    = interaction.customId.slice(3); // remove 'rr_'
      const sep    = raw.indexOf('_');
      const action = raw.slice(0, sep);
      const gameId = raw.slice(sep + 1);
      await handleRussianRoulette(interaction, client, action, gameId);
    }

    // ─── Horse Race buttons ───────────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('hr_')) {
      const raw    = interaction.customId.slice(3); // remove 'hr_'
      const sep    = raw.indexOf('_');
      const action = raw.slice(0, sep);
      const gameId = raw.slice(sep + 1);
      await handleHorseRace(interaction, client, action, gameId);
    }

    // ─── Texas Hold'em buttons ────────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('th_')) {
      const raw = interaction.customId.slice(3); // remove 'th_'
      const sep = raw.indexOf('_');
      const action = raw.slice(0, sep);
      const gameId = raw.slice(sep + 1);
      await handleTexasHoldem(interaction, client, action, gameId);
    }

    // ─── Five Card Draw buttons ───────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('fcd_')) {
      const raw = interaction.customId.slice(4); // remove 'fcd_'
      const sep = raw.indexOf('_');
      const action = raw.slice(0, sep);
      const gameId = raw.slice(sep + 1);
      await handleFiveCardDraw(interaction, client, action, gameId);
    }

    // ─── Five Card Draw select menu ───────────────────────────────────────────
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('fcdswap_')) {
      const gameId = interaction.customId.slice(8);
      await handleFcdSwap(interaction, client, gameId);
    }

    // ─── Mines buttons ────────────────────────────────────────────────────────
    // customId formats:
    //   mines_tile_<index>_<gameId>
    //   mines_cashout_<gameId>
    if (interaction.isButton() && interaction.customId.startsWith('mines_')) {
      const parts  = interaction.customId.split('_'); // ['mines', action, ...]
      const action = parts[1]; // 'tile' | 'cashout'
      if (action === 'tile') {
        // ['mines', 'tile', index, gameId]
        const tileIndex = parseInt(parts[2], 10);
        const gameId    = parts[3];
        await handleMinesTile(interaction, tileIndex, gameId);
      } else if (action === 'cashout') {
        // ['mines', 'cashout', gameId]
        const gameId = parts[2];
        await handleMinesCashout(interaction, gameId);
      }
    }

    // ─── Crash buttons ────────────────────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('crash_')) {
      const parts  = interaction.customId.split('_'); // ['crash', action, ...gameId]
      const action = parts[1];
      const gameId = parts.slice(2).join('_');
      const crashCmd = require('../commands/crash');

      if (action === 'cashout') {
        await handleCrashCashout(interaction, gameId);
      } else if (action === 'launch') {
        await crashCmd.handleCrashLaunch(interaction, gameId);
      } else if (action === 'cancel') {
        await crashCmd.handleCrashCancel(interaction, gameId);
      }
    }

    // ─── Higher or Lower buttons ──────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('hol_')) {
      const raw    = interaction.customId.slice(4);
      const sep    = raw.indexOf('_');
      const action = raw.slice(0, sep);
      const gameId = raw.slice(sep + 1);
      await handleHigherOrLower(interaction, action, gameId);
    }

    // ─── Dice Duel buttons ────────────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('dd_')) {
      const raw    = interaction.customId.slice(3);
      const sep    = raw.indexOf('_');
      const action = raw.slice(0, sep);
      const gameId = raw.slice(sep + 1);
      await handleDiceDuel(interaction, client, action, gameId);
    }


    // ─── Modal submissions ────────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('thraise_')) {
        const gameId = interaction.customId.slice(8);
        await handleThRaiseModal(interaction, client, gameId);
      }
      if (interaction.customId.startsWith('fcdraise_')) {
        const gameId = interaction.customId.slice(9);
        await handleFcdRaiseModal(interaction, client, gameId);
      }
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

    const bal = await getBalance(interaction.user.id);
    if (bal < game.bet)
      return interaction.reply({
        content: `❌ You need **${game.bet.toLocaleString()} coins** to join. You have **${bal.toLocaleString()}**.`,
        flags: 64
      });

    await removeBalance(interaction.user.id, game.bet);
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
      await addBalance(p.userId, game.bet);

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
      return interaction.reply({ content: '❌ No active game.', flags: 64 });

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

// ─────────────────────────────────────────────────────────────────────────────

async function handleCoinflip(interaction, client, action, gameId, pickArg) {
  const {
    startGame, resolveGame,
    lobbyEmbed, lobbyButtons
  } = require('../commands/coinflip');

  const { getBalance, removeBalance, addBalance } = require('../utils/economyStore');
  const { getGame, deleteGame } = require('../utils/gameStore');

  const game = getGame(gameId);

  // ── JOIN ──────────────────────────────────────────────────────────────────
  if (action === 'join') {
    if (!game || game.phase !== 'lobby')
      return interaction.reply({ content: '❌ This lobby is no longer open.', flags: 64 });
    if (game.players[interaction.user.id])
      return interaction.reply({ content: '❌ You already joined this game.', flags: 64 });
    if (Object.keys(game.players).length >= game.maxPlayers)
      return interaction.reply({ content: '❌ The game is full.', flags: 64 });

    const bal = await getBalance(interaction.user.id);
    if (bal < game.bet)
      return interaction.reply({
        content: `❌ You need **${game.bet.toLocaleString()} coins** to join. You have **${bal.toLocaleString()}**.`,
        flags: 64
      });

    await removeBalance(interaction.user.id, game.bet);
    game.players[interaction.user.id] = { userId: interaction.user.id };

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
    if (Object.keys(game.players).length < 2)
      return interaction.reply({ content: '❌ You need 2 players to start.', flags: 64 });

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
    for (const p of Object.values(game.players)) {
      await addBalance(p.userId, game.bet);
    }

    deleteGame(gameId);

    const { EmbedBuilder } = require('discord.js');
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

  // ── PICK ──────────────────────────────────────────────────────────────────
  else if (action === 'pick') {
    if (!game || game.phase !== 'choosing')
      return interaction.reply({ content: '❌ No active game in choosing phase.', flags: 64 });

    if (!game.players[interaction.user.id])
      return interaction.reply({ content: '❌ You are not in this game.', flags: 64 });

    await interaction.deferUpdate();
    await resolveGame(game, client, interaction.user.id, pickArg);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function handleRouletteParty(interaction, client, action, gameId) {
  const { startGame, lobbyEmbed, lobbyButtons } = require('../commands/rouletteparty');
  const { getBalance, removeBalance, addBalance } = require('../utils/economyStore');
  const { getGame, deleteGame } = require('../utils/gameStore');

  const game = getGame(gameId);

  // ── BETTING (Red / Black / Green) ─────────────────────────────────────────
  if (['red', 'black', 'green'].includes(action)) {
    if (!game || game.phase !== 'lobby')
      return interaction.reply({ content: '❌ This lobby is no longer open.', flags: 64 });
    if (game.players[interaction.user.id])
      return interaction.reply({ content: '❌ You already placed a bet.', flags: 64 });
    
    const bal = await getBalance(interaction.user.id);
    if (bal < game.bet)
      return interaction.reply({
        content: `❌ You need **${game.bet.toLocaleString()} coins** to bet.`,
        flags: 64
      });

    await removeBalance(interaction.user.id, game.bet);
    game.players[interaction.user.id] = { userId: interaction.user.id, color: action };

    await interaction.update({
      embeds: [lobbyEmbed(game)],
      components: lobbyButtons(gameId)
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
    if (Object.keys(game.players).length === 0)
      return interaction.reply({ content: '❌ At least one person must bet to start.', flags: 64 });

    await interaction.deferUpdate();
    await startGame(game, client);
  }

  // ── CANCEL ────────────────────────────────────────────────────────────────
  else if (action === 'cancel') {
    if (!game)
      return interaction.reply({ content: '❌ Game not found.', flags: 64 });
    if (game.hostId !== interaction.user.id)
      return interaction.reply({ content: '❌ Only the host can cancel.', flags: 64 });

    for (const p of Object.values(game.players)) {
      await addBalance(p.userId, game.bet);
    }
    deleteGame(gameId);

    const { EmbedBuilder } = require('discord.js');
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
}


// ─────────────────────────────────────────────────────────────────────────────

async function handleRussianRoulette(interaction, client, action, gameId) {
  const { handleRussianRoulette: handler } = require('../commands/russianroulette');
  await handler(interaction, client, action, gameId);
}

async function handleHorseRace(interaction, client, action, gameId) {
  const { handleHorseRace: handler } = require('../commands/horserace');
  await handler(interaction, client, action, gameId);
}


// -----------------------------------------------------------------------------
// Texas Hold em Handler
// -----------------------------------------------------------------------------

async function handleTexasHoldem(interaction, client, action, gameId) {
  const { lobbyEmbed, lobbyButtons, tableEmbed, actionButtons, startGame, advancePhase, resolveGame } = require('../commands/texasholdem');
  const { getBalance, removeBalance, addBalance } = require('../utils/economyStore');
  const { getGame, updateGame, deleteGame } = require('../utils/gameStore');
  const { displayCards } = require('../utils/pokerLogic');
  let game = getGame(gameId);
  if (action === 'join') {
    if (!game || game.phase !== 'lobby') return interaction.reply({ content: 'Lobby is closed.', flags: 64 });
    if (game.players[interaction.user.id]) return interaction.reply({ content: 'Already joined.', flags: 64 });
    if (Object.keys(game.players).length >= game.maxPlayers) return interaction.reply({ content: 'Full.', flags: 64 });
    const bal = await getBalance(interaction.user.id);
    if (bal < game.bet) return interaction.reply({ content: `Need ${game.bet} coins.`, flags: 64 });
    await removeBalance(interaction.user.id, game.bet);
    game.players[interaction.user.id] = { userId: interaction.user.id, hand: [], folded: false, roundBet: 0 };
    updateGame(gameId, { pot: game.pot + game.bet });
    await interaction.update({ embeds: [lobbyEmbed(game)], components: [lobbyButtons(gameId, Object.keys(game.players).length >= game.maxPlayers)] });
  } else if (action === 'start') {
    if (!game || game.hostId !== interaction.user.id || game.phase !== 'lobby') return interaction.reply({ content: 'Cannot start.', flags: 64 });
    if (Object.keys(game.players).length < 2) return interaction.reply({ content: 'Need 2+ players.', flags: 64 });
    await interaction.deferUpdate(); await startGame(game, client);
  } else if (action === 'cancel') {
    if (!game || game.hostId !== interaction.user.id) return interaction.reply({ content: 'Cannot cancel.', flags: 64 });
    for (const p of Object.values(game.players)) await addBalance(p.userId, game.bet);
    deleteGame(gameId);
    const { EmbedBuilder: E } = require('discord.js');
    await interaction.update({ embeds: [new E().setColor(0xED4245).setTitle('Cancelled').setDescription('Bets refunded.')], components: [] });
  } else if (action === 'peek') {
    const player = game && game.players[interaction.user.id];
    if (!player) return interaction.reply({ content: 'Not in game.', flags: 64 });
    await interaction.reply({ content: `Your hole cards: ${displayCards(player.hand)}`, flags: 64 });
  } else if (action === 'check') {
    if (!game) return interaction.reply({ content: '❌ No game found.', flags: 64 });
    const active = Object.values(game.players).filter(p => !p.folded);
    const cur = active[game.currentTurn % active.length];
    if (cur?.userId !== interaction.user.id) return interaction.reply({ content: '❌ It\'s not your turn yet!', flags: 64 });
    const callAmt = Math.max(0, game.currentBet - (cur.roundBet || 0));
    if (callAmt > 0) {
      const bal = await getBalance(interaction.user.id);
      if (bal < callAmt) return interaction.reply({ content: `❌ You need **${callAmt.toLocaleString()}** coins to call.`, flags: 64 });
      await removeBalance(interaction.user.id, callAmt);
      cur.roundBet = (cur.roundBet || 0) + callAmt;
      updateGame(gameId, { pot: game.pot + callAmt });
    }
    cur.hasActed = true;
    updateGame(gameId, { currentTurn: game.currentTurn + 1 });
    const g2 = getGame(gameId);
    const rem = Object.values(g2.players).filter(p => !p.folded);
    // Only advance phase when EVERY player has acted AND all bets match
    const allDone = rem.every(p => p.hasActed && (p.roundBet || 0) >= g2.currentBet);
    await interaction.deferUpdate();
    if (allDone) { await advancePhase(g2, client); }
    else {
      const nxt = rem[g2.currentTurn % rem.length];
      await game.lobbyMsg.edit({ embeds: [tableEmbed(g2)], components: [actionButtons(gameId, g2.currentBet - (nxt.roundBet || 0))] });
      await game.lobbyMsg.channel.send(`<@${nxt.userId}> it's your turn!`);
    }
  } else if (action === 'fold') {
    if (!game) return interaction.reply({ content: 'No game.', flags: 64 });
    const active = Object.values(game.players).filter(p => !p.folded);
    const cur = active[game.currentTurn % active.length];
    if (cur?.userId !== interaction.user.id) return interaction.reply({ content: 'Not your turn.', flags: 64 });
    game.players[interaction.user.id].folded = true;
    const stillIn = Object.values(game.players).filter(p => !p.folded);
    updateGame(gameId, { currentTurn: game.currentTurn + 1 });
    await interaction.deferUpdate();
    if (stillIn.length <= 1) { await resolveGame(game, client, stillIn); }
    else {
      const g2 = getGame(gameId); const nxt = stillIn[g2.currentTurn % stillIn.length];
      await game.lobbyMsg.edit({ embeds: [tableEmbed(g2)], components: [actionButtons(gameId, g2.currentBet - (nxt.roundBet || 0))] });
      await game.lobbyMsg.channel.send(`<@${nxt.userId}> your turn!`);
    }
  } else if (action === 'raise') {
    if (!game) return interaction.reply({ content: '❌ No game found.', flags: 64 });
    const active = Object.values(game.players).filter(p => !p.folded);
    const cur = active[game.currentTurn % active.length];
    if (cur?.userId !== interaction.user.id) return interaction.reply({ content: '❌ It\'s not your turn yet!', flags: 64 });
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder: AR2 } = require('discord.js');
    const modal = new ModalBuilder()
      .setCustomId(`thraise_${gameId}`)
      .setTitle('♠️ Raise Amount');
    const input = new TextInputBuilder()
      .setCustomId('raiseAmount')
      .setLabel(`Current bet: ${game.currentBet.toLocaleString()} coins. Enter total raise:`)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(`Must be more than ${game.currentBet.toLocaleString()}`)
      .setRequired(true);
    modal.addComponents(new AR2().addComponents(input));
    await interaction.showModal(modal);
  }
}

// -----------------------------------------------------------------------------
// Five Card Draw Handler
// -----------------------------------------------------------------------------

async function handleFiveCardDraw(interaction, client, action, gameId) {
  const { lobbyEmbed, lobbyButtons, tableEmbed, bettingButtons, drawButtons, startGame, startDrawPhase, startBettingRound2, resolveGame } = require('../commands/fivecarddraw');
  const { getBalance, removeBalance, addBalance } = require('../utils/economyStore');
  const { getGame, updateGame, deleteGame } = require('../utils/gameStore');
  const { displayCards } = require('../utils/pokerLogic');
  const { StringSelectMenuBuilder, ActionRowBuilder: AR } = require('discord.js');
  let game = getGame(gameId);
  if (action === 'join') {
    if (!game || game.phase !== 'lobby') return interaction.reply({ content: 'Lobby closed.', flags: 64 });
    if (game.players[interaction.user.id]) return interaction.reply({ content: 'Already joined.', flags: 64 });
    if (Object.keys(game.players).length >= game.maxPlayers) return interaction.reply({ content: 'Full.', flags: 64 });
    const bal = await getBalance(interaction.user.id);
    if (bal < game.bet) return interaction.reply({ content: `Need ${game.bet} coins.`, flags: 64 });
    await removeBalance(interaction.user.id, game.bet);
    game.players[interaction.user.id] = { userId: interaction.user.id, hand: [], folded: false, roundBet: 0, swapped: false };
    updateGame(gameId, { pot: game.pot + game.bet });
    await interaction.update({ embeds: [lobbyEmbed(game)], components: [lobbyButtons(gameId, Object.keys(game.players).length >= game.maxPlayers)] });
  } else if (action === 'start') {
    if (!game || game.hostId !== interaction.user.id || game.phase !== 'lobby') return interaction.reply({ content: 'Cannot start.', flags: 64 });
    if (Object.keys(game.players).length < 2) return interaction.reply({ content: 'Need 2+ players.', flags: 64 });
    await interaction.deferUpdate(); await startGame(game, client);
  } else if (action === 'cancel') {
    if (!game || game.hostId !== interaction.user.id) return interaction.reply({ content: 'Cannot cancel.', flags: 64 });
    for (const p of Object.values(game.players)) await addBalance(p.userId, game.bet);
    deleteGame(gameId);
    const { EmbedBuilder: E } = require('discord.js');
    await interaction.update({ embeds: [new E().setColor(0xED4245).setTitle('Cancelled').setDescription('Bets refunded.')], components: [] });
  } else if (action === 'peek') {
    const player = game && game.players[interaction.user.id];
    if (!player) return interaction.reply({ content: 'Not in game.', flags: 64 });
    await interaction.reply({ content: `Your hand: ${displayCards(player.hand)}`, flags: 64 });
  } else if (action === 'check') {
    if (!game) return interaction.reply({ content: 'No game.', flags: 64 });
    const active = Object.values(game.players).filter(p => !p.folded);
    const cur = active[game.currentTurn % active.length];
    if (cur?.userId !== interaction.user.id) return interaction.reply({ content: 'Not your turn.', flags: 64 });
    const callAmt = Math.max(0, game.currentBet - (cur.roundBet || 0));
    if (callAmt > 0) {
      const bal = await getBalance(interaction.user.id);
      if (bal < callAmt) return interaction.reply({ content: `Need ${callAmt} to call.`, flags: 64 });
      await removeBalance(interaction.user.id, callAmt);
      cur.roundBet = (cur.roundBet || 0) + callAmt;
      updateGame(gameId, { pot: game.pot + callAmt });
    }
    cur.hasActed = true;
    updateGame(gameId, { currentTurn: game.currentTurn + 1 });
    const g2 = getGame(gameId);
    const rem = Object.values(g2.players).filter(p => !p.folded);
    const allDone = rem.every(p => p.hasActed && (p.roundBet || 0) >= g2.currentBet);
    await interaction.deferUpdate();
    if (allDone) {
      if (g2.phase === 'betting1') await startDrawPhase(g2, client); else await resolveGame(g2, client);
    } else {
      const nxt = rem[g2.currentTurn % rem.length];
      await game.lobbyMsg.edit({ embeds: [tableEmbed(g2)], components: [bettingButtons(gameId, g2.currentBet - (nxt.roundBet || 0))] });
      await game.lobbyMsg.channel.send(`<@${nxt.userId}> it's your turn!`);
    }
  } else if (action === 'fold') {
    if (!game) return interaction.reply({ content: 'No game.', flags: 64 });
    const active = Object.values(game.players).filter(p => !p.folded);
    const cur = active[game.currentTurn % active.length];
    if (cur?.userId !== interaction.user.id) return interaction.reply({ content: 'Not your turn.', flags: 64 });
    game.players[interaction.user.id].folded = true;
    const stillIn = Object.values(game.players).filter(p => !p.folded);
    updateGame(gameId, { currentTurn: game.currentTurn + 1 });
    await interaction.deferUpdate();
    if (stillIn.length <= 1) { await resolveGame(game, client); }
    else {
      const g2 = getGame(gameId); const nxt = stillIn[g2.currentTurn % stillIn.length];
      await game.lobbyMsg.edit({ embeds: [tableEmbed(g2)], components: [bettingButtons(gameId, g2.currentBet - (nxt.roundBet || 0))] });
      await game.lobbyMsg.channel.send(`<@${nxt.userId}> your turn!`);
    }
  } else if (action === 'keepall') {
    const player = game && game.players[interaction.user.id];
    if (!game || game.phase !== 'draw' || !player || player.swapped) return interaction.reply({ content: 'Cannot keep all now.', flags: 64 });
    player.swapped = true;
    await interaction.reply({ content: 'Kept all cards!', flags: 64 });
    const g2 = getGame(gameId);
    if (Object.values(g2.players).filter(p => !p.folded).every(p => p.swapped)) await startBettingRound2(g2, client);
    else await game.lobbyMsg.edit({ embeds: [tableEmbed(g2)], components: [drawButtons(gameId)] });
  } else if (action === 'swap') {
    const player = game && game.players[interaction.user.id];
    if (!game || game.phase !== 'draw' || !player || player.swapped) return interaction.reply({ content: 'Cannot swap now.', flags: 64 });
    const opts = player.hand.map((c, i) => ({ label: c.display, value: String(i), description: `Card ${i+1}` }));
    const menu = new StringSelectMenuBuilder().setCustomId(`fcdswap_${gameId}`).setPlaceholder('Pick up to 3 cards to discard').setMinValues(1).setMaxValues(Math.min(3, opts.length)).addOptions(opts);
    await interaction.reply({ content: 'Select up to 3 cards to discard:', components: [new AR().addComponents(menu)], flags: 64 });
  } else if (action === 'raise') {
    if (!game) return interaction.reply({ content: 'No game found.', flags: 64 });
    const active = Object.values(game.players).filter(p => !p.folded);
    const cur = active[game.currentTurn % active.length];
    if (cur?.userId !== interaction.user.id) return interaction.reply({ content: 'Not your turn.', flags: 64 });
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder: AR3 } = require('discord.js');
    const modal = new ModalBuilder().setCustomId(`fcdraise_${gameId}`).setTitle('Raise Amount');
    const input = new TextInputBuilder().setCustomId('raiseAmount').setLabel(`Current bet: ${game.currentBet} coins. Enter total raise:`).setStyle(TextInputStyle.Short).setPlaceholder(`More than ${game.currentBet}`).setRequired(true);
    modal.addComponents(new AR3().addComponents(input));
    await interaction.showModal(modal);
  }
}

async function handleFcdSwap(interaction, client, gameId) {
  const { startBettingRound2, tableEmbed, drawButtons } = require('../commands/fivecarddraw');
  const { getGame, updateGame } = require('../utils/gameStore');
  const game = getGame(gameId);
  if (!game || game.phase !== 'draw') return interaction.update({ content: 'Draw phase over.', components: [] });
  const player = game.players[interaction.user.id];
  if (!player || player.swapped) return interaction.update({ content: 'Already decided.', components: [] });
  const idxs = interaction.values.map(Number);
  const deck = game.deck;
  player.hand = player.hand.map((c, i) => idxs.includes(i) ? deck.shift() : c);
  player.swapped = true;
  updateGame(gameId, { deck });
  await interaction.update({ content: `Discarded ${idxs.length} card(s). Click Peek at Cards to see your new hand.`, components: [] });
  const g2 = getGame(gameId);
  if (Object.values(g2.players).filter(p => !p.folded).every(p => p.swapped)) await startBettingRound2(g2, client);
  else await game.lobbyMsg.edit({ embeds: [tableEmbed(g2)], components: [drawButtons(gameId)] });
}

async function handleThRaiseModal(interaction, client, gameId) {
  const { tableEmbed, actionButtons, advancePhase } = require('../commands/texasholdem');
  const { getBalance, removeBalance } = require('../utils/economyStore');
  const { getGame, updateGame } = require('../utils/gameStore');

  const game = getGame(gameId);
  if (!game) return interaction.reply({ content: 'Game not found.', flags: 64 });

  const raiseTotal = parseInt(interaction.fields.getTextInputValue('raiseAmount').replace(/[^0-9]/g, ''), 10);
  if (isNaN(raiseTotal) || raiseTotal <= game.currentBet)
    return interaction.reply({ content: `Raise must be more than ${game.currentBet.toLocaleString()} coins.`, flags: 64 });

  const active = Object.values(game.players).filter(p => !p.folded);
  const cur = active[game.currentTurn % active.length];
  if (cur?.userId !== interaction.user.id)
    return interaction.reply({ content: 'Not your turn.', flags: 64 });

  const alreadyBet = cur.roundBet || 0;
  const extra = raiseTotal - alreadyBet;
  const bal = await getBalance(interaction.user.id);
  if (bal < extra)
    return interaction.reply({ content: `You only have ${bal.toLocaleString()} coins. You need ${extra.toLocaleString()} more to raise to ${raiseTotal.toLocaleString()}.`, flags: 64 });

  await removeBalance(interaction.user.id, extra);
  cur.roundBet = raiseTotal;
  cur.hasActed = true;

  // Reset everyone else's acted flag so they must respond to the raise
  for (const p of Object.values(game.players)) {
    if (p.userId !== interaction.user.id && !p.folded) p.hasActed = false;
  }

  updateGame(gameId, { pot: game.pot + extra, currentBet: raiseTotal, currentTurn: game.currentTurn + 1 });
  const g2 = getGame(gameId);
  const rem = Object.values(g2.players).filter(p => !p.folded);
  const nxt = rem[g2.currentTurn % rem.length];

  await interaction.reply({ content: `✅ You raised to **${raiseTotal.toLocaleString()}** coins!`, flags: 64 });
  await game.lobbyMsg.edit({ embeds: [tableEmbed(g2)], components: [actionButtons(gameId, raiseTotal - (nxt.roundBet || 0))] });
  await game.lobbyMsg.channel.send(`<@${cur.userId}> raised to **${raiseTotal.toLocaleString()}** coins! <@${nxt.userId}> it's your turn!`);
}

async function handleFcdRaiseModal(interaction, client, gameId) {
  const { tableEmbed, bettingButtons, startDrawPhase, resolveGame } = require('../commands/fivecarddraw');
  const { getBalance, removeBalance } = require('../utils/economyStore');
  const { getGame, updateGame } = require('../utils/gameStore');

  const game = getGame(gameId);
  if (!game) return interaction.reply({ content: 'Game not found.', flags: 64 });

  const raiseTotal = parseInt(interaction.fields.getTextInputValue('raiseAmount').replace(/[^0-9]/g, ''), 10);
  if (isNaN(raiseTotal) || raiseTotal <= game.currentBet)
    return interaction.reply({ content: `Raise must be more than ${game.currentBet.toLocaleString()} coins.`, flags: 64 });

  const active = Object.values(game.players).filter(p => !p.folded);
  const cur = active[game.currentTurn % active.length];
  if (cur?.userId !== interaction.user.id)
    return interaction.reply({ content: 'Not your turn.', flags: 64 });

  const alreadyBet = cur.roundBet || 0;
  const extra = raiseTotal - alreadyBet;
  const bal = await getBalance(interaction.user.id);
  if (bal < extra)
    return interaction.reply({ content: `You only have ${bal.toLocaleString()} coins. Need ${extra.toLocaleString()} more.`, flags: 64 });

  await removeBalance(interaction.user.id, extra);
  cur.roundBet = raiseTotal;
  cur.hasActed = true;

  for (const p of Object.values(game.players)) {
    if (p.userId !== interaction.user.id && !p.folded) p.hasActed = false;
  }

  updateGame(gameId, { pot: game.pot + extra, currentBet: raiseTotal, currentTurn: game.currentTurn + 1 });
  const g2 = getGame(gameId);
  const rem = Object.values(g2.players).filter(p => !p.folded);
  const nxt = rem[g2.currentTurn % rem.length];

  await interaction.reply({ content: `✅ You raised to **${raiseTotal.toLocaleString()}** coins!`, flags: 64 });
  await game.lobbyMsg.edit({ embeds: [tableEmbed(g2)], components: [bettingButtons(gameId, raiseTotal - (nxt.roundBet || 0))] });
  await game.lobbyMsg.channel.send(`<@${cur.userId}> raised to **${raiseTotal.toLocaleString()}** coins! <@${nxt.userId}> it's your turn!`);
}

// -----------------------------------------------------------------------------
// Mines Handlers
// -----------------------------------------------------------------------------

/**
 * Called when a player clicks any numbered tile.
 */
async function handleMinesTile(interaction, tileIndex, gameId) {
  const {
    buildEmbed, buildComponents, revealAllMines, tileMultiplier, GRID_SIZE,
  } = require('../commands/mines');

  const game = getGame(gameId);

  if (!game || game.phase !== 'playing')
    return interaction.reply({ content: '❌ No active Mines game found.', flags: 64 });
  if (game.hostId !== interaction.user.id)
    return interaction.reply({ content: '❌ This is not your game.', flags: 64 });
  if (game.tiles[tileIndex] !== 'hidden')
    return interaction.reply({ content: '❌ That tile is already revealed.', flags: 64 });

  const isMine = game.mines.has(tileIndex);

  if (isMine) {
    // ── Hit a mine — game over ───────────────────────────────────────────────
    game.tiles[tileIndex] = 'mine';
    revealAllMines(game);
    updateGame(gameId, { tiles: game.tiles, phase: 'boom' });

    await interaction.update({
      embeds:     [buildEmbed(game, 'boom')],
      components: buildComponents(gameId, game, true),
    });
    deleteGame(gameId);
  } else {
    // ── Safe tile ────────────────────────────────────────────────────────────
    game.tiles[tileIndex] = 'safe';
    const newRevealed    = game.revealed + 1;
    const safeTilesTotal = GRID_SIZE - game.mineCount;
    const factor         = tileMultiplier(game.mineCount);
    const newMultiplier  = game.multiplier * factor;

    updateGame(gameId, {
      tiles:      game.tiles,
      revealed:   newRevealed,
      multiplier: newMultiplier,
    });

    const updatedGame = getGame(gameId);

    // Check if all safe tiles revealed (perfect sweep)
    if (newRevealed >= safeTilesTotal) {
      updateGame(gameId, { phase: 'sweep' });
      const payout = Math.floor(updatedGame.bet * updatedGame.multiplier);
      await addBalance(updatedGame.hostId, payout);
      await interaction.update({
        embeds:     [buildEmbed(updatedGame, 'sweep')],
        components: buildComponents(gameId, updatedGame, true),
      });
      deleteGame(gameId);
    } else {
      await interaction.update({
        embeds:     [buildEmbed(updatedGame, 'playing')],
        components: buildComponents(gameId, updatedGame),
      });
    }
  }
}

/**
 * Called when the player clicks Cash Out in Mines.
 */
async function handleMinesCashout(interaction, gameId) {
  const { buildEmbed, buildComponents } = require('../commands/mines');

  const game = getGame(gameId);

  if (!game || game.phase !== 'playing')
    return interaction.reply({ content: '❌ No active Mines game found.', flags: 64 });
  if (game.hostId !== interaction.user.id)
    return interaction.reply({ content: '❌ This is not your game.', flags: 64 });
  if (game.revealed === 0)
    return interaction.reply({ content: '❌ Reveal at least one tile before cashing out!', flags: 64 });

  const payout = Math.floor(game.bet * game.multiplier);
  await addBalance(game.hostId, payout);
  updateGame(gameId, { phase: 'cashout' });

  await interaction.update({
    embeds:     [buildEmbed(game, 'cashout')],
    components: buildComponents(gameId, game, true),
  });
  deleteGame(gameId);
}

// -----------------------------------------------------------------------------
// Crash Handler
// -----------------------------------------------------------------------------

/**
 * Called when the player clicks the Cash Out button during a Crash game.
 * Cancels the running setInterval so no more ticks fire after cashout.
 */
async function handleCrashCashout(interaction, gameId) {
  const { buildEmbed, buildComponents } = require('../commands/crash');

  const game = getGame(gameId);

  if (!game || game.phase !== 'playing')
    return interaction.reply({ content: '❌ No active Crash game (already crashed or cashed out?).', flags: 64 });
  if (game.hostId !== interaction.user.id)
    return interaction.reply({ content: '❌ This is not your game.', flags: 64 });

  // Cancel the interval immediately to stop further ticks
  if (game.intervalId) clearInterval(game.intervalId);
  updateGame(gameId, { phase: 'cashout', intervalId: null });

  const payout = Math.floor(game.bet * game.multiplier);
  await addBalance(game.hostId, payout);

  await interaction.update({
    embeds:     [buildEmbed(game, 'cashout')],
    components: buildComponents(gameId, true),
  });
  deleteGame(gameId);
}


// -----------------------------------------------------------------------------
// Higher or Lower Handler
// -----------------------------------------------------------------------------
async function handleHigherOrLower(interaction, action, gameId) {
  const { handleButton } = require('../commands/higherorlower');
  await handleButton(interaction, action, gameId);
}

// -----------------------------------------------------------------------------
// Dice Duel Handler
// -----------------------------------------------------------------------------
async function handleDiceDuel(interaction, client, action, gameId) {
  const { lobbyEmbed, lobbyButtons, startGame, cancelGame } = require('../commands/diceduel');
  const { getBalance, removeBalance, addBalance } = require('../utils/economyStore');
  const { getGame, updateGame, deleteGame } = require('../utils/gameStore');
  const { EmbedBuilder } = require('discord.js');

  const game = getGame(gameId);

  if (action === 'join') {
    if (!game || game.phase !== 'lobby') return interaction.reply({ content: 'Lobby is closed.', flags: 64 });
    if (game.players[interaction.user.id]) return interaction.reply({ content: 'You already joined!', flags: 64 });
    if (Object.keys(game.players).length >= 2) return interaction.reply({ content: 'Lobby is full!', flags: 64 });
    const bal = await getBalance(interaction.user.id);
    if (bal < game.bet) return interaction.reply({ content: `You need **${game.bet.toLocaleString()}** coins to join.`, flags: 64 });
    await removeBalance(interaction.user.id, game.bet);
    game.players[interaction.user.id] = { userId: interaction.user.id };
    updateGame(gameId, { pot: game.pot + game.bet });
    const isFull = Object.keys(game.players).length >= 2;
    await interaction.update({ embeds: [lobbyEmbed(game)], components: [lobbyButtons(gameId, isFull)] });
  } else if (action === 'start') {
    if (!game || game.hostId !== interaction.user.id) return interaction.reply({ content: 'Only the host can start.', flags: 64 });
    if (Object.keys(game.players).length < 2) return interaction.reply({ content: 'Need 2 players!', flags: 64 });
    await interaction.deferUpdate();
    await startGame(interaction, game);
  } else if (action === 'cancel') {
    if (!game || game.hostId !== interaction.user.id) return interaction.reply({ content: 'Only the host can cancel.', flags: 64 });
    await cancelGame(interaction, game);
  }
}
