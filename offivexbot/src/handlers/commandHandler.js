const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

module.exports = (client) => {
  const commands = [];
  const commandFolders = fs.readdirSync(path.join(__dirname, '..', 'commands'));

  for (const folder of commandFolders) {
    const commandFiles = fs
      .readdirSync(path.join(__dirname, '..', 'commands', folder))
      .filter((file) => file.endsWith('.js'));

    for (const file of commandFiles) {
      const command = require(`../commands/${folder}/${file}`);
      client.commands.set(command.data.name, command);
      commands.push(command.data.toJSON());
      console.log(chalk.green(`Loaded command: ${command.data.name}`));
    }
  }

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  (async () => {
    try {
      console.log(chalk.yellow('Registering slash commands...'));

      // Guild-scoped registration is instant but only visible inside the test
      // guild. Global registration takes up to 1 hour to propagate but works
      // everywhere the bot is invited. Fall back to global automatically when
      // GUILD_ID is unset — the .env.example explicitly marks it as optional.
      if (process.env.GUILD_ID) {
        await rest.put(
          Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
          { body: commands },
        );
        console.log(
          chalk.green(`Slash commands registered to guild ${process.env.GUILD_ID}.`),
        );
      } else {
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
          body: commands,
        });
        console.log(
          chalk.green('Slash commands registered globally (may take up to 1h to propagate).'),
        );
      }
    } catch (error) {
      console.error(chalk.red('Failed to register slash commands:'), error);
    }
  })();
};
