/**
 * crash.js — Solo Crash game
 *
 * Flow:
 *  1. /crash <bet>  → posts embed at 1.00x with a Cash Out button
 *  2. Bot edits the message every 1.5 s showing the growing multiplier
 *  3. Player clicks Cash Out to lock in their multiplier and win
 *  4. If multiplier reaches crashPoint before player cashes out → they lose
 *  5. Max 20 ticks to avoid Discord rate limits
 *
 * Multiplier growth: ×1.10 per tick (compound)
 *   tick 0  → 1.00x
 *   tick 1  → 1.10x
 *   tick 2  → 1.21x  …etc.
 *
 * crashPoint formula (weighted towards low multipliers):
 *   crashPoint = Math.max(1.01, (Math.random() * 10).toFixed(2))
 *
 * Button customIds (handled in interactionCreate.js):
 *   crash_cashout_<gameId>
 *
 * The interval ID is stored in game.intervalId so the button handler
 * can cancel it with clearInterval(game.intervalId).
 */

const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');

const { getBalance, removeBalance, addBalance } = require('../utils/economyStore');
const { createGame, getGame, updateGame, deleteGame, getGameByUser } = require('../utils/gameStore');

const TICK_MS    = 2000;  // 2 s between edits — safe within Discord rate limits
const MAX_TICKS  = 20;    // hard ceiling
const GROWTH     = 1.10;  // +10% per tick

// ─── ID generator ─────────────────────────────────────────────────────────────

function newGameId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

/**
 * Renders a 20-character bar that fills up as the multiplier grows toward crashPoint.
 * Fully filled at crashPoint; gives the player a sense of danger.
 */
function progressBar(current, crashPoint) {
  const BAR_LEN = 20;
  const filled  = Math.min(BAR_LEN, Math.round(((current - 1) / (crashPoint - 1)) * BAR_LEN));
  const empty   = BAR_LEN - filled;
  return '🟩'.repeat(filled) + '⬛'.repeat(empty);
}

// ─── Embed builder ────────────────────────────────────────────────────────────

function buildEmbed(game, status = 'playing') {
  const mult   = game.multiplier.toFixed(2);
  const payout = Math.floor(game.bet * game.multiplier);

  if (status === 'playing') {
    const bar = progressBar(game.multiplier, game.crashPoint);
    return new EmbedBuilder()
      .setColor(0xF1C40F)
      .setTitle('🚀 Crash')
      .setDescription(
        [
          `**Multiplier:** \`${mult}x\``,
          `**Cash out value:** \`${payout.toLocaleString()} coins\``,
          '',
          bar,
          '',
          `*Rocket launches higher every 1.5 seconds…*`,
        ].join('\n')
      )
      .setFooter({ text: `Bet: ${game.bet.toLocaleString()} coins • Click Cash Out before it crashes!` })
      .setTimestamp();
  }

  if (status === 'cashout') {
    return new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('💰 Crash — Cashed Out!')
      .setDescription(
        [
          `You cashed out at **${mult}x** before the crash!`,
          `**Winnings:** \`+${payout.toLocaleString()} coins\``,
          `*(Rocket crashed at \`${game.crashPoint.toFixed(2)}x\`)*`,
        ].join('\n')
      )
      .setFooter({ text: `Bet: ${game.bet.toLocaleString()} coins` })
      .setTimestamp();
  }

  if (status === 'crashed') {
    return new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('💥 Crash — Rocket Down!')
      .setDescription(
        [
          `The rocket crashed at **${game.crashPoint.toFixed(2)}x**!`,
          `You were still riding at \`${mult}x\` — too slow! 🪦`,
          `**Lost:** \`${game.bet.toLocaleString()} coins\``,
        ].join('\n')
      )
      .setFooter({ text: `Better luck next time!` })
      .setTimestamp();
  }
}

// ─── Cash Out button row ──────────────────────────────────────────────────────

function buildComponents(gameId, disabled = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`crash_cashout_${gameId}`)
        .setLabel('Cash Out')
        .setStyle(ButtonStyle.Success)
        .setEmoji('💰')
        .setDisabled(disabled)
    ),
  ];
}

