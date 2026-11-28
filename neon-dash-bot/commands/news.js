
const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const REPO = "aarushshettyv-rest/neon_dash";
const GAME_URL = 'https://neondash-beta.vercel.app/';
const GITHUB_URL = `https://github.com/${REPO}`;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('news')
        .setDescription('See the latest Neon Dash development updates'),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const response = await fetch(
                `https://api.github.com/repos/${REPO}/commits?per_page=5`,
                {
                    headers: {
                        'Accept': 'application/vnd.github+json',
                        'User-Agent': 'Neon-Dash-Discord-Bot'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status}`);
            }

            const commits = await response.json();

            const description = commits.map((commit, index) => {
                const message = commit.commit.message
                    .split('\n')[0]
                    .slice(0, 150);

                const date = Math.floor(
                    new Date(commit.commit.author.date).getTime() / 1000
                );

                return `**${index + 1}. ${message}**\n` +
                    `<t:${date}:R> • [View commit](${commit.html_url})`;
            }).join('\n\n');

            const embed = new EmbedBuilder()
                .setColor(0x00E5FF)
                .setTitle('⚡ NEON DASH — LATEST NEWS')
                .setDescription(description || 'No updates found.')
                .setThumbnail('https://neondash-beta.vercel.app/favicon.ico')
                .setFooter({ text: 'Neon Dash • Powered by GitHub' })
                .setTimestamp();

            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('PLAY NEON DASH')
                    .setStyle(ButtonStyle.Link)
                    .setURL(GAME_URL),

                new ButtonBuilder()
                    .setLabel('GITHUB')
                    .setStyle(ButtonStyle.Link)
                    .setURL(GITHUB_URL)
            );

            await interaction.editReply({
                embeds: [embed],
                components: [buttons]
            });

        } catch (error) {
            console.error('News command error:', error);

            await interaction.editReply({
                content: '⚠️ Could not fetch Neon Dash news from GitHub. Try again later.'
            });
        }
    }
};
