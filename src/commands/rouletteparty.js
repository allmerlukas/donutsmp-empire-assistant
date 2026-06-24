const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getBalance, removeBalance, addBalance } = require('../utils/economyStore');
const { createGame, getGame, updateGame, deleteGame, getGameByUser } = require('../utils/gameStore');

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

function newGameId() {
  return 'rlp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

function lobbyEmbed(game) {
  const reds = Object.values(game.players).filter(p => p.color === 'red').map(p => `<@${p.userId}>`);
  const blacks = Object.values(game.players).filter(p => p.color === 'black').map(p => `<@${p.userId}>`);
  const greens = Object.values(game.players).filter(p => p.color === 'green').map(p => `<@${p.userId}>`);

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎰 Party Roulette Lobby')
    .setDescription(`**Entry Bet:** ${game.bet.toLocaleString()} coins`)
    .addFields(
      { name: `🔴 Red (${reds.length})`, value: reds.join('\n') || '*None*', inline: true },
      { name: `⚫ Black (${blacks.length})`, value: blacks.join('\n') || '*None*', inline: true },
      { name: `🟢 Green (${greens.length})`, value: greens.join('\n') || '*None*', inline: true }
    )
    .setFooter({ text: 'Bet is deducted when you choose a color • Host starts the game' })
    .setTimestamp();
}

function lobbyButtons(gameId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rlp_red_${gameId}`).setLabel('Bet Red').setStyle(ButtonStyle.Danger).setEmoji('🔴'),
      new ButtonBuilder().setCustomId(`rlp_black_${gameId}`).setLabel('Bet Black').setStyle(ButtonStyle.Secondary).setEmoji('⚫'),
      new ButtonBuilder().setCustomId(`rlp_green_${gameId}`).setLabel('Bet Green').setStyle(ButtonStyle.Success).setEmoji('🟢')
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rlp_start_${gameId}`).setLabel('Start Spin').setStyle(ButtonStyle.Primary).setEmoji('▶️'),
      new ButtonBuilder().setCustomId(`rlp_cancel_${gameId}`).setLabel('Cancel').setStyle(ButtonStyle.Danger).setEmoji('❌')
    )
  ];
}

async function startGame(game, client) {
  updateGame(game.gameId, { phase: 'spinning' });
  game = getGame(game.gameId);

  const spinEmbed = new EmbedBuilder().setColor(0xF1C40F).setTitle('🎰 Party Roulette — Spinning...');
  await game.lobbyMsg.edit({ embeds: [spinEmbed], components: [] });

  const targetIdx = Math.floor(Math.random() * ROULETTE_NUMBERS.length);
  const result = ROULETTE_NUMBERS[targetIdx];
  
  let currentIdx = (targetIdx + 12) % ROULETTE_NUMBERS.length;
  
  for (let i = 0; i < 4; i++) {
    currentIdx = (currentIdx - 3 + ROULETTE_NUMBERS.length) % ROULETTE_NUMBERS.length;
    const board = generateBoard(currentIdx);
    const str = board.map((b, idx) => {
      if (idx === 2) return `**[ ${b.e} ${b.n} ]**`;
      return `${b.e} ${b.n}`;
    }).join(' | ');

    spinEmbed.setDescription(str);
    await game.lobbyMsg.edit({ embeds: [spinEmbed] }).catch(() => {});
    await new Promise(r => setTimeout(r, 1200));
  }

  // Final result
  const board = generateBoard(targetIdx);
  const finalStr = board.map((b, idx) => {
    if (idx === 2) return `**[ ${b.e} ${b.n} ]**`;
    return `${b.e} ${b.n}`;
  }).join(' | ');

  const winners = [];
  let totalPayout = 0;

  for (const p of Object.values(game.players)) {
    if (p.color === result.c) {
      const payout = result.c === 'green' ? game.bet * 14 : game.bet * 2;
      addBalance(p.userId, payout);
      winners.push(`<@${p.userId}> (+${payout.toLocaleString()})`);
      totalPayout += payout;
    }
  }

  const finalEmbed = new EmbedBuilder()
    .setColor(0xF1C40F)
    .setTitle(`🎰 Roulette Result: ${result.e} ${result.n} ${result.c.toUpperCase()}`)
    .setDescription(`${finalStr}\n\n**Winners:**\n${winners.length ? winners.join('\n') : '*No one won.*'}`)
    .setTimestamp();

  await game.lobbyMsg.edit({ embeds: [finalEmbed] }).catch(() => {});
  deleteGame(game.gameId);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rouletteparty')
    .setDescription('Open a multiplayer roulette lobby!')
    .addIntegerOption(o =>
      o.setName('bet')
        .setDescription('Amount of coins everyone must bet to join')
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction, client) {
    const bet = interaction.options.getInteger('bet');

    if (getGameByUser(interaction.user.id))
      return interaction.reply({ content: '❌ You already have an active game.', flags: 64 });

    const id   = newGameId();
    const game = createGame({ gameId: id, type: 'rouletteparty', hostId: interaction.user.id, bet, maxPlayers: 30, channelId: interaction.channelId });

    await interaction.reply({ embeds: [lobbyEmbed(game)], components: lobbyButtons(id) });
    const msg = await interaction.fetchReply();
    updateGame(id, { lobbyMsg: msg });
  },

  startGame,
  lobbyEmbed,
  lobbyButtons,
};
