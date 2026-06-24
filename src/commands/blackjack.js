/**
 * blackjack.js — Multiplayer blackjack command
 *
 * Flow:
 *  1. /blackjack <bet> [max_players]  → public lobby embed, host auto-joins
 *  2. Others click Join (bet deducted immediately)
 *  3. Host clicks Start → bot DMs each player their hand with Hit/Stand buttons
 *  4. Players interact in DMs; after 90s of inactivity they auto-stand
 *  5. When all players done → dealer draws → results posted in channel
 *
 * Button customIds  (handled in interactionCreate.js):
 *   bj_join_<gameId>
 *   bj_start_<gameId>
 *   bj_cancel_<gameId>
 *   bj_hit_<gameId>
 *   bj_stand_<gameId>
 */

const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');

const { getBalance, removeBalance, addBalance } = require('../utils/economyStore');
const { createGame, getGame, updateGame, deleteGame, getGameByUser } = require('../utils/gameStore');
const { createDeck, handTotal, formatHand, isBlackjack } = require('../utils/cardUtils');

const AUTO_STAND_MS = 90_000; // 90 seconds before auto-stand

// ─── ID generator ────────────────────────────────────────────────────────────

function newGameId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

// ─── Embed builders ──────────────────────────────────────────────────────────

function lobbyEmbed(game) {
  const count   = Object.keys(game.players).length;
  const players = count === 0
    ? '*No players yet*'
    : Object.values(game.players).map(p => `• <@${p.userId}>`).join('\n');

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🃏 Blackjack Lobby')
    .addFields(
      { name: 'Bet',     value: `${game.bet.toLocaleString()} coins`, inline: true },
      { name: 'Players', value: `${count}/${game.maxPlayers}`,        inline: true },
      { name: 'Joined',  value: players }
    )
    .setFooter({ text: 'Bet is deducted when you join • Host starts the game' })
    .setTimestamp();
}

function lobbyButtons(gameId, isFull) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bj_join_${gameId}`)
      .setLabel('Join')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅')
      .setDisabled(isFull),
    new ButtonBuilder()
      .setCustomId(`bj_start_${gameId}`)
      .setLabel('Start Game')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('▶️'),
    new ButtonBuilder()
      .setCustomId(`bj_cancel_${gameId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌')
  );
}

function playerHandEmbed(player) {
  const total = handTotal(player.hand);
  const bj    = isBlackjack(player.hand);
  const bust  = total > 21;

  let statusLine = '';
  if (bj)                       statusLine = '\n🃏 **Blackjack!**';
  else if (bust)                 statusLine = '\n💥 **Bust!**';
  else if (player.status === 'stand') statusLine = '\n✋ **Standing**';

  return new EmbedBuilder()
    .setColor(bust ? 0xED4245 : bj ? 0xF1C40F : 0x57F287)
    .setTitle('🃏 Your Hand')
    .setDescription(`${formatHand(player.hand)}\n**Total: ${total}**${statusLine}`)
    .setFooter({ text: 'Only you can see this • Auto-stand after 90 s' });
}

function hitStandRow(gameId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bj_hit_${gameId}`)
      .setLabel('Hit')
      .setStyle(ButtonStyle.Success)
      .setEmoji('➕')
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`bj_stand_${gameId}`)
      .setLabel('Stand')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('✋')
      .setDisabled(disabled)
  );
}

// ─── Game logic ──────────────────────────────────────────────────────────────

/**
 * Deal cards, DM players, update lobby message to "in progress".
 * Called when host presses Start.
 */
async function startGame(game, client) {
  updateGame(game.gameId, { phase: 'playing' });
  game = getGame(game.gameId);

  // Shuffle deck and deal
  const deck = createDeck();
  updateGame(game.gameId, { deck });

  for (const p of Object.values(game.players)) {
    p.hand   = [deck.shift(), deck.shift()];
    p.status = isBlackjack(p.hand) ? 'blackjack' : 'playing';
    p.done   = p.status === 'blackjack';
  }

  game.dealer.hand = [deck.shift(), deck.shift()];

  // DM every player their hand
  for (const p of Object.values(game.players)) {
    try {
      const user = await client.users.fetch(p.userId);
      const dm   = await user.createDM();
      const msg  = await dm.send({
        embeds:     [playerHandEmbed(p)],
        components: p.done ? [] : [hitStandRow(game.gameId)]
      });
      p.dmChannelId  = dm.id;
      p.dmMessageId  = msg.id;
    } catch {
      // DMs closed — auto-stand
      p.status = 'stand';
      p.done   = true;
    }

    // Auto-stand timeout
    if (!p.done) {
      p.timeout = setTimeout(async () => {
        const g = getGame(game.gameId);
        if (!g) return;
        const pl = g.players[p.userId];
        if (!pl || pl.done) return;
        pl.status = 'stand';
        pl.done   = true;
        try {
          const ch  = await client.channels.fetch(pl.dmChannelId);
          const msg = await ch.messages.fetch(pl.dmMessageId);
          await msg.edit({ embeds: [playerHandEmbed(pl)], components: [] });
        } catch {}
        await checkAllDone(g, client);
      }, AUTO_STAND_MS);
    }
  }

  // Update lobby → in-progress
  const dealerCard = game.dealer.hand[0];
  const progress = new EmbedBuilder()
    .setColor(0xF1C40F)
    .setTitle('🃏 Blackjack — In Progress')
    .setDescription('Players: check your DMs and use the **Hit / Stand** buttons!')
    .addFields(
      { name: 'Dealer shows', value: `\`${dealerCard.value}${dealerCard.suit}\` 🂠` },
      { name: 'Players', value: Object.values(game.players).map(p => `<@${p.userId}> — playing...`).join('\n') }
    )
    .setTimestamp();

  try {
    await game.lobbyMsg.edit({ embeds: [progress], components: [] });
  } catch {}

  // All might already be done (e.g. blackjacks or all DMs closed)
  await checkAllDone(game, client);
}

