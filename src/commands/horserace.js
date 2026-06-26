const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { getBalance, removeBalance, addBalance } = require('../utils/economyStore');
const { createGame, getGame, updateGame, deleteGame, getGameByUser } = require('../utils/gameStore');

// ─── Constants ─────────────────────────────────────────────────────────────────

const HORSES = [
  { id: 'donut',   emoji: '🐴', name: 'Donut',   color: 0xF4A460 },
  { id: 'rainbow', emoji: '🦄', name: 'Rainbow',  color: 0xDA70D6 },
  { id: 'shadow',  emoji: '🐎', name: 'Shadow',   color: 0x708090 },
  { id: 'thunder', emoji: '🏇', name: 'Thunder',  color: 0x4169E1 },
];

const TRACK_LENGTH = 20;
const RACE_ROUNDS  = 5;   // number of edit frames before checking for a winner
const FRAME_DELAY  = 1800; // ms between frames

// ─── Helpers ───────────────────────────────────────────────────────────────────

function newGameId() {
  return 'hr' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

function getHorse(id) {
  return HORSES.find(h => h.id === id);
}

/** Render a single horse lane with positioned horse between [🏁] and [START] */
function renderLane(horse, pos) {
  const TRACK = 15;
  const scaled = Math.round((pos / TRACK_LENGTH) * TRACK);
  const left  = '═'.repeat(TRACK - scaled);  // shrinks as horse advances
  const right = '═'.repeat(scaled);            // grows as horse advances
  const posStr = `${pos}`.padStart(2, ' ');
  return `[🏁]${left}${horse.emoji}${right}[START]  ${horse.name} (${posStr}/${TRACK_LENGTH})`;
}

/** Build the full race display for all horses */
function buildRaceDisplay(positions) {
  return HORSES.map(h => renderLane(h, positions[h.id])).join('\n');
}

// ─── Embeds ────────────────────────────────────────────────────────────────────

function lobbyEmbed(game) {
  const bets = HORSES.map(h => {
    const bettors = Object.values(game.players)
      .filter(p => p.horse === h.id)
      .map(p => `<@${p.userId}>`);
    return { name: `${h.emoji} ${h.name} (${bettors.length})`, value: bettors.join('\n') || '*No bets yet*', inline: true };
  });

  return new EmbedBuilder()
    .setColor(0x2ECC71)
    .setTitle('🏁 Horse Race — Lobby')
    .setDescription(
      `**Bet:** ${game.bet.toLocaleString()} coins per player\n` +
      `Pick a horse to bet on! All players who bet on the winning horse **split the pot**.\n\n` +
      `*You can only bet on one horse.*`
    )
    .addFields(bets)
    .setFooter({ text: 'Bet is deducted immediately • Host can start or cancel' })
    .setTimestamp();
}

function lobbyButtons(gameId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`hr_donut_${gameId}`)
        .setLabel('🐴 Donut')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`hr_rainbow_${gameId}`)
        .setLabel('🦄 Rainbow')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`hr_shadow_${gameId}`)
        .setLabel('🐎 Shadow')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`hr_thunder_${gameId}`)
        .setLabel('🏇 Thunder')
        .setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`hr_start_${gameId}`)
        .setLabel('Start Race')
        .setStyle(ButtonStyle.Success)
        .setEmoji('▶️'),
      new ButtonBuilder()
        .setCustomId(`hr_cancel_${gameId}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌'),
    ),
  ];
}

function raceEmbed(game, positions, label) {
  const totalPlayers = Object.keys(game.players).length;
  const pot          = game.pot || game.bet * totalPlayers;

  return new EmbedBuilder()
    .setColor(0xF1C40F)
    .setTitle(`🏁 Horse Race — ${label}`)
    .setDescription(
      `**💰 Pot:** ${pot.toLocaleString()} coins\n\n` +
      `\`\`\`\n${buildRaceDisplay(positions)}\n\`\`\``
    )
    .setFooter({ text: 'First to the 🏁 wins!' })
    .setTimestamp();
}

// ─── Race animation ────────────────────────────────────────────────────────────

async function runRace(game) {
  const gameId    = game.gameId;
  const positions = { donut: 0, rainbow: 0, shadow: 0, thunder: 0 };

  // Opening frame
  await game.lobbyMsg.edit({
    embeds: [raceEmbed(game, positions, 'And they\'re off!')],
    components: [],
  }).catch(() => {});

  await new Promise(r => setTimeout(r, FRAME_DELAY));

  let winner = null;
  let round  = 0;

  while (!winner) {
    round++;

    // Move horses
    for (const h of HORSES) {
      positions[h.id] = Math.min(positions[h.id] + Math.floor(Math.random() * 4), TRACK_LENGTH);
    }

    // Check for winner(s) — there can be a tie
    const finishers = HORSES.filter(h => positions[h.id] >= TRACK_LENGTH);
    const label     = finishers.length ? '🏆 Finish Line!' : `Round ${round}`;

    await game.lobbyMsg.edit({
      embeds: [raceEmbed(game, positions, label)],
      components: [],
    }).catch(() => {});

    if (finishers.length) {
      // If multiple horses cross on the same frame, pick the one furthest ahead.
      // Ties are broken by the highest position value.
      const maxPos  = Math.max(...finishers.map(h => positions[h.id]));
      const topTied = finishers.filter(h => positions[h.id] === maxPos);

      // True tie — pick randomly
      winner = topTied[Math.floor(Math.random() * topTied.length)];
      break;
    }

    await new Promise(r => setTimeout(r, FRAME_DELAY));
  }

  return winner;
}

