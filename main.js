const { Client, GatewayIntentBits, Collection, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { sendToDiscord } = require('./itemTracker');
const fs = require('fs');
require('dotenv').config();
const token = process.env.DISCORD_TOKEN;

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
client.commands = new Collection();
client.usersMap = new Map();

const trackedChannels = new Map();
const activeSearches = new Set();
let favorites = [];

function saveTrackedChannels() {
    const data = JSON.stringify(Array.from(trackedChannels.entries()), null, 2);
    fs.writeFileSync('trackedChannels.json', data);
}

function loadTrackedChannels() {
    if (fs.existsSync('trackedChannels.json')) {
        const data = JSON.parse(fs.readFileSync('trackedChannels.json', 'utf-8'));
        data.forEach(([channelId, info]) => {
            trackedChannels.set(channelId, info);
            activeSearches.add(channelId);
        });
    }
}

client.once('ready', async () => {
    console.log('Bot is ready!');
    loadTrackedChannels();

    for (const [channelId, info] of trackedChannels.entries()) {
        const channel = client.channels.cache.get(channelId);
        if (channel) {
            await sendToDiscord(channel, info, activeSearches);
        } else {
            console.log(`Channel ${channelId} not found, removing from tracked channels.`);
            trackedChannels.delete(channelId);
            activeSearches.delete(channelId);
            saveTrackedChannels();
        }
    }
});

const commands = [
    new SlashCommandBuilder()
        .setName('search')
        .setDescription('Rechercher des annonces')
        .addStringOption(option => option.setName('brand').setDescription('La marque du véhicule').setRequired(true))
        .addStringOption(option => option.setName('sort').setDescription('Critère de tri (ex: time)').setRequired(true))
        .addStringOption(option => option.setName('departements').setDescription('Choisir les départements').setRequired(false))
        .addStringOption(option => option.setName('modele').setDescription('Choisir un modèle').setRequired(false))
        .addStringOption(option => option.setName('prix').setDescription('Choisir une tranche de prix (Ex: 100-1000)').setRequired(false))
        .addStringOption(option => option.setName('kilometrage').setDescription('Choisir une tranche de kilométrage (Ex: 100-1000)').setRequired(false)),
    new SlashCommandBuilder()
        .setName('unsearch')
        .setDescription('Arrêter de suivre un salon')
        .addStringOption(option => option.setName('channel_id').setDescription('L\'ID du salon').setRequired(true)),
    new SlashCommandBuilder()
        .setName('listsearches')
        .setDescription('Lister toutes les recherches en cours'),
    new SlashCommandBuilder()
        .setName('favoris')
        .setDescription('Lister toutes les annonces mises en favoris'),
    new SlashCommandBuilder()
        .setName('unfav')
        .setDescription('Retirer une annonce des favoris')
        .addStringOption(option => option.setName('id').setDescription('L\'ID du favori').setRequired(true))
].map(command => command.toJSON());

// Initialisation de REST pour enregistrer les commandes avec Discord
const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(Routes.applicationCommands("1167948868135170208"), { body: commands });
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error reloading application (/) commands:', error);
    }
})();

client.login(token);
console.log("LOGGED");

// Fonction pour générer un ID unique pour les favoris
function generateFavoriteId() {
    return `fav-${Math.random().toString(36).substr(2, 9)}`;
}

