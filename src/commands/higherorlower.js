/**
 * higherorlower.js — Solo Higher or Lower card game
 *
 * Flow:
 *  1. /higherorlower <bet> → bet deducted, first card shown
 *  2. Player clicks Higher / Lower (or Cash Out after first correct guess)
 *  3. Correct guess → multiplier increases, new card shown
 *  4. Wrong guess   → lose bet (already deducted)
 *  5. Cash Out      → payout = floor(bet * multiplier)
 *  6. Equal value   → free round (counts as correct, same multiplier)
 *
 * Button customIds: hol_higher_<gameId> | hol_lower_<gameId> | hol_cashout_<gameId>
 *
 * Multiplier ladder (index → value):
 *  0=1.0 → 1=1.5 → 2=2.0 → 3=2.5 → 4=3.0 → 5=4.0 → 6=5.0 → 7=7.5 → 8=10.0
 */

const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');

const { getBalance, removeBalance, addBalance } = require('../utils/economyStore');
const { createGame, getGame, updateGame, deleteGame, getGameByUser } = require('../utils/gameStore');

// ─── Constants ────────────────────────────────────────────────────────────────

const MULTIPLIER_LADDER = [1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 7.5, 10.0];

const SUITS  = ['♠️', '♥️', '♦️', '♣️'];
const VALUES = [
  { label: '2',  value: 2  },
  { label: '3',  value: 3  },
  { label: '4',  value: 4  },
  { label: '5',  value: 5  },
  { label: '6',  value: 6  },
  { label: '7',  value: 7  },
  { label: '8',  value: 8  },
  { label: '9',  value: 9  },
  { label: '10', value: 10 },
  { label: 'J',  value: 11 },
  { label: 'Q',  value: 12 },
  { label: 'K',  value: 13 },
  { label: 'A',  value: 14 },
];

// ─── ID generator ─────────────────────────────────────────────────────────────

function newGameId() {
  return 'hol' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

// ─── Card helpers ─────────────────────────────────────────────────────────────

function randomCard() {
  const val  = VALUES[Math.floor(Math.random() * VALUES.length)];
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
  return { label: val.label, value: val.value, suit };
}

function cardDisplay(card) {
  return `**${card.label}${card.suit}**`;
}

// ─── Embed & button builders ──────────────────────────────────────────────────

function gameEmbed(game, status = null) {
  const multIndex   = game.multIndex;
  const multiplier  = MULTIPLIER_LADDER[multIndex];
  const nextMult    = MULTIPLIER_LADDER[Math.min(multIndex + 1, MULTIPLIER_LADDER.length - 1)];
  const canCashOut  = multIndex > 0;
  const currentPayout = Math.floor(game.bet * multiplier);

  const card = game.currentCard;

  let color = 0x5865F2;
  if (status === 'win')  color = 0x57F287;
  if (status === 'lose') color = 0xED4245;
  if (status === 'tie')  color = 0xFEE75C;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('🃏 Higher or Lower')
    .setDescription(`Current Card:\n# ${cardDisplay(card)}`)
    .addFields(
      { name: '💰 Bet',         value: `${game.bet.toLocaleString()} coins`,       inline: true },
      { name: '✖️ Multiplier',  value: `**${multiplier}x**`,                       inline: true },
      { name: '🏆 Next Mult',   value: multIndex >= MULTIPLIER_LADDER.length - 1 ? '*Maxed!*' : `${nextMult}x`, inline: true },
      { name: '💵 Cash Out',    value: canCashOut ? `${currentPayout.toLocaleString()} coins` : '*Win a round first!*', inline: true },
      { name: '🔢 Rounds Won',  value: `${multIndex}`, inline: true },
    )
    .setFooter({ text: 'Will the next card be higher or lower?' })
    .setTimestamp();

  if (status === 'win')  embed.setDescription(`**You cashed out!**\n\nFinal Card: ${cardDisplay(card)}`);
  if (status === 'lose') embed.setDescription(`**Wrong guess — you lose!**\n\nThe card was: ${cardDisplay(card)}`);
  if (status === 'tie')  embed.setDescription(`**Equal value — free round!**\n\nCard: ${cardDisplay(card)}`);

  return embed;
}

/**
 * @param {string} gameId
 * @param {boolean} canCashOut - show cash out button only if at least 1 correct guess
 * @param {boolean} disabled   - disable all buttons (end state)
 */
function gameButtons(gameId, canCashOut, disabled = false) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`hol_higher_${gameId}`)
      .setLabel('Higher')
      .setStyle(ButtonStyle.Success)
      .setEmoji('⬆️')
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`hol_lower_${gameId}`)
      .setLabel('Lower')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('⬇️')
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`hol_cashout_${gameId}`)
      .setLabel('Cash Out')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('💰')
      .setDisabled(disabled || !canCashOut),
  );
  return row;
}

// ─── Core game handler ────────────────────────────────────────────────────────