function buildLaunchComponents(gameId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`crash_launch_${gameId}`)
        .setLabel('Launch Rocket!')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🚀'),
      new ButtonBuilder()
        .setCustomId(`crash_cancel_${gameId}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌'),
    ),
  ];
}

// ─── Crash loop ───────────────────────────────────────────────────────────────

/**
 * Starts the interval that drives the multiplier growth and crash detection.
 * The interval ID is stored in game.intervalId so the cashout handler can cancel it.
 */
async function startCrashLoop(gameId) {
  const intervalId = setInterval(async () => {
    const game = getGame(gameId);
    if (!game || game.phase !== 'playing') {
      clearInterval(intervalId);
      return;
    }

    // Advance multiplier
    const newMult = parseFloat((game.multiplier * GROWTH).toFixed(4));
    const newTick = game.tick + 1;
    updateGame(gameId, { multiplier: newMult, tick: newTick });

    const fresh = getGame(gameId);

    // Check crash or max-ticks
    const hasCrashed = newMult >= fresh.crashPoint || newTick >= MAX_TICKS;

    if (hasCrashed) {
      clearInterval(intervalId);
      updateGame(gameId, { phase: 'crashed', intervalId: null });

      // Edit message with crash result
      try {
        await fresh.lobbyMsg.edit({
          embeds:     [buildEmbed(fresh, 'crashed')],
          components: buildComponents(gameId, true),
        });
      } catch (err) {
        console.error('[Crash] Failed to edit crash message:', err);
      }

      deleteGame(gameId);
      return;
    }

    // Still running — update display
    try {
      await fresh.lobbyMsg.edit({
        embeds:     [buildEmbed(fresh, 'playing')],
        components: buildComponents(gameId),
      });
    } catch (err) {
      // 10008 = Unknown Message (deleted) — fatal, stop the loop
      if (err.code === 10008) {
        console.error('[Crash] Message deleted, stopping loop.');
        clearInterval(intervalId);
        deleteGame(gameId);
      }
      // Any other error (rate limit, etc.) — skip this tick, keep running
    }
  }, TICK_MS);

  updateGame(gameId, { intervalId });
}

// ─── Command definition ───────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('crash')
    .setDescription('Bet on a rising multiplier — cash out before it crashes!')
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
      return interaction.reply({
        content: `❌ You only have **${balance.toLocaleString()} coins**.`,
        flags: 64,
      });

    await removeBalance(interaction.user.id, bet);

    const crashPoint = Math.max(1.01, parseFloat((Math.random() * 10).toFixed(2)));
    const gameId = newGameId();

    createGame({
      gameId,
      hostId:     interaction.user.id,
      bet,
      crashPoint,
      multiplier: 1.00,
      tick:       0,
      phase:      'waiting', // waits for Launch button
      intervalId: null,
      lobbyMsg:   null,
    });

    updateGame(gameId, { players: undefined, deck: undefined, dealer: undefined });

    const waitEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🚀 Crash — Ready for Launch')
      .setDescription(
        `**Bet:** \`${bet.toLocaleString()} coins\`\n\n` +
        `Click **🚀 Launch Rocket!** when you're ready.\n` +
        `The multiplier will tick up every 2 seconds.\n` +
        `Click **💰 Cash Out** before it crashes!`
      )
      .setFooter({ text: 'Crash point is hidden — good luck!' })
      .setTimestamp();

    await interaction.reply({ embeds: [waitEmbed], components: buildLaunchComponents(gameId) });
    const msg = await interaction.fetchReply();
    updateGame(gameId, { lobbyMsg: msg });
  },

  // ── Button handlers ──────────────────────────────────────────────────────────────

  async handleCrashLaunch(interaction, gameId) {
    const game = getGame(gameId);
    if (!game || game.phase !== 'waiting')
      return interaction.reply({ content: '❌ Game already started or expired.', flags: 64 });
    if (game.hostId !== interaction.user.id)
      return interaction.reply({ content: '❌ Only the player who started this can launch.', flags: 64 });

    updateGame(gameId, { phase: 'playing' });
    await interaction.deferUpdate();

    const fresh = getGame(gameId);
    const msg = await interaction.editReply({
      embeds:     [buildEmbed(fresh, 'playing')],
      components: buildComponents(gameId),
    });
    updateGame(gameId, { lobbyMsg: msg });

    await startCrashLoop(gameId);
  },

  async handleCrashCancel(interaction, gameId) {
    const game = getGame(gameId);
    if (!game || game.phase !== 'waiting')
      return interaction.reply({ content: '❌ Cannot cancel — game already running.', flags: 64 });
    if (game.hostId !== interaction.user.id)
      return interaction.reply({ content: '❌ Only the player who started this can cancel.', flags: 64 });

    await addBalance(interaction.user.id, game.bet);
    deleteGame(gameId);

    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('❌ Crash — Cancelled')
          .setDescription(`Your bet of **${game.bet.toLocaleString()} coins** has been refunded.`)
          .setTimestamp(),
      ],
      components: [],
    });
  },

  buildEmbed,
  buildComponents,
  buildLaunchComponents,
};
