/**
 * slots.js — Solo slot machine game
 *
 * Flow:
 *  1. /slots <bet> → bet is deducted immediately
 *  2. Message is edited 3 times with random symbols for a "spinning" effect
 *  3. Final result is shown and winnings are paid out (if any)
 *
 * Symbol weights:
 *  🍒 30% | 🍋 25% | 🍊 20% | 🍇 15% | 💎 7% | 7️⃣ 3%
 *
 * Payouts:
 *  Three 7️⃣  → 50x
 *  Three 💎   → 20x
 *  Three other→  5x
 *  Two same   → 1.5x (returns bet + 50%)
 *  No match   →  0  (lose bet)
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance, removeBalance, addBalance } = require('../utils/economyStore');

// ─── Symbol table ─────────────────────────────────────────────────────────────

const SYMBOLS = [
  { emoji: '🍒', weight: 30 },
  { emoji: '🍋', weight: 25 },
  { emoji: '🍊', weight: 20 },
  { emoji: '🍇', weight: 15 },
  { emoji: '💎', weight:  7 },
  { emoji: '7️⃣', weight:  3 },
];

const TOTAL_WEIGHT = SYMBOLS.reduce((s, sym) => s + sym.weight, 0); // 100

/** Pick one weighted-random symbol emoji */
function spin() {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const sym of SYMBOLS) {
    roll -= sym.weight;
    if (roll <= 0) return sym.emoji;
  }
  return SYMBOLS[SYMBOLS.length - 1].emoji; // fallback
}

/** Pick 3 reels */
function spinReels() {
  return [spin(), spin(), spin()];
}

// ─── Payout logic ─────────────────────────────────────────────────────────────

/**
 * @returns {{ multiplier: number, label: string, color: number }}
 */
function evalReels(reels) {
  const [a, b, c] = reels;

  if (a === b && b === c) {
    if (a === '7️⃣') return { multiplier: 50,  label: '🎰 JACKPOT! Three 7s!',        color: 0xF1C40F };
    if (a === '💎') return { multiplier: 20,  label: '💎 Three Diamonds!',             color: 0x00BFFF };
    return             { multiplier: 5,   label: `${a} Three of a Kind!`,          color: 0x57F287 };
  }

  if (a === b || b === c || a === c) {
    return { multiplier: 1.5, label: '🎲 Two of a Kind!',                           color: 0xFEE75C };
  }

  return { multiplier: 0, label: '💸 No Match — Better luck next time!',            color: 0xED4245 };
}

// ─── Embed builders ───────────────────────────────────────────────────────────

const SPIN_FRAMES = ['🎰 Spinning...', '🎰 Spinning..', '🎰 Spinning.'];

function spinningEmbed(frame, reels, bet) {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(SPIN_FRAMES[frame % SPIN_FRAMES.length])
    .setDescription(`\`\`\`\n╔══════════════╗\n║  ${reels.join('  ')}  ║\n╚══════════════╝\`\`\``)
    .addFields({ name: 'Bet', value: `${bet.toLocaleString()} coins`, inline: true })
    .setFooter({ text: 'Reels are spinning...' });
}

function resultEmbed(reels, bet, result) {
  const winnings  = Math.floor(bet * result.multiplier);
  const netChange = winnings - bet;
  const sign      = netChange >= 0 ? '+' : '';

  return new EmbedBuilder()
    .setColor(result.color)
    .setTitle(`🎰 Slot Machine`)
    .setDescription(`\`\`\`\n╔══════════════╗\n║  ${reels.join('  ')}  ║\n╚══════════════╝\`\`\`\n**${result.label}**`)
    .addFields(
      { name: 'Bet',      value: `${bet.toLocaleString()} coins`,         inline: true },
      { name: 'Payout',   value: `${winnings.toLocaleString()} coins`,    inline: true },
      { name: 'Net',      value: `${sign}${netChange.toLocaleString()} coins`, inline: true },
    )
    .setFooter({ text: result.multiplier > 0 ? '🎉 Winnings added to your balance!' : '😢 Better luck next time!' })
    .setTimestamp();
}

// ─── Command definition ───────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Spin the slot machine!')
    .addIntegerOption(o =>
      o.setName('bet')
        .setDescription('Amount of coins to bet')
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    const bet = interaction.options.getInteger('bet');

    // Balance check
    const balance = await getBalance(interaction.user.id);
    if (balance < bet)
      return interaction.reply({ content: `❌ You only have **${balance.toLocaleString()} coins**.`, flags: 64 });

    // Deduct bet upfront
    await removeBalance(interaction.user.id, bet);

    // Initial spinning reply
    await interaction.reply({ embeds: [spinningEmbed(0, spinReels(), bet)] });
    const msg = await interaction.fetchReply();

    // Animate — 3 spin frames with 800 ms gaps
    for (let i = 1; i <= 3; i++) {
      await new Promise(r => setTimeout(r, 800));
      try {
        await msg.edit({ embeds: [spinningEmbed(i, spinReels(), bet)] });
      } catch { /* ignore edit failures */ }
    }

    // Final result
    const finalReels = spinReels();
    const result     = evalReels(finalReels);
    const winnings   = Math.floor(bet * result.multiplier);

    if (winnings > 0) await addBalance(interaction.user.id, winnings);

    await new Promise(r => setTimeout(r, 600));
    try {
      await msg.edit({ embeds: [resultEmbed(finalReels, bet, result)] });
    } catch { /* ignore */ }
  },
};
