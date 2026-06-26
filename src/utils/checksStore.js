/**
 * checksStore.js — persists active activity checks to Supabase
 * All functions are async so data survives bot restarts.
 */

const supabase = require('./supabase');

const TABLE = 'activity_checks';

async function addCheck({ guildId, channelId, messageId, logChannelId, endsAt, intervalHours }) {
  await supabase.from(TABLE).upsert({
    message_id:    messageId,
    guild_id:      guildId,
    channel_id:    channelId,
    log_channel_id: logChannelId,
    ends_at:       endsAt,
    interval_hours: intervalHours ?? null,
  });
}

async function removeCheck(messageId) {
  await supabase.from(TABLE).delete().eq('message_id', messageId);
}

async function getAllChecks() {
  const { data, error } = await supabase.from(TABLE).select('*');
  if (error || !data) return [];
  return data.map(r => ({
    guildId:      r.guild_id,
    channelId:    r.channel_id,
    messageId:    r.message_id,
    logChannelId: r.log_channel_id,
    endsAt:       Number(r.ends_at),
    intervalHours: r.interval_hours ?? null,
  }));
}

module.exports = { addCheck, removeCheck, getAllChecks };
