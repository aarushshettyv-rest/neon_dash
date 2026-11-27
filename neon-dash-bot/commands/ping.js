const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check the bot response latency'),

    async execute(interaction) {
        const sent = await interaction.reply({
            content: '🏓 Pinging...',
            withResponse: true
        });

        const latency = sent.resource.message.createdTimestamp -
            interaction.createdTimestamp;

        await interaction.editReply(
            `🏓 Pong! Response time: **${latency}ms**`
        );
    }
};