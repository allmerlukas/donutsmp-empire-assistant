/**
 * mines.js — Solo Mines game (like Minesweeper)
 *
 * Grid: 4 rows × 5 columns = 20 tiles
 * Discord's 5 ActionRow limit: rows 1-4 are tiles, row 5 is Cash Out.
 *
 * Multiplier formula per safe reveal:
 *   tileMultiplier = 1 + (mines / (20 - mines)) * 0.8
 *   totalMultiplier *= tileMultiplier  (compounded on each reveal)
 *
 * Button customIds (handled in interactionCreate.js):
 *   mines_tile_<index>_<gameId>   — 0-indexed tile button
 *   mines_cashout_<gameId>        — Cash Out button (row 5)
 */

const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');

const { getBalance, removeBalance, addBalance } = require('../utils/economyStore');
const { createGame, getGame, updateGame, deleteGame, getGameByUser } = require('../utils/gameStore');

const GRID_SIZE  = 20; // 4 rows × 5 columns
const COLS       = 5;

// ─── ID generator ─────────────────────────────────────────────────────────────

function newGameId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

// ─── Multiplier helpers ───────────────────────────────────────────────────────

/**
 * Returns the per-tile multiplier factor for a given mine count.
 * Each safe reveal multiplies the running total by this value.
 */
function tileMultiplier(mineCount) {
  return 1 + (mineCount / (GRID_SIZE - mineCount)) * 0.8;
}

/**
 * Computes running multiplier after `revealed` safe tiles have been clicked.
 */
function computeMultiplier(mineCount, revealed) {
  const factor = tileMultiplier(mineCount);
  let mult = 1;
  for (let i = 0; i < revealed; i++) mult *= factor;
  return mult;
}

// ─── Mine placement ───────────────────────────────────────────────────────────

/**
 * Returns a Set of tile indices that contain mines.
 */
function placeMines(mineCount) {
  const positions = new Set();
  while (positions.size < mineCount) {
    positions.add(Math.floor(Math.random() * GRID_SIZE));
  }
  return positions;
}

// ─── UI builders ─────────────────────────────────────────────────────────────

/**
 * Builds the 5 ActionRows: 4 rows of 5 tile buttons + 1 Cash Out row.
 * @param {string}   gameId
 * @param {object}   game        - game state from gameStore
 * @param {boolean}  disabled    - disable all buttons (game over)
 */
