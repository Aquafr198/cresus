require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const foldersPath = path.join(__dirname, 'src', 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if ('data' in command && 'execute' in command) {
      commands.push(command.data.toJSON());
      console.log(`Loaded command: ${command.data.name}`);
    } else {
      console.log(`Skipping command with invalid structure: ${file}`);
    }
  }
}

const rest = new REST().setToken(process.env.TOKEN);

(async () => {
  try {
    console.log(`\nRegistering ${commands.length} commands...`);

    // Guild-scoped registration is instant but visible only inside the test
    // guild. Global registration takes up to 1h to propagate but works on
    // every guild the bot joins. Fall back to global when GUILD_ID is unset
    // so production deploys don't silently end up with zero registered
    // commands.
    let data;
    if (process.env.GUILD_ID) {
      data = await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands },
      );
      console.log(`\n${data.length} commands registered to guild ${process.env.GUILD_ID}.`);
    } else {
      data = await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
        body: commands,
      });
      console.log(
        `\n${data.length} commands registered globally (may take up to 1h to propagate).`,
      );
    }
  } catch (error) {
    console.error('\nFailed to register commands:');
    console.error(error);
  }
})();
