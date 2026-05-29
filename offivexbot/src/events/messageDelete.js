const { sendLog } = require('../utils/logger');

module.exports = {
  name: 'messageDelete',
  once: false,
  async execute(message, client) {
    // Ignore bots and DMs.
    if (message.author?.bot || !message.guild) return;

    const data = {
      author: message.author,
      channelId: message.channel.id,
      content: message.content,
      attachments: message.attachments.size > 0,
    };

    try {
      await sendLog(client, 'messageDelete', data);
    } catch (error) {
      console.error('[messageDelete] failed to send log:', error?.message ?? error);
    }
  },
};
