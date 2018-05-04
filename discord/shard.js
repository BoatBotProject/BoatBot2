"use strict";
const start_time = new Date().getTime();
const fs = require("fs");
const Discord = require("discord.js");
let discordcommands = require("./discordcommands.js");

const UTILS = new (require("../utils.js"))();

const client = new Discord.Client({ disabledEvents: ["TYPING_START"] });

let CONFIG;
try {
	CONFIG = JSON.parse(fs.readFileSync("../config.json", "utf-8"));
	CONFIG.VERSION = "v1.3.0b";//b for non-release (in development)
}
catch (e) {
	console.log("something's wrong with config.json");
	console.error(e);
	process.exit(1);
}
const mode = process.env.NODE_ENV === "production" ? "PRODUCTION:warning:" : process.env.NODE_ENV;
const DB = new (require("./dbmanager.js"))(CONFIG);
const LOLAPI = new (require("./lolapi.js"))(CONFIG, 0);
const wsapi = new (require("./wsapi.js"))(CONFIG, client);
LOLAPI.getStatic("realms/na.json").then(result => {//load static dd version
	UTILS.output("DD STATIC RESOURCES LOADED");
	CONFIG.STATIC = result;
	let temp_regions = [];
	for (let i in CONFIG.REGIONS) temp_regions.push(CONFIG.REGIONS[i]);
	Promise.all(temp_regions.map(tr => { return LOLAPI.getStaticChampions(tr); })).then(results => {
		CONFIG.STATIC.CHAMPIONS = results[0].data;
		LOLAPI.getStaticSummonerSpells("na1").then(result => {
			CONFIG.STATIC.SUMMONERSPELLS = result.data;
			UTILS.output("API STATIC RESOURCES LOADED");
			if (process.env.NODE_ENV === "production") {//production key
				UTILS.output("PRODUCTION LOGIN");
				client.login().catch(console.error);
			}
			else {//non-production key
				UTILS.output("DEVELOPMENT LOGIN");
				client.login().catch(console.error);
			}
		});
	}).catch(e => { throw e; });
}).catch(e => { throw e; });
let initial_start = true;
client.on("ready", function () {
	if (initial_start) UTILS.output("discord user login success");
	else UTILS.output("discord reconnected");
	client.user.setStatus("online").catch(console.error);
	client.user.setActivity("League of Legends").catch(console.error);
	if (initial_start) sendToChannel(CONFIG.LOG_CHANNEL_ID, ":repeat:`$" + process.env.SHARD_ID + "`Bot started in " + UTILS.round((new Date().getTime() - start_time) / 1000, 0) + "s: version: " + CONFIG.VERSION + " mode: " + mode + " servers: " + client.guilds.size);
	else sendToChannel(CONFIG.LOG_CHANNEL_ID, ":repeat:`$" + process.env.SHARD_ID + "`Bot reconnected");
	let all_emojis = [];//collects all emojis from emoji servers
	for (let i in CONFIG.CHAMP_EMOJI_SERVERS) {
		const candidate = client.guilds.get(CONFIG.CHAMP_EMOJI_SERVERS[i]);
		if (UTILS.exists(candidate)) all_emojis = all_emojis.concat(candidate.emojis.array());
	}
	all_emojis = all_emojis.map(e => { return { name: e.name.toLowerCase(), code: e.toString() }; });
	wsapi.sendEmojis(all_emojis);
	for (let b in CONFIG.STATIC.CHAMPIONS) CONFIG.STATIC.CHAMPIONS[b].emoji = CONFIG.STATIC.CHAMPIONS[b].name;
	UTILS.output("default champion emojis set");
	initial_start = false;
});
client.on("disconnect", function () {
	UTILS.output("discord disconnected");
});
client.on("message", function (msg) {
	try {
		discordcommands(CONFIG, client, msg, DB, wsapi);
	}
	catch (e) {
		console.error(e);
	}
});
client.on("guildCreate", function (guild) {
	UTILS.output("Server Joined: " + guild.id + " :: " + guild.name + " :: Population=" + guild.memberCount + " :: " + guild.owner.user.tag);
	sendToChannel(CONFIG.LOG_CHANNEL_ID, ":white_check_mark:`$" + process.env.SHARD_ID + "`Server Joined: `" + guild.id + "` :: " + guild.name + " :: Population=" + guild.memberCount + " :: " + guild.owner.user.tag);
	guild.owner.send("SupportBot has joined your server: " + guild.name + "\nUse `Lhelp` for information on how to use SupportBot.\nAdd SupportBot to other servers using this link: <" + CONFIG.BOT_ADD_LINK + ">").catch(e => console.error(e));
	let candidate = UTILS.preferredTextChannel(client, guild.channels, "text", ["general", "bot", "bots", "bot-commands", "botcommands", "lol", "league", "spam"], ["VIEW_CHANNEL", "SEND_MESSAGES"]);
	if (UTILS.exists(candidate)) candidate.send("Use `Lhelp` for information on how to use SupportBot.\nAdd SupportBot to other servers using this link: <" + CONFIG.BOT_ADD_LINK + ">").catch();
});
client.on("guildDelete", function(guild) {
	UTILS.output("Server Left: " + guild.id + " :: " + guild.name + " :: Population=" + guild.memberCount + " :: " + guild.owner.user.tag);
	sendToChannel(CONFIG.LOG_CHANNEL_ID, ":x:`$" + process.env.SHARD_ID + "`Server Left: `" + guild.id + "` :: " + guild.name + " :: Population=" + guild.memberCount + " :: " + guild.owner.user.tag);
});
function sendToChannel(cid, text) {//duplicated in discordcommands.js
	const candidate = client.channels.get(cid);
	if (UTILS.exists(candidate)) return candidate.send(text);
	else wsapi.sendTextToChannel(cid, text);
}
//setInterval(() => {}, 60000);