/**
 * Handle a button press on an active Higher or Lower game.
 * Called from interactionCreate.js.
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {'higher'|'lower'|'cashout'} action
 * @param {string} gameId
 */
async function handleButton(interaction, action, gameId) {
  const game = getGame(gameId);

  if (!game) {
    return interaction.reply({ content: '❌ This game no longer exists.', flags: 64 });
  }

  if (interaction.user.id !== game.hostId) {
    return interaction.reply({ content: '❌ This is not your game!', flags: 64 });
  }

  // ── Cash Out ───────────────────────────────────────────────────────────────
  if (action === 'cashout') {
    if (game.multIndex === 0) {
      return interaction.reply({ content: '❌ Win at least one round before cashing out!', flags: 64 });
    }

    const multiplier = MULTIPLIER_LADDER[game.multIndex];
    const payout     = Math.floor(game.bet * multiplier);
    await addBalance(game.hostId, payout);

    const embed = gameEmbed(game, 'win')
      .setTitle('💰 Higher or Lower — Cashed Out!')
      .addFields({ name: '🎉 Payout', value: `${payout.toLocaleString()} coins` });

    await interaction.update({ embeds: [embed], components: [gameButtons(gameId, true, true)] });
    deleteGame(gameId);
    return;
  }

  // ── Higher / Lower guess ───────────────────────────────────────────────────
  const prevCard  = game.currentCard;
  const nextCard  = randomCard();
  const isHigher  = nextCard.value > prevCard.value;
  const isEqual   = nextCard.value === prevCard.value;
  const guessedHigher = action === 'higher';

  updateGame(gameId, { currentCard: nextCard });

  // Equal → free round
  if (isEqual) {
    const embed = gameEmbed(getGame(gameId), 'tie')
      .setTitle('🎲 Higher or Lower — Tie!')
      .addFields({ name: 'Next Card', value: cardDisplay(nextCard) });

    return interaction.update({
      embeds: [embed],
      components: [gameButtons(gameId, game.multIndex > 0)],
    });
  }

  const correct = (guessedHigher && isHigher) || (!guessedHigher && !isHigher);

  if (correct) {
    const newMultIndex = Math.min(game.multIndex + 1, MULTIPLIER_LADDER.length - 1);
    updateGame(gameId, { multIndex: newMultIndex });
    const updatedGame = getGame(gameId);

    // Auto-win at max multiplier
    if (newMultIndex === MULTIPLIER_LADDER.length - 1) {
      const payout = Math.floor(game.bet * MULTIPLIER_LADDER[newMultIndex]);
      await addBalance(game.hostId, payout);

      const embed = gameEmbed(updatedGame)
        .setTitle('🏆 Higher or Lower — Max Multiplier!')
        .setColor(0xF1C40F)
        .setDescription(`**You reached the max multiplier!**\nThe card was: ${cardDisplay(nextCard)}`)
        .addFields({ name: '🎉 Payout', value: `${payout.toLocaleString()} coins` });

      await interaction.update({ embeds: [embed], components: [gameButtons(gameId, true, true)] });
      deleteGame(gameId);
      return;
    }

    const embed = gameEmbed(updatedGame)
      .setTitle('✅ Higher or Lower — Correct!')
      .setColor(0x57F287)
      .setDescription(`Correct! The card was: ${cardDisplay(nextCard)}\n\nNext card is shown below — is it higher or lower?`);

    return interaction.update({
      embeds: [embed],
      components: [gameButtons(gameId, true)],
    });
  }

  // Wrong guess — lose
  const embed = gameEmbed(getGame(gameId), 'lose')
    .setTitle('❌ Higher or Lower — Wrong!')
    .addFields({ name: 'The card was', value: cardDisplay(nextCard) });

  await interaction.update({ embeds: [embed], components: [gameButtons(gameId, false, true)] });
  deleteGame(gameId);
}

// ─── Command definition ───────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('higherorlower')
    .setDescription('Play Higher or Lower — guess if the next card is higher or lower!')
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
      return interaction.reply({ content: `❌ You only have **${balance.toLocaleString()} coins**.`, flags: 64 });

    await removeBalance(interaction.user.id, bet);

    const gameId      = newGameId();
    const firstCard   = randomCard();

    createGame({
      gameId,
      hostId:      interaction.user.id,
      bet,
      currentCard: firstCard,
      multIndex:   0,        // index into MULTIPLIER_LADDER
      channelId:   interaction.channelId,
      phase:       'playing',
    });

    const embed = gameEmbed(getGame(gameId))
      .setTitle('🃏 Higher or Lower — Game Started!');

    await interaction.reply({
      embeds:     [embed],
      components: [gameButtons(gameId, false)],
    });

    const msg = await interaction.fetchReply();
    updateGame(gameId, { lobbyMsg: msg });
  },

  // Exported for interactionCreate.js
  handleButton,
  gameEmbed,
  gameButtons,
};
