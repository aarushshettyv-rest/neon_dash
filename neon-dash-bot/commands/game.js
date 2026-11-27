
const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('game')
        .setDescription('Play Neon Dash!'),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(0x00E5FF)
            .setTitle('⚡ NEON DASH')
            .setDescription(
                '**Ready to test your reflexes?**\n\n' +
                'Neon Dash is a fast-paced, single-player rhythm platformer. ' +
                'Jump, dodge obstacles, and see how far you can go!\n\n' +
                '🎮 **Game:** Neon Dash\n' +
                '🌐 **Platform:** Web Browser\n' +
                '⚡ **Style:** Rhythm Platformer\n\n' +
                'Click below to start playing!'
            )
            .setFooter({
                text: 'Neon Dash • Official Community'
            })
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('PLAY NEON DASH')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://neondash-beta.vercel.app')
                    .setEmoji('🎮')
            );

        await interaction.reply({
            embeds: [embed],
            components: [row]
        });
    }
};
