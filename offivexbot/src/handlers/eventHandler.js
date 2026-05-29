const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

module.exports = (client) => {
  const eventDir = path.join(__dirname, '..', 'events');
  const eventFiles = fs.readdirSync(eventDir).filter((file) => file.endsWith('.js'));

  for (const file of eventFiles) {
    const event = require(`${eventDir}/${file}`);
    // Prefer an explicit `name` on the export; fall back to the filename so
    // legacy modules without `name:` still wire up correctly.
    const eventName = event.name || file.split('.')[0];

    if (event.once) {
      client.once(eventName, (...args) => event.execute(...args, client));
    } else {
      client.on(eventName, (...args) => event.execute(...args, client));
    }

    console.log(chalk.blue(`Loaded event: ${eventName}`));
  }
};
