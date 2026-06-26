const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const PAGES = [
  // Page 1 — Overview
  new EmbedBuilder()
    .setColor(0xF1C40F)
    .setTitle('📖 DonutSMP Empire Bot — Help')
    .setDescription('Welcome to the DonutSMP Empire casino & leveling bot!\nUse the buttons below to browse all commands.')
    .addFields(
      { name: '💰 Economy', value: '`/balance` `/gift` `/leaderboard`', inline: true },
      { name: '⭐ Levels', value: '`/rank` `/removepoints`', inline: true },
      { name: '🎰 Casino', value: '`/coinflip` `/blackjack` `/roulette` `/rouletteparty`', inline: true },
      { name: '🃏 Poker', value: '`/texasholdem` `/fivecarddraw`', inline: true },
      { name: '🎉 Events', value: '`/activity` `/endreactivity`', inline: true },
    )
    .setFooter({ text: 'Page 1/6 — Economy & Overview' }),

  // Page 2 — Economy commands
  new EmbedBuilder()
    .setColor(0x2ECC71)
    .setTitle('💰 Economy Commands')
    .addFields(
      { name: '/balance [@user]', value: 'Check your own coin balance, or mention another player to check theirs.' },

      { name: '/gift <@user> <amount>', value: 'Send coins from your wallet directly to another player.' },
      { name: '/leaderboard', value: 'Shows the top 10 richest players on the server.' },
      { name: '/rank [@user]', value: 'Check your current XP level and progress to the next level.' },
    )
    .setFooter({ text: 'Page 2/6 — Economy Commands' }),

  // Page 3 — Coinflip & Roulette
  new EmbedBuilder()
    .setColor(0xE67E22)
    .setTitle('🪙 Coinflip & Roulette')
    .addFields(
      {
        name: '/coinflip <bet>',
        value: 'Start a 1v1 coin flip lobby.\n**How it works:**\n1. You start the lobby with a bet amount.\n2. One other player joins.\n3. The game starts — one player picks **Heads**, the other gets **Tails**.\n4. The bot flips the coin. Winner takes the whole pot!\n**Payout:** 2x your bet'
      },
      {
        name: '/roulette <bet> <color>',
        value: 'Spin the roulette wheel solo.\n**How it works:**\n1. Pick a color and a bet amount.\n2. The wheel spins and lands on a number.\n3. If the number matches your color, you win!\n**Payouts:**\n🔴 Red / ⚫ Black — **2x**\n🟢 Green (number 0) — **14x**'
      },
      {
        name: '/rouletteparty <bet>',
        value: 'Multiplayer roulette lobby.\n**How it works:**\n1. Host sets the bet. Players join and pick a color (🔴/⚫/🟢).\n2. Host clicks Start — the wheel spins.\n3. Everyone who bet on the winning color gets paid!\n**Payouts:** Same as /roulette'
      },
    )
    .setFooter({ text: 'Page 3/6 — Coinflip & Roulette' }),

  // Page 4 — Blackjack
  new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle('🃏 Blackjack')
    .addFields(
      {
        name: '/blackjack <bet>',
        value: 'Start a multiplayer Blackjack lobby (up to 6 players).\n\n**How it works:**\n1. Host opens the lobby. Other players click **Join**.\n2. Host clicks **Start** — everyone gets 2 cards.\n3. Click **👁️ Show Hand** to see your cards privately (only you can see them!).\n4. Click **Hit** to draw another card, or **Stand** to hold.\n5. Try to get as close to **21** as possible without going over (busting).\n6. The dealer draws last. Beat the dealer to win!\n\n**Payouts:**\n✅ Win — **2x** your bet\n♠️ Blackjack (Ace + 10) — **2.5x** your bet\n🤝 Tie — your bet returned'
      },
    )
    .setFooter({ text: 'Page 4/6 — Blackjack' }),

  // Page 5 — Texas Hold'em
  new EmbedBuilder()
    .setColor(0x2D7D46)
    .setTitle('♠️ Texas Hold\'em')
    .addFields(
      {
        name: '/texasholdem <buyin>',
        value: 'Start a No-Limit Texas Hold\'em poker lobby (up to 8 players).\n\n**How it works:**\n1. Host opens the lobby. Players click **Join** and pay the buy-in.\n2. Host clicks **Start** — each player gets **2 secret hole cards**.\n3. Click **👀 Peek at Cards** at any time to privately see your hand.\n4. **Betting rounds:**\n> 🔹 **Pre-Flop** — Bet before any community cards are shown.\n> 🔹 **Flop** — 3 community cards are revealed.\n> 🔹 **Turn** — 1 more community card revealed.\n> 🔹 **River** — Final community card revealed.\n5. On your turn: **Check/Call**, **Raise**, or **Fold**.\n6. **Showdown** — Remaining players reveal hands. Best 5-card hand from your 2 hole cards + 5 community cards wins the pot!\n\n**Hand Rankings (best to worst):**\nRoyal Flush → Straight Flush → Four of a Kind → Full House → Flush → Straight → Three of a Kind → Two Pair → Pair → High Card'
      },
    )
    .setFooter({ text: 'Page 5/6 — Texas Hold\'em' }),

  // Page 6 — Five Card Draw
  new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🃏 Five Card Draw')
    .addFields(
      {
        name: '/fivecarddraw <buyin>',
        value: 'Start a No-Limit Five Card Draw poker lobby (up to 8 players).\n\n**How it works:**\n1. Host opens the lobby. Players click **Join** and pay the buy-in.\n2. Host clicks **Start** — each player gets **5 secret cards**.\n3. Click **👀 Peek at Cards** to privately see your hand.\n4. **Betting Round 1** — Bet based on your starting hand.\n5. **Draw Phase** — Click **🔄 Swap Cards** and select up to 3 cards to discard and redraw from the deck. Or click **✅ Keep All** to keep your hand.\n6. **Betting Round 2** — Final betting round after the draw.\n7. **Showdown** — Best 5-card hand wins the pot!\n\n**Hand Rankings (best to worst):**\nRoyal Flush → Straight Flush → Four of a Kind → Full House → Flush → Straight → Three of a Kind → Two Pair → Pair → High Card'
      },
    )
    .setFooter({ text: 'Page 6/6 — Five Card Draw' }),
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Learn how every command and game works!'),

  async execute(interaction) {
    let page = 0;

    function getRow(p) {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('help_prev').setLabel('◀ Back').setStyle(ButtonStyle.Secondary).setDisabled(p === 0),
        new ButtonBuilder().setCustomId('help_next').setLabel('Next ▶').setStyle(ButtonStyle.Primary).setDisabled(p === PAGES.length - 1),
      );
    }

    const msg = await interaction.reply({
      embeds: [PAGES[page]],
      components: [getRow(page)],
      fetchReply: true
    });

    const collector = msg.createMessageComponentCollector({ time: 120_000 });

    collector.on('collect', async btn => {
      if (btn.user.id !== interaction.user.id)
        return btn.reply({ content: '❌ Only the person who ran /help can flip pages.', flags: 64 });

      if (btn.customId === 'help_prev') page = Math.max(0, page - 1);
      if (btn.customId === 'help_next') page = Math.min(PAGES.length - 1, page + 1);

      await btn.update({ embeds: [PAGES[page]], components: [getRow(page)] });
    });

    collector.on('end', () => {
      msg.edit({ components: [] }).catch(() => {});
    });
  },
};
