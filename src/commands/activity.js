const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { addCheck } = require('../utils/checksStore');

const CHECK_EMOJI   = '✅';
const DEFAULT_HOURS = 24;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('activity')
    .setDescription('Activity check management')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('check')
        .setDescription('Start an activity check (default 24h, repeats if interval is set)')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Channel where the activity check message will be posted')
            .setRequired(true)
        )
        .addChannelOption(opt =>
          opt
            .setName('log_channel')
            .setDescription('Channel where results will be posted')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt
            .setName('interval')
            .setDescription('Post results every X hours and restart automatically (overrides the default 24h)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(168) // max 1 week
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub !== 'check') return;

    await interaction.deferReply({ flags: 64 });

    const channel       = interaction.options.getChannel('channel');
    const logChannel    = interaction.options.getChannel('log_channel');
    const intervalHours = interaction.options.getInteger('interval') ?? null;
    const durationHours = intervalHours ?? DEFAULT_HOURS;
    const endsAt        = Date.now() + durationHours * 60 * 60 * 1000;

    if (!channel.isTextBased()) {
      return interaction.editReply({ content: '❌ The activity check channel must be a text channel.' });
    }
    if (!logChannel.isTextBased()) {
      return interaction.editReply({ content: '❌ The log channel must be a text channel.' });
    }

    const timeLabel = durationHours === 1 ? '1 hour' : `${durationHours} hours`;
    const repeatNote = intervalHours
      ? `Results will be posted every **${timeLabel}** and a new check will start automatically.`
      : `You have **${timeLabel}** to react.\nMembers who do not react may receive a strike.`;

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('🏃 Activity Check')
      .setDescription(
        `React with ${CHECK_EMOJI} below to confirm you are **active** in this server!\n\n` +
        repeatNote
      )
      .setFooter({ text: `DonutSMP Empire Assistant • Ends in ${timeLabel}` })
      .setTimestamp(endsAt);

    let msg;
    try {
      msg = await channel.send({ embeds: [embed] });
      await msg.react(CHECK_EMOJI);
    } catch (err) {
      return interaction.editReply({ content: `❌ Failed to send activity check: ${err.message}` });
    }

    await addCheck({
      guildId:       interaction.guildId,
      channelId:     channel.id,
      messageId:     msg.id,
      logChannelId:  logChannel.id,
      endsAt,
      intervalHours, // null = one-shot, number = repeating
    });

    const replyNote = intervalHours
      ? `🔁 Repeating every **${timeLabel}** — use \`/endreactivity\` to stop.`
      : `Results will be posted in <#${logChannel.id}> in **${timeLabel}**.`;

    return interaction.editReply({
      content: `✅ Activity check started in <#${channel.id}>!\n${replyNote}`,
    });
  },
};