function buildComponents(gameId, game, disabled = false) {
  const rows = [];

  // Tile rows (0-3), each with 5 buttons
  for (let row = 0; row < 4; row++) {
    const ar = new ActionRowBuilder();
    for (let col = 0; col < COLS; col++) {
      const idx   = row * COLS + col;
      const state = game.tiles[idx]; // 'hidden' | 'safe' | 'mine'

      let label, style, emoji;
      if (state === 'hidden') {
        label = String(idx + 1);
        style = ButtonStyle.Secondary;
        emoji = undefined;
      } else if (state === 'safe') {
        label = String(idx + 1);
        style = ButtonStyle.Success;
        emoji = '💎';
      } else {
        // mine revealed
        label = String(idx + 1);
        style = ButtonStyle.Danger;
        emoji = '💣';
      }

      const btn = new ButtonBuilder()
        .setCustomId(`mines_tile_${idx}_${gameId}`)
        .setLabel(label)
        .setStyle(style)
        .setDisabled(disabled || state !== 'hidden');

      if (emoji) btn.setEmoji(emoji);
      ar.addComponents(btn);
    }
    rows.push(ar);
  }

  // Cash Out row (row 5)
  const payout      = Math.floor(game.bet * game.multiplier);
  const cashoutBtn  = new ButtonBuilder()
    .setCustomId(`mines_cashout_${gameId}`)
    .setLabel(`💰 Cash Out ${payout.toLocaleString()}`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(disabled || game.revealed === 0); // can't cash out before first reveal

  rows.push(new ActionRowBuilder().addComponents(cashoutBtn));
  return rows;
}

/**
 * Builds the game embed showing current multiplier and payout.
 */
function buildEmbed(game, status = 'playing') {
  const payout = Math.floor(game.bet * game.multiplier);
  const safeTilesLeft = (GRID_SIZE - game.mineCount) - game.revealed;

  let color, title, desc;

  if (status === 'playing') {
    color = 0x5865F2;
    title = '💣 Mines';
    desc  = [
      `**Mines:** ${game.mineCount}  |  **Safe revealed:** ${game.revealed}`,
      `**Multiplier:** \`${game.multiplier.toFixed(3)}x\``,
      `**Potential payout:** \`${payout.toLocaleString()} coins\``,
      `**Safe tiles left:** ${safeTilesLeft}`,
    ].join('\n');
  } else if (status === 'cashout') {
    color = 0x57F287;
    title = '💰 Mines — Cashed Out!';
    desc  = [
      `You cashed out with **${game.revealed}** safe tile(s) revealed!`,
      `**Multiplier:** \`${game.multiplier.toFixed(3)}x\``,
      `**Winnings:** \`+${payout.toLocaleString()} coins\``,
    ].join('\n');
  } else if (status === 'boom') {
    color = 0xED4245;
    title = '💥 Mines — Boom!';
    desc  = [
      `You hit a mine! All ${game.mineCount} mines revealed.`,
      `**Bet lost:** \`${game.bet.toLocaleString()} coins\``,
    ].join('\n');
  } else if (status === 'sweep') {
    color = 0xF1C40F;
    title = '🏆 Mines — Perfect Sweep!';
    desc  = [
      `You revealed ALL safe tiles without hitting a mine!`,
      `**Multiplier:** \`${game.multiplier.toFixed(3)}x\``,
      `**Winnings:** \`+${payout.toLocaleString()} coins\``,
    ].join('\n');
  }

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(desc)
    .setFooter({ text: `Bet: ${game.bet.toLocaleString()} coins • /mines` })
    .setTimestamp();
}

// ─── Reveal all mines (for game-over display) ─────────────────────────────────

function revealAllMines(game) {
  for (const idx of game.mines) {
    if (game.tiles[idx] === 'hidden') game.tiles[idx] = 'mine';
  }
}

// ─── Command definition ───────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mines')
    .setDescription('Play a solo game of Mines (like Minesweeper)!')
    .addIntegerOption(o =>
      o.setName('bet')
        .setDescription('Amount of coins to bet')
        .setRequired(true)
        .setMinValue(1)
    )
    .addIntegerOption(o =>
      o.setName('mines')
        .setDescription('Number of mines hidden in the grid (default: 3, max: 10)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(10)
    ),

  async execute(interaction) {
    const bet       = interaction.options.getInteger('bet');
    const mineCount = interaction.options.getInteger('mines') ?? 3;

    // Prevent double games
    if (getGameByUser(interaction.user.id))
      return interaction.reply({ content: '❌ You already have an active game.', flags: 64 });

    // Balance check
    const balance = await getBalance(interaction.user.id);
    if (balance < bet)
      return interaction.reply({
        content: `❌ You only have **${balance.toLocaleString()} coins**.`,
        flags: 64,
      });

    // Deduct bet
    await removeBalance(interaction.user.id, bet);

    // Initialise game state
    const gameId = newGameId();
    const mines  = placeMines(mineCount);

    const game = createGame({
      gameId,
      hostId:     interaction.user.id,
      bet,
      mineCount,
      mines,                         // Set of mine indices
      tiles:      Array(GRID_SIZE).fill('hidden'),
      revealed:   0,
      multiplier: 1,
      phase:      'playing',
      lobbyMsg:   null,
    });

    // Override gameStore defaults (it sets players/deck/dealer/phase we don't need)
    updateGame(gameId, {
      players: undefined,
      deck:    undefined,
      dealer:  undefined,
      phase:   'playing',
    });

    const embed      = buildEmbed(game, 'playing');
    const components = buildComponents(gameId, game);

    await interaction.reply({ embeds: [embed], components });
    const msg = await interaction.fetchReply();
    updateGame(gameId, { lobbyMsg: msg });
  },

  // ── Helpers exported for interactionCreate.js ──────────────────────────────
  buildEmbed,
  buildComponents,
  revealAllMines,
  computeMultiplier,
  tileMultiplier,
  GRID_SIZE,
};
