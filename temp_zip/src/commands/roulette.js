const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance, removeBalance, addBalance } = require('../utils/economyStore');

const ROULETTE_NUMBERS = [
  { n: 0, c: 'green', e: '🟢' },
  { n: 32, c: 'red', e: '🔴' }, { n: 15, c: 'black', e: '⚫' }, { n: 19, c: 'red', e: '🔴' }, { n: 4, c: 'black', e: '⚫' },
  { n: 21, c: 'red', e: '🔴' }, { n: 2, c: 'black', e: '⚫' }, { n: 25, c: 'red', e: '🔴' }, { n: 17, c: 'black', e: '⚫' },
  { n: 34, c: 'red', e: '🔴' }, { n: 6, c: 'black', e: '⚫' }, { n: 27, c: 'red', e: '🔴' }, { n: 13, c: 'black', e: '⚫' },
  { n: 36, c: 'red', e: '🔴' }, { n: 11, c: 'black', e: '⚫' }, { n: 30, c: 'red', e: '🔴' }, { n: 8, c: 'black', e: '⚫' },
  { n: 23, c: 'red', e: '🔴' }, { n: 10, c: 'black', e: '⚫' }, { n: 5, c: 'red', e: '🔴' }, { n: 24, c: 'black', e: '⚫' },
  { n: 16, c: 'red', e: '🔴' }, { n: 33, c: 'black', e: '⚫' }, { n: 1, c: 'red', e: '🔴' }, { n: 20, c: 'black', e: '⚫' },
  { n: 14, c: 'red', e: '🔴' }, { n: 31, c: 'black', e: '⚫' }, { n: 9, c: 'red', e: '🔴' }, { n: 22, c: 'black', e: '⚫' },
  { n: 18, c: 'red', e: '🔴' }, { n: 29, c: 'black', e: '⚫' }, { n: 7, c: 'red', e: '🔴' }, { n: 28, c: 'black', e: '⚫' },
  { n: 12, c: 'red', e: '🔴' }, { n: 35, c: 'black', e: '⚫' }, { n: 3, c: 'red', e: '🔴' }, { n: 26, c: 'black', e: '⚫' }
];

function generateBoard(centerIdx) {
  const board = [];
  for (let i = -2; i <= 2; i++) {
    let idx = (centerIdx + i) % ROULETTE_NUMBERS.length;
    if (idx < 0) idx += ROULETTE_NUMBERS.length;
    board.push(ROULETTE_NUMBERS[idx]);
  }
  return board;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roulette')
    .setDescription('Spin the roulette wheel!')
    .addIntegerOption(o => o.setName('bet').setDescription('Amount of coins to bet').setRequired(true).setMinValue(1))
    .addStringOption(o => 
      o.setName('color')
       .setDescription('Color to bet on')
       .setRequired(true)
       .addChoices(
         { name: '🔴 Red (2x payout)', value: 'red' },
         { name: '⚫ Black (2x payout)', value: 'black' },
         { name: '🟢 Green (14x payout)', value: 'green' }
       )
    ),

  async execute(interaction) {
    const bet = interaction.options.getInteger('bet');
    const color = interaction.options.getString('color');

    const bal = getBalance(interaction.user.id);
    if (bal < bet) return interaction.reply({ content: `❌ You only have **${bal.toLocaleString()} coins**.`, flags: 64 });

    removeBalance(interaction.user.id, bet);

    const spinEmbed = new EmbedBuilder()
      .setColor(0xF1C40F)
      .setTitle('🎰 Roulette — Spinning...');
      
    const reply = await interaction.reply({ embeds: [spinEmbed], fetchReply: true });

    const targetIdx = Math.floor(Math.random() * ROULETTE_NUMBERS.length);
    const result = ROULETTE_NUMBERS[targetIdx];
    
    // Pre-calculate 4 frames to make it run as fast as Discord allows
    const frames = [];
    let currentIdx = (targetIdx + 12) % ROULETTE_NUMBERS.length;
    for (let i = 0; i < 4; i++) {
      currentIdx = (currentIdx - 3 + ROULETTE_NUMBERS.length) % ROULETTE_NUMBERS.length;
      const board = generateBoard(currentIdx);
      const str = [board[1], board[2], board[3]].map((b, idx) => {
        if (idx === 1) return `> **${b.e} ${b.n}** ⬅️`;
        return `> ${b.e} ${b.n}`;
      }).join('\n');
      frames.push(str);
    }

    // Play the pre-calculated frames
    for (const frame of frames) {
      spinEmbed.setDescription(frame);
      await reply.edit({ embeds: [spinEmbed] }).catch(() => {});
      await new Promise(r => setTimeout(r, 1200));
    }

    // Final result
    const board = generateBoard(targetIdx);
    const finalStr = [board[1], board[2], board[3]].map((b, idx) => {
      if (idx === 1) return `> **${b.e} ${b.n}** ⬅️`;
      return `> ${b.e} ${b.n}`;
    }).join('\n');

    let won = result.c === color;
    let payout = 0;
    if (won) {
      if (color === 'green') payout = bet * 14;
      else payout = bet * 2;
      addBalance(interaction.user.id, payout);
    }

    const finalEmbed = new EmbedBuilder()
      .setColor(won ? 0x57F287 : 0xED4245)
      .setTitle(`🎰 Roulette Result: ${result.e} ${result.n}`)
      .setDescription(`${finalStr}\n\n` + (won ? `🎉 **You won ${payout.toLocaleString()} coins!**` : `❌ **You lost ${bet.toLocaleString()} coins.**`))
      .addFields({ name: 'Your Bet', value: `${bet.toLocaleString()} coins on ${color === 'red' ? '🔴 Red' : color === 'black' ? '⚫ Black' : '🟢 Green'}`})
      .setTimestamp();

    await reply.edit({ embeds: [finalEmbed] }).catch(() => {});
  }
};
