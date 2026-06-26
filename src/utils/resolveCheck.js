/**
 * resolveCheck.js — resolves an activity check and posts results to the log channel
 */

const { EmbedBuilder } = require('discord.js');
const { removeCheck, addCheck } = require('./checksStore');

const CHECK_EMOJI = '✅';

function chunkMentions(arr, max = 1000) {
  const chunks = [];
  let current = '';
  for (const m of arr) {
    if ((current + ' ' + m).length > max) {
      chunks.push(current.trim());
      current = m;
    } else {
      current += ' ' + m;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function resolveCheck(client, check) {
  const { guildId, channelId, messageId, logChannelId } = check;

  try {
    const guild = await client.guilds.fetch(guildId);
    if (!guild) return;

    await guild.members.fetch();

    const channel = guild.channels.cache.get(channelId);
    if (!channel) return;

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) return;

    // Get users who reacted with ✅
    const reaction = message.reactions.cache.get(CHECK_EMOJI);
    let reactedUsers = new Set();
    if (reaction) {
      const users = await reaction.users.fetch();
      users.forEach(u => { if (!u.bot) reactedUsers.add(u.id); });
    }

    // Only count non-bot members who can actually see the activity check channel
    const allMembers = guild.members.cache.filter(m =>
      !m.user.bot && channel.permissionsFor(m)?.has('ViewChannel')
    );
    const reacted    = [];
    const notReacted = [];

    allMembers.forEach(member => {
      if (reactedUsers.has(member.id)) {
        reacted.push(`<@${member.id}>`);
      } else {
        notReacted.push(`<@${member.id}>`);
      }
    });

    const logChannel = guild.channels.cache.get(logChannelId);
    if (!logChannel?.isTextBased()) return;

    const totalMembers    = allMembers.size;
    const reactedCount    = reacted.length;
    const notReactedCount = notReacted.length;

    const embed = new EmbedBuilder()
      .setColor(notReactedCount > 0 ? 0xED4245 : 0x57F287)
      .setTitle('📋 Activity Check Results')
      .setDescription(
        `**${reactedCount}/${totalMembers}** members confirmed active.\n` +
        `Activity check from <#${channelId}>.`
      )
      .setTimestamp();

    const chunks_reacted    = chunkMentions(reacted);
    const chunks_notReacted = chunkMentions(notReacted);

    if (reacted.length > 0) {
      chunks_reacted.forEach((chunk, i) => {
        const total = chunks_reacted.length;
        const label = total > 1 ? `✅ Active (${reactedCount}) — ${i + 1}/${total}` : `✅ Active (${reactedCount})`;
        embed.addFields({ name: label, value: chunk });
      });
    } else {
      embed.addFields({ name: '✅ Active (0)', value: '*Nobody reacted.*' });
    }

    if (notReacted.length > 0) {
      chunks_notReacted.forEach((chunk, i) => {
        const total = chunks_notReacted.length;
        const label = total > 1 ? `❌ Did NOT react (${notReactedCount}) — ${i + 1}/${total}` : `❌ Did NOT react (${notReactedCount})`;
        embed.addFields({ name: label, value: chunk });
      });
    } else {
      embed.addFields({ name: '❌ Did NOT react (0)', value: '*Everyone reacted! 🎉*' });
    }

    await logChannel.send({ embeds: [embed] });

    // Close the original message
    try {
      const closedEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🏃 Activity Check — Closed')
        .setDescription('This activity check has ended. Results have been posted in the log channel.')
        .setTimestamp();
      await message.edit({ embeds: [closedEmbed] });
    } catch { /* ignore */ }

    // Auto-restart if this was a repeating check
    if (check.intervalHours) {
      const durationMs = check.intervalHours * 60 * 60 * 1000;
      const endsAt     = Date.now() + durationMs;
      const timeLabel  = check.intervalHours === 1 ? '1 hour' : `${check.intervalHours} hours`;

      const newEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('🏃 Activity Check')
        .setDescription(
          `React with ✅ below to confirm you are **active** in this server!\n\n` +
          `Results will be posted every **${timeLabel}** and a new check will start automatically.`
        )
        .setFooter({ text: `DonutSMP Empire Assistant • Ends in ${timeLabel}` })
        .setTimestamp(endsAt);

      try {
        const newMsg = await channel.send({ embeds: [newEmbed] });
        await newMsg.react('✅');
        await addCheck({
          guildId:      check.guildId,
          channelId:    check.channelId,
          messageId:    newMsg.id,
          logChannelId: check.logChannelId,
          endsAt,
          intervalHours: check.intervalHours,
        });
      } catch (err) {
        console.error('[ActivityCheck] Failed to restart recurring check:', err.message);
      }
    }

  } catch (err) {
    console.error(`[ActivityCheck] Error resolving check ${messageId}:`, err.message);
  } finally {
    await removeCheck(messageId);
  }
}

module.exports = { resolveCheck };
