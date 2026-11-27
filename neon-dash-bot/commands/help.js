
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show all Neon Dash Server Bot commands'),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(0x00E5FF)
            .setTitle('⚡ Neon Dash Server Bot')
            .setDescription(
                'Welcome to the Neon Dash community! Here are my commands.'
            )
            .addFields(
                {
                    name: '🎮 Game Commands',
                    value: '`/game` — Play Neon Dash\n`/about` — About the game'
                },
                {
                    name: '🛠️ Utility Commands',
                    value: '`/ping` — Check bot latency\n`/help` — Show this menu'
                },
                {
                    name: '📢 Community Commands',
                    value: '`/news` — Latest game updates\n`/suggest` — Submit a suggestion\n`/bug` — Report a bug'
                }
            )
            .setFooter({ text: 'Neon Dash • Community Bot' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
