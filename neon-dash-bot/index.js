
require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    Events,
    Collection
} = require('discord.js');

const fs = require('node:fs');
const path = require('node:path');

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath)
    .filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    client.commands.set(command.data.name, command);
}

// Handle slash commands
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);

        const response = {
            content: '❌ Something went wrong!',
            ephemeral: true
        };

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(response);
        } else {
            await interaction.reply(response);
        }
    }
});

client.once(Events.ClientReady, readyClient => {
    console.log('================================');
    console.log('⚡ NEON DASH SERVER BOT');
    console.log('================================');
    console.log(`Bot: ${readyClient.user.tag}`);
    console.log(`Servers: ${readyClient.guilds.cache.size}`);
    console.log('Status: ONLINE');
    console.log('================================');
});

client.login(process.env.DISCORD_TOKEN);
