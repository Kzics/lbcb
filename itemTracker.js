const axios = require('axios');
const cheerio = require("cheerio");
const { ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require("discord.js");

let latestData = new Map();

async function fetchNextData(options) {
    const url = "https://api.zyte.com/v1/extract";
    let depString = "";

    if (options.dep && options.dep.length > 0) {
        depString = options.dep.map(dep => `d_${dep}`).join(",");
    }

    // Construire l'URL de base
    let fetchUrl = `https://www.leboncoin.fr/recherche?category=2`;

    // Ajouter les paramètres optionnels
    if (depString) {
        fetchUrl += `&locations=${depString}`;
    }
    if (options.brand) {
        fetchUrl += `&u_car_brand=${options.brand}`;
    }
    if (options.models) {
        fetchUrl += `&u_car_model=${options.brand}_${options.models}`;
    }
    if (options.sort) {
        fetchUrl += `&sort=time`;
    }
    if(options.price) {
        fetchUrl += `&price=${options.price}`
    }
    if(options.mileage) {
        fetchUrl += `&mileage=${options.mileage}`
    }

    try {
        const response = await axios.post(url, {
            "url": fetchUrl,
            "httpResponseBody": true
        }, {
            auth: { username: '2838b6dcab314bc99c35650f8d146e56' }
        });

        const httpResponseBody = Buffer.from(response.data.httpResponseBody, "base64").toString();

        if (response.status !== 200) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        console.log(fetchUrl)

        const $ = cheerio.load(httpResponseBody);
        const scriptContent = $('#__NEXT_DATA__').html();

        if (!scriptContent) {
            throw new Error("La balise <script id='__NEXT_DATA__'> n'a pas été trouvée.");
        }

        // Convertir le contenu en JSON
        const jsonData = JSON.parse(scriptContent);
        return jsonData;
    } catch (error) {
        console.error('Erreur lors de la récupération des données :', error.message);
    }
}


async function checkDistance(origin, destination) {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?units=metric&origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=AIzaSyDVpX2-v2O1VhGO1TJSHx8K8f2p1iuGd8A`;

    const response = await axios.get(url);
    const data = response.data;

    const distanceValue = {
        distance: data.rows[0].elements[0].distance.text,
        time: data.rows[0].elements[0].duration.text
    };
    return distanceValue;
}

async function sendToDiscord(channel, options, activeSearches) {
    try {
        if (!activeSearches.has(channel.id)) {
            return;
        }

        const brutData = await fetchNextData(options);

        if (!brutData) return;
        const adsData = brutData.props.pageProps.searchData.ads;

        if (adsData == null) return;

        const latestAd = adsData[0];

        if (latestData.get(channel.id) != null && latestAd.list_id === latestData.get(channel.id)) {
            await reload(channel, options, activeSearches);
            return;
        }

        latestData.set(channel.id,latestAd.list_id)

        const {
            subject,
            body,
            list_id,
            index_date,
            price,
            location,
            images,
            attributes
        } = latestAd;

        const annonceButton = new ButtonBuilder()
            .setURL(`https://www.leboncoin.fr/ad/voitures/${list_id}`)
            .setLabel("🔎 Annonce")
            .setStyle(ButtonStyle.Link);

        const sendMessageButton = new ButtonBuilder()
            .setURL(`https://www.leboncoin.fr/reply/${list_id}`)
            .setLabel("📩 Envoyer un message")
            .setStyle(ButtonStyle.Link);

        const addFavoriteButton = new ButtonBuilder()
            .setCustomId(`favorite_${list_id}`)
            .setLabel("⭐ Ajouter favoris")
            .setStyle(ButtonStyle.Primary)

        const getAttributeValue = (key) => {
            const attribute = attributes.find(attr => attr.key === key);
            return attribute ? attribute.value_label : 'Non spécifié';
        };

        const comp = new ActionRowBuilder()
            .setComponents(sendMessageButton, annonceButton, addFavoriteButton);
        const embeds = [];
        const distanceValue = await checkDistance("Sevran", location.city);


        for (let i = 0; i < images.urls.length; i++) {
            if (i === 5) break;
            const embedBuilder = new EmbedBuilder()
                .setTitle(subject)
                .setURL(`https://www.leboncoin.fr/voitures/${list_id}`)
                .setTimestamp(new Date(index_date))
                .setColor(3066993)
                .setImage(images && images.urls && images.urls[i] ? images.urls[i] : 'https://via.placeholder.com/150');

            embedBuilder.addFields(
                { name: "️Prix", value: `${formatPrice(price)}€`, inline: true },
                { name: " Ville", value: `${location.city_label}`, inline: true },
                { name: "️ Modèle", value: `${getAttributeValue("u_car_model")}`, inline: true },
                { name: "️ Année modèle", value: `${getAttributeValue("regdate")}`, inline: true },
                { name: "️ Date de première mise en circulation", value: `${getAttributeValue("issuance_date")}`, inline: true },
                { name: "️ Kilométrage", value: `${getAttributeValue("mileage")}`, inline: true },
                { name: "️ Carburant", value: `${getAttributeValue("fuel")}`, inline: true },
                { name: "️ Date de fin de validité du contrôle technique", value: `${getAttributeValue("tech_control_date")}`, inline: true },
                { name: "️ Boîte de vitesse", value: `${getAttributeValue("gearbox")}`, inline: true },
                { name: "️ Sellerie", value: `${getAttributeValue("vehicle_upholstery")}`, inline: true },
                { name: "️ État du véhicule", value: `${getAttributeValue("vehicle_damage")}`, inline: true },
                { name: "️ Équipements", value: `${getAttributeValue("vehicle_interior_specs")}`, inline: true },
                { name: "️ Caractéristiques", value: `${getAttributeValue("vehicle_specifications")}`, inline: true },
                { name: "️ Type de véhicule", value: `${getAttributeValue("vehicle_type")}`, inline: true },
                { name: "️ Couleur", value: `${getAttributeValue("vehicule_color")}`, inline: true },
                { name: "️ Nombre de portes", value: `${getAttributeValue("doors")}`, inline: true },
                { name: "️ Nombre de place(s)", value: `${getAttributeValue("seats")}`, inline: true },
                { name: "️ Puissance", value: `${getAttributeValue("horse_power_din")}`, inline: true },
                { name: "️ Mise en ligne", value: `<t:${toUnix(index_date)}:R>`, inline: true },
                { name: "Info Suppl", value: `${distanceValue.distance} (${distanceValue.time})` }
            );
            embeds.push(embedBuilder);
        }

        await channel.send({ embeds: embeds, components: [comp] });
    } catch (error) {
        console.error('Erreur :', error.message);
    }

    await reload(channel, options, activeSearches);
}

function formatPrice(price) {
    return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

async function reload(channel, options, activeSearches) {
    await delay(17000);
    await sendToDiscord(channel, options, activeSearches);
}

function toUnix(dateString) {
    const date = new Date(dateString);
    const unixTimeSeconds = Math.floor(date.getTime() / 1000);
    return unixTimeSeconds;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { sendToDiscord };