// Gestion des interactions par boutons
async function handleButton(interaction) {
    const customId = interaction.customId;
    const listId = customId.split("_")[1];
    const embed = new EmbedBuilder();

    if (customId.startsWith("previous")) {
        console.log("err");
    } else if (customId.startsWith("next")) {
        console.log("arr");
    } else {
        const favoriteId = generateFavoriteId();
        if (!favorites.some(fav => fav.listId === listId)) {
            favorites.push({ id: favoriteId, listId, channelId: interaction.channel.id, userId: interaction.user.id });
            embed.setTitle("✅ Annonce ajoutée aux favoris");
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } else {
            embed.setTitle("❌ Annonce déjà dans les favoris");
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
}

// Gestion des interactions de commandes slash
client.on('interactionCreate', async interaction => {
    try {
        if (!interaction.isCommand()) {
            if (interaction.isButton()) await handleButton(interaction);
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        const { commandName, options } = interaction;

        if (commandName === 'search') {
            const brand = options.getString('brand').toUpperCase();
            const sort = options.getString('sort');
            const dep = options.getString('departements') ? JSON.parse(options.getString('departements')) : null;
            const models = options.getString('modele');
            const price = options.getString('prix');
            const mileage = options.getString('kilometrage');
            const category = interaction.channel.parent;

            if (!category) {
                return interaction.editReply({ content: 'Impossible de déterminer la catégorie de ce salon.', ephemeral: true });
            }

            const channelName = `${brand}-${models || ""}-${sort}-${dep ? dep.join('-') : "all"}`;
            const channel = await category.guild.channels.create({
                name: channelName,
                type: 0,
                parent: category.id
            });

            let topic = `Traque de ${brand}`;
            if (models) topic += `, Modèle: ${models}`;
            if (sort) topic += `, Tri: ${sort}`;
            if (dep) topic += `, Départements: ${dep.join(', ')}`;
            if (price) topic += `, Prix: ${price}`;
            if (mileage) topic += `, Kilométrage: ${mileage}`;
            await channel.setTopic(topic);

            interaction.editReply({ content: `Salon créé : ${channel}`, ephemeral: true });

            const info = { brand, sort, dep, models, price, mileage };
            trackedChannels.set(channel.id, info);
            activeSearches.add(channel.id);
            saveTrackedChannels();

            await sendToDiscord(channel, info, activeSearches);
        } else if (commandName === 'unsearch') {
            const channelId = options.getString('channel_id');

            if (trackedChannels.has(channelId)) {
                trackedChannels.delete(channelId);
                activeSearches.delete(channelId);

                const channel = client.channels.cache.get(channelId);
                if (channel) {
                    await channel.delete();
                }

                saveTrackedChannels();
                interaction.editReply({ content: `Le suivi a été arrêté pour le salon : ${channelId}`, ephemeral: true });
            } else {
                interaction.editReply({ content: `Aucun suivi trouvé pour le salon : ${channelId}`, ephemeral: true });
            }
        } else if (commandName === 'listsearches') {
            const embed = new EmbedBuilder()
                .setTitle('Recherches en cours')
                .setDescription('Voici la liste des salons suivis:')
                .setColor(0x00AE86);

            for (const channelId of activeSearches) {
                const channel = client.channels.cache.get(channelId);
                if (channel) {
                    embed.addFields({
                        name: channel.name,
                        value: `[Cliquez ici pour accéder au salon](https://discord.com/channels/${interaction.guildId}/${channelId})   ${channelId}`,
                        inline: false
                    });
                }
            }

            interaction.editReply({ embeds: [embed], ephemeral: true });
        } else if (commandName === 'favoris') {
            const ITEMS_PER_PAGE = 10;
            let currentPage = 0;

            function generateEmbed(page) {
                const embed = new EmbedBuilder()
                    .setTitle('📋 Liste des favoris')
                    .setColor(0x3498db)
                    .setDescription('Voici la liste de toutes les annonces mises en favoris :');

                const start = page * ITEMS_PER_PAGE;
                const end = start + ITEMS_PER_PAGE;
                const pageFavorites = favorites.slice(start, end);

                for (const fav of pageFavorites) {
                    const user = client.users.cache.get(fav.userId);
                    const channel = client.channels.cache.get(fav.channelId);
                    embed.addFields({
                        name: `Favori ${fav.id}`,
                        value: `[Lien de l'annonce](https://www.leboncoin.fr/ad/voitures/${fav.listId})\nAjouté par : ${user ? `<@${fav.userId}>` : 'Utilisateur inconnu'}\nSalon : <#${fav.channelId}>`,
                        inline: false
                    });
                }

                embed.setFooter({ text: `Page ${page + 1} sur ${Math.ceil(favorites.length / ITEMS_PER_PAGE)}` });
                return embed;
            }

            const embed = generateEmbed(currentPage);
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('previous')
                        .setLabel('⬅️ Précédent')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentPage === 0),
                    new ButtonBuilder()
                        .setCustomId('next')
                        .setLabel('➡️ Suivant')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(favorites.length <= ITEMS_PER_PAGE)
                );

            await interaction.editReply({ embeds: [embed], components: [row], ephemeral: true });

            const collector = interaction.channel.createMessageComponentCollector({ time: 60000 });

            collector.on('collect', async i => {
                if (i.customId === 'previous' && currentPage > 0) {
                    currentPage--;
                } else if (i.customId === 'next' && (currentPage + 1) * ITEMS_PER_PAGE < favorites.length) {
                    currentPage++;
                }

                const newEmbed = generateEmbed(currentPage);
                const newRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('previous')
                            .setLabel('⬅️ Précédent')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(currentPage === 0),
                        new ButtonBuilder()
                            .setCustomId('next')
                            .setLabel('➡️ Suivant')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled((currentPage + 1) * ITEMS_PER_PAGE >= favorites.length)
                    );

                await i.update({ embeds: [newEmbed], components: [newRow], ephemeral: true });
            });

            collector.on('end', () => {
                interaction.editReply({ components: [] });
            });
        } else if (commandName === 'unfav') {
            const favId = options.getString('id');
            const index = favorites.findIndex(fav => fav.id === favId);

            if (index !== -1) {
                favorites = favorites.filter(fav => fav.id !== favId);
                interaction.editReply({ content: `Favori avec l'ID ${favId} a été retiré.`, ephemeral: true });
            } else {
                interaction.editReply({ content: `Aucun favori trouvé avec l'ID ${favId}.`, ephemeral: true });
            }
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ content: 'Une erreur est survenue lors du traitement de votre demande.', ephemeral: true });
        } else {
            await interaction.reply({ content: 'Une erreur est survenue lors du traitement de votre demande.', ephemeral: true });
        }
    }
});
