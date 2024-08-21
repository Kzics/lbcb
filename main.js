const { Client, GatewayIntentBits, Collection, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { sendToDiscord } = require('./itemTracker');
const fs = require('fs');
require('dotenv').config();
const token = process.env.DISCORD_TOKEN;

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
client.commands = new Collection();
client.usersMap = new Map();

const trackedChannels = new Map();
const activeSearches = new Map();
const favorites = [];

// Fonction pour sauvegarder les salons suivis
function saveTrackedChannels() {
    const data = Array.from(trackedChannels.entries());
    fs.writeFileSync('trackedChannels.json', JSON.stringify(data, null, 2));
}

// Fonction pour charger les salons suivis
function loadTrackedChannels() {
    if (fs.existsSync('trackedChannels.json')) {
        const data = JSON.parse(fs.readFileSync('trackedChannels.json', 'utf-8'));
        data.forEach(([channelId, info]) => {
            trackedChannels.set(channelId, info);
            activeSearches.set(channelId, true);
        });
    }
}

client.once('ready', () => {
    console.log('Bot is ready!');
    loadTrackedChannels();
    trackedChannels.forEach(async (info, channelId) => {
        const channel = client.channels.cache.get(channelId);
        if (channel) {
            await sendToDiscord(channel, info, activeSearches);
        } else {
            console.log(`Channel ${channelId} not found, removing from tracked channels.`);
            // Supprimer les traques pour les salons supprimés
            trackedChannels.delete(channelId);
            activeSearches.delete(channelId);
            saveTrackedChannels(); // Save the updated list
        }
    });
});

const commands = [
    new SlashCommandBuilder()
        .setName('search')
        .setDescription('Rechercher des annonces')
        .addStringOption(option => option.setName('brand').setDescription('La marque du véhicule').setRequired(true))
        .addStringOption(option => option.setName('sort').setDescription('Critère de tri (ex: time)').setRequired(true))
        .addStringOption(option => option.setName('departements').setDescription('Choisir les Departements').setRequired(false))
        .addStringOption(option => option.setName('modele').setDescription('Choisir un modèle').setRequired(false))
        .addStringOption(option => option.setName('prix').setDescription('Choisir une tranche de prix(Ex: 100-1000)').setRequired(false))
        .addStringOption(option => option.setName('kilometrage').setDescription('Choisir une tranche de kilometrage(Ex: 100-1000)').setRequired(false)),
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

        // Enregistrement des commandes
        await rest.put(Routes.applicationCommands("1167948868135170208"), { body: commands });

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error reloading application (/) commands:', error);
    }
})();

// Connexion du bot à Discord
client.login(token);
console.log("LOGGED");

// Fonction pour générer un ID unique pour les favoris
function generateFavoriteId() {
    return `fav-${Math.random().toString(36).substr(2, 9)}`;
}

// Gestion des interactions par boutons
async function handleButton(interaction) {
    const userId = interaction.user.id;
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
            favorites.push({ id: favoriteId, listId, channelId: interaction.channel.id, userId });
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
            let brand = options.getString('brand');
            const sort = options.getString('sort');
            let dep = options.getString('departements');
            let models = options.getString("modele");
            let price = options.getString("prix");
            let mileage = options.getString("kilometrage");

            brand = brand.toUpperCase();

            const category = interaction.channel.parent;
            if (!category) {
                return interaction.editReply({ content: 'Impossible de déterminer la catégorie de ce salon.', ephemeral: true });
            }

            dep = dep ? JSON.parse(dep) : null;
            const channelName = `${brand}-${models == null ? "" : models}-${sort}-${dep ? dep.join('-') : "all"}`;
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

            const info = {
                brand,
                sort,
                dep,
                models,
                price,
                mileage
            };

            trackedChannels.set(channel.id, info);
            activeSearches.set(channel.id, true);
            saveTrackedChannels();

            await sendToDiscord(channel, info, activeSearches);
        } else if (commandName === 'unsearch') {
            const channelId = options.getString('channel_id');
            console.log("Tracking channels:", trackedChannels);
            console.log("Active searches:", activeSearches);

            if (trackedChannels.has(channelId)) {
                trackedChannels.delete(channelId);
                activeSearches.delete(channelId);

                const channel = client.channels.cache.get(channelId);
                if (channel) {
                    await channel.delete(); // Assurez-vous que la suppression est effectuée correctement
                }

                saveTrackedChannels();  // Sauvegardez les modifications
                interaction.editReply({ content: `Le suivi a été arrêté pour le salon : ${channelId}`, ephemeral: true });
            } else {
                interaction.editReply({ content: `Aucun suivi trouvé pour le salon : ${channelId}`, ephemeral: true });
            }
        } else if (commandName === 'listsearches') {
            const searchList = Array.from(activeSearches.keys());
            const embed = new EmbedBuilder()
                .setTitle('Recherches en cours')
                .setDescription('Voici la liste des salons suivis:')
                .setColor(0x00AE86);

            searchList.forEach(channelId => {
                const channel = client.channels.cache.get(channelId);
                if (channel) {
                    embed.addFields({ name: channel.name, value: `[Cliquez ici pour accéder au salon](https://discord.com/channels/${interaction.guildId}/${channelId})   ${channelId}`, inline: false });
                }
            });

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

                pageFavorites.forEach((fav, index) => {
                    const { id, listId, channelId, userId } = fav;
                    const user = client.users.cache.get(userId);
                    const channel = client.channels.cache.get(channelId);

                    embed.addFields({
                        name: `Favori ${id}`,
                        value: `[Lien de l'annonce](https://www.leboncoin.fr/ad/voitures/${listId})\nAjouté par : ${user ? `<@${userId}>` : 'Utilisateur inconnu'}\nSalon : <#${channelId}>`,
                        inline: false
                    });
                });

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

            collector.on('end', collected => {
                interaction.editReply({ components: [] });
            });
        } else if (commandName === 'unfav') {
            const favId = options.getString('id');
            const index = favorites.findIndex(fav => fav.id === favId);
            if (index !== -1) {
                favorites.splice(index, 1);
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