// ─── Resolve payouts ───────────────────────────────────────────────────────────

async function resolveRace(game, winner) {
  const gameId     = game.gameId;
  const pot        = game.pot;
  const winBettors = Object.values(game.players).filter(p => p.horse === winner.id);

  let resultLines = [];

  if (winBettors.length > 0) {
    const share = Math.floor(pot / winBettors.length);
    for (const p of winBettors) {
      await addBalance(p.userId, share);
      resultLines.push(`<@${p.userId}> wins **+${share.toLocaleString()} coins**! 🎉`);
    }
  } else {
    resultLines.push('*Nobody bet on the winner — the house keeps the pot!*');
  }

  const losers = Object.values(game.players)
    .filter(p => p.horse !== winner.id)
    .map(p => {
      const h = getHorse(p.horse);
      return `<@${p.userId}> (${h.emoji} ${h.name})`;
    });

  const resultEmbed = new EmbedBuilder()
    .setColor(winner.color)
    .setTitle(`🏆 ${winner.emoji} ${winner.name} Wins the Race!`)
    .setDescription(
      `**Winners:**\n${resultLines.join('\n')}\n\n` +
      `${losers.length ? `**Lost their bet:**\n${losers.join(', ')}` : ''}\n\n` +
      `**Total pot:** ${pot.toLocaleString()} coins`
    )
    .setTimestamp();

  await game.lobbyMsg.edit({ embeds: [resultEmbed], components: [] }).catch(() => {});
  deleteGame(gameId);
}

// ─── Exported handler (called by interactionCreate) ────────────────────────────

/**
 * handleHorseRace — routes button interactions for hr_* customIds
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {object} client
 * @param {string} action  — donut | rainbow | shadow | thunder | start | cancel
 * @param {string} gameId
 */
async function handleHorseRace(interaction, client, action, gameId) {
  const horseIds = HORSES.map(h => h.id);
  let game       = getGame(gameId);

  // ── PICK A HORSE ──────────────────────────────────────────────────────────
  if (horseIds.includes(action)) {
    if (!game || game.phase !== 'lobby')
      return interaction.reply({ content: '❌ This lobby is no longer open.', flags: 64 });
    if (game.players[interaction.user.id])
      return interaction.reply({ content: '❌ You already placed a bet. You can only bet once.', flags: 64 });

    const horse = getHorse(action);
    const bal   = await getBalance(interaction.user.id);

    if (bal < game.bet)
      return interaction.reply({
        content: `❌ You need **${game.bet.toLocaleString()} coins** to bet. You have **${bal.toLocaleString()}**.`,
        flags: 64,
      });

    await removeBalance(interaction.user.id, game.bet);
    game.players[interaction.user.id] = { userId: interaction.user.id, horse: action };
    updateGame(gameId, { pot: game.pot + game.bet });

    await interaction.update({ embeds: [lobbyEmbed(getGame(gameId))], components: lobbyButtons(gameId) });
  }

  // ── START ─────────────────────────────────────────────────────────────────
  else if (action === 'start') {
    if (!game)
      return interaction.reply({ content: '❌ Game not found.', flags: 64 });
    if (game.hostId !== interaction.user.id)
      return interaction.reply({ content: '❌ Only the host can start the race.', flags: 64 });
    if (game.phase !== 'lobby')
      return interaction.reply({ content: '❌ The race has already started.', flags: 64 });
    if (Object.keys(game.players).length < 1)
      return interaction.reply({ content: '❌ At least one player must bet to start the race.', flags: 64 });

    updateGame(gameId, { phase: 'racing' });
    game = getGame(gameId);

    await interaction.deferUpdate();

    // Run the animated race
    const winner = await runRace(game);
    game = getGame(gameId); // re-fetch in case of async state changes

    // Brief dramatic pause before payout reveal
    await new Promise(r => setTimeout(r, 1200));
    await resolveRace(game, winner);
  }

  // ── CANCEL ────────────────────────────────────────────────────────────────
  else if (action === 'cancel') {
    if (!game)
      return interaction.reply({ content: '❌ Game not found.', flags: 64 });
    if (game.hostId !== interaction.user.id)
      return interaction.reply({ content: '❌ Only the host can cancel.', flags: 64 });
    if (game.phase === 'racing')
      return interaction.reply({ content: '❌ You cannot cancel a race in progress.', flags: 64 });

    for (const p of Object.values(game.players))
      await addBalance(p.userId, game.bet);

    deleteGame(gameId);

    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('❌ Race Cancelled')
          .setDescription('All bets have been refunded.')
          .setTimestamp(),
      ],
      components: [],
    });
  }
}

// ─── Module exports ────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('horserace')
    .setDescription('Open a multiplayer horse race lobby! Pick a horse and split the pot if it wins.')
    .addIntegerOption(o =>
      o.setName('bet')
        .setDescription('Amount each player must bet to enter')
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction, client) {
    const bet = interaction.options.getInteger('bet');

    if (getGameByUser(interaction.user.id))
      return interaction.reply({ content: '❌ You already have an active game.', flags: 64 });

    const id   = newGameId();
    const game = createGame({
      gameId: id,
      type: 'horserace',
      hostId: interaction.user.id,
      bet,
      pot: 0,
      maxPlayers: 99,
      channelId: interaction.channelId,
    });

    await interaction.reply({ embeds: [lobbyEmbed(game)], components: lobbyButtons(id) });
    const msg = await interaction.fetchReply();
    updateGame(id, { lobbyMsg: msg });
  },

  // Exported for interactionCreate.js
  handleHorseRace,
  lobbyEmbed,
  lobbyButtons,
  HORSES,
};