/**
 * If all players are done, dealer draws and results are posted.
 */
async function checkAllDone(game, client) {
  game = getGame(game.gameId);
  if (!game || game.phase !== 'playing') return;
  if (!Object.values(game.players).every(p => p.done)) return;

  // Clear any lingering timeouts
  for (const p of Object.values(game.players))
    if (p.timeout) { clearTimeout(p.timeout); p.timeout = null; }

  // Dealer draws to 17+
  while (handTotal(game.dealer.hand) < 17)
    game.dealer.hand.push(game.deck.shift());

  const dealerTotal = handTotal(game.dealer.hand);
  const dealerBust  = dealerTotal > 21;
  const dealerBJ    = isBlackjack(game.dealer.hand);

  // Resolve each player
  const lines = [];
  for (const p of Object.values(game.players)) {
    const pTotal = handTotal(p.hand);
    const pBust  = pTotal > 21;
    const pBJ    = isBlackjack(p.hand);

    let outcome, payout;

    if (pBust) {
      outcome = '❌ BUST';     payout = 0;
    } else if (pBJ && !dealerBJ) {
      outcome = '🃏 BLACKJACK'; payout = Math.floor(game.bet * 2.5);
      addBalance(p.userId, payout);
    } else if (dealerBust || pTotal > dealerTotal) {
      outcome = '✅ WIN';       payout = game.bet * 2;
      addBalance(p.userId, payout);
    } else if (pTotal === dealerTotal) {
      outcome = '🤝 TIE';      payout = game.bet;
      addBalance(p.userId, payout);
    } else {
      outcome = '❌ LOSE';     payout = 0;
    }

    const coinStr = payout > 0 ? `+${payout.toLocaleString()} coins` : `-${game.bet.toLocaleString()} coins`;
    lines.push(`${outcome} <@${p.userId}> **(${pTotal})** — ${coinStr}`);
  }

  const resultsEmbed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🃏 Blackjack Results')
    .addFields(
      {
        name:  `Dealer — ${dealerTotal}${dealerBust ? ' 💥 BUST' : ''}`,
        value: formatHand(game.dealer.hand)
      },
      { name: 'Results', value: lines.join('\n') }
    )
    .setTimestamp();

  try {
    await game.lobbyMsg.edit({ embeds: [resultsEmbed], components: [] });
  } catch {}

  deleteGame(game.gameId);
}

// ─── Command definition ───────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Start a multiplayer blackjack game')
    .addIntegerOption(o =>
      o.setName('bet')
        .setDescription('Amount of coins to bet')
        .setRequired(true)
        .setMinValue(1)
    )
    .addIntegerOption(o =>
      o.setName('max_players')
        .setDescription('Max number of players (default: 5)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(10)
    ),

  async execute(interaction, client) {
    const bet        = interaction.options.getInteger('bet');
    const maxPlayers = interaction.options.getInteger('max_players') ?? 5;

    // Prevent double games
    if (getGameByUser(interaction.user.id))
      return interaction.reply({ content: '❌ You already have an active game.', flags: 64 });

    // Check balance
    const balance = getBalance(interaction.user.id);
    if (balance < bet)
      return interaction.reply({ content: `❌ You only have **${balance.toLocaleString()} coins**.`, flags: 64 });

    // Create game & auto-join host
    const id   = newGameId();
    const game = createGame({ gameId: id, hostId: interaction.user.id, bet, maxPlayers, channelId: interaction.channelId });

    removeBalance(interaction.user.id, bet);
    game.players[interaction.user.id] = {
      userId: interaction.user.id, hand: [], status: 'waiting', done: false
    };

    const isFull = Object.keys(game.players).length >= maxPlayers;
    await interaction.reply({ embeds: [lobbyEmbed(game)], components: [lobbyButtons(id, isFull)] });

    const msg = await interaction.fetchReply();
    updateGame(id, { lobbyMsg: msg });
  },

  // Exported so interactionCreate can call them
  startGame,
  checkAllDone,
  lobbyEmbed,
  lobbyButtons,
  playerHandEmbed,
  hitStandRow,
};
