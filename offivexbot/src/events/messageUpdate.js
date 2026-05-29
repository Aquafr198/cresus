// FIX: previously imported `{ logger }` from ../utils/logger which doesn't
// exist — logger.js only exports `{ sendLog }`. This used to crash with
// "Cannot read property 'sendLog' of undefined" on every message edit.
const { sendLog } = require('../utils/logger');

module.exports = {
  name: 'messageUpdate',
  once: false,
  async execute(oldMessage, newMessage, client) {
    // Ignore bots and DMs.
    if (oldMessage.author?.bot || !oldMessage.guild) return;
    // Ignore no-op edits (Discord fires this for embed expansions, pin changes etc.).
    if (oldMessage.content === newMessage.content) return;

    const data = {
      author: oldMessage.author,
      channelId: oldMessage.channel.id,
      oldContent: oldMessage.content,
      newContent: newMessage.content,
    };

    try {
      await sendLog(client, 'messageUpdate', data);
    } catch (err) {
      console.error('[messageUpdate] failed to send log:', err?.message ?? err);
    }
  },
};
