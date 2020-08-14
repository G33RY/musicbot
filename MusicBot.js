//YoutTube
const Searcher = require(`yt-search`);
const ytdl = require(`ytdl-core`);

// Others
const moment = require(`moment`);
const fs = require(`fs`);
const fs_extra = require(`fs-extra`);
const path = require(`path`);

const Discord = require('discord.js');
const { validateURL } = require('ytdl-core');
const { search } = require('yt-search');
const { isNumber } = require('util');
const { get } = require('http');
const { timeStamp } = require('console');

class MusicBot{
    constructor(){
        this.bot = new Discord.Client();
        this.TOKEN = process.env.BOT_TOKEN;
        this.volume = 0.5;
        this.GConnection = null;
        this.queue = [];
        this.musicIndex = null
        this.loopMode = false

        this.bot.on('ready', () => {
            console.log(`Logged in as ${this.bot.user.tag}!`);
            this.bot.user.setPresence({activity: {
                name: 'MUSIC 24/7',
                type: 'LISTENING'
            }})
        });

        this.bot.on('message', async msg => {
            if(!msg.content.startsWith('!')) return;

            let command = msg.content.substr(1).split(' ')[0]
            switch (command) {
                case "volume":{
                    this.Volume(msg)
                    break;
                }
                case "join":{
                    this.Join(msg)
                    break;
                }
                case "leave":{
                    this.Leave(msg)
                    break;
                }
                case "play":{
                    let url = await this.getUrl(msg);
                    this.Play(msg, url)
                    break;
                }
                case "stop":{
                    if(this.dispatcher) this.dispatcher.destroy();
                    msg.react('👍');
                    break;
                }
                case "pause":{
                    if(this.dispatcher) this.dispatcher.pause()
                    msg.react('👍');
                    break;
                }
                case "resume":{
                    if(this.dispatcher) this.dispatcher.resume()
                    msg.react('👍');
                    break;
                }
                case "loop":{
                    if(msg.content.split(" ")[1] == "on") this.loopMode = true;
                    if(msg.content.split(" ")[1] == "off") this.loopMode = false;
                    msg.react('👍');
                    break;
                }
                case "skip":{
                    this.SkipSong(msg)
                    msg.react('👍');
                    break;
                }
                case 'queue': {
                    this.Queue(msg);
                    break;
                }
                case 'clear': {
                    this.queue = [];
                    msg.react('👍');
                    break;
                }
                case "add": {
                    let url = await this.getUrl(msg, false);
                    ytdl.getBasicInfo(url).then(m => {
                        const embed = new Discord.MessageEmbed({
                            "title": m.videoDetails.title,
                            "description": `Uploaded: __**[${m.videoDetails.author.name}](${m.videoDetails.author.user_url})**__ \nTime: **${moment(m.videoDetails.lengthSeconds * 1000).subtract(1, "hours").format(`HH:mm:ss`)}**`,
                            "url": m.videoDetails.video_url,
                            "color": 3145472,
                            "thumbnail": {
                                "url": m.videoDetails.thumbnail.thumbnails[0].url,
                            },
                            "author": {
                                "name": `Music Bot | Added to Queue:`,
                                "icon_url": "https://i.imgur.com/Pxk3gPQ.jpg"
                            },
                            "footer": {
                                "icon_url": msg.member.user.avatarURL(),
                                "text": msg.member.displayName
                            },
                        })
                        msg.channel.send(embed)
                    })

                    msg.react('👍');
                    break;
                }
                case "remove": {
                    let url = await this.getUrl(msg);
                    this.queue.splice(this.queue.indexOf(url))
                    ytdl.getBasicInfo(url).then(m => {
                        const embed = new Discord.MessageEmbed({
                            "title": m.videoDetails.title,
                            "description": `Uploaded: __**[${m.videoDetails.author.name}](${m.videoDetails.author.user_url})**__ \nTime: **${moment(m.videoDetails.lengthSeconds * 1000).subtract(1, "hours").format(`HH:mm:ss`)}**`,
                            "url": m.videoDetails.video_url,
                            "color": 3145472,
                            "thumbnail": {
                                "url": m.videoDetails.thumbnail.thumbnails[0].url,
                            },
                            "author": {
                                "name": `Music Bot | Removed from Queue:`,
                                "icon_url": "https://i.imgur.com/Pxk3gPQ.jpg"
                            },
                            "footer": {
                                "icon_url": msg.member.user.avatarURL(),
                                "text": msg.member.displayName
                            },
                        })
                        msg.channel.send(embed)
                    })
                    msg.react('👍');
                    break;
                }
                case "commands": {
                    this.Commands(msg);
                    break;
                }
            }
        });

        this.bot.login(this.TOKEN);
    }

    async getUrl(msg, numberAllowed = true) {
        let param = msg.content.substr(msg.content.split(' ')[0].length);
        if(isNaN(param) || !numberAllowed){
            let url = validateURL(param) ? param : (await Searcher(param)).videos[0].url;

            //Add to queue
            if(!this.queue.includes(url)){
                this.queue.push(url);
                this.musicIndex = this.queue.length-1;
            }else{
                this.musicIndex = this.queue.indexOf(url);
            }
    
            return url;
        }

        let num = parseInt(param);

        if(num < 0 || num > this.queue.length-1) return msg.channel.send("I cant find that song");

        return this.queue[num];
    }

    async Join(msg) {
        if(msg.member.voice.channel){
            await msg.member.voice.channel.join().then(connection => {
                this.GConnection = connection;
            })
        }
        msg.react('👍');
        return true;
    }

    async Leave(msg) {
        if(msg.member.voice.channel){
            await msg.member.voice.channel.leave()
            this.GConnection = null;
        }
        msg.react('👍');
        return true;
    }

    async Volume(msg){
        //Check if number
        if(isNaN(msg.content.split(' ')[1])) return msg.reply('I need a number beetween 0 and 100');

        //Parse & Validate the number
        let num = parseInt(msg.content.split(' ')[1]);
        if(num > 100 || num < 0) return msg.reply('I need a number beetween 0 and 100');

        //Set the Volume
        this.volume = num / 100;
        if(this.dispatcher) this.dispatcher.setVolume(this.volume);
        
        msg.react('👍');
    }

    async Play(msg, url, sendEmbed = true) {
        //Check Connection
        if(!this.GConnection)
            if(await this.Join(msg)) this.Join(msg);

        console.log(this.musicIndex);
        console.log(this.queue);

        this.dispatcher = this.GConnection.play(ytdl(url)) //Play the stream
        this.dispatcher.setVolume(this.volume); //Set Volume
        
        if(sendEmbed){
            //Send Embed
            ytdl.getBasicInfo(url).then(m => {
                const embed = new Discord.MessageEmbed({
                    "title": m.videoDetails.title,
                    "description": `Uploaded: __**[${m.videoDetails.author.name}](${m.videoDetails.author.user_url})**__ \nTime: **${moment(m.videoDetails.lengthSeconds * 1000).subtract(1, "hours").format(`HH:mm:ss`)}**`,
                    "url": m.videoDetails.video_url,
                    "color": 3145472,
                    "thumbnail": {
                        "url": m.videoDetails.thumbnail.thumbnails[0].url,
                    },
                    "author": {
                        "name": `Music Bot | Now Playing:`,
                        "icon_url": "https://i.imgur.com/Pxk3gPQ.jpg"
                    },
                    "footer": {
                        "icon_url": msg.member.user.avatarURL(),
                        "text": msg.member.displayName
                    },
                })
                msg.channel.send(embed)
            })
        }

        this.dispatcher.on('finish', () => {
            if(!this.loopMode) return this.SkipSong(msg);

            this.Play(msg, url, false);
        })
    }

    async SkipSong(msg){
        this.musicIndex = this.musicIndex == this.queue.length-1 ? 0 : this.musicIndex+1;

        this.Play(msg, this.queue[this.musicIndex])
    }

    async Queue(msg){
        let queue = "";

        for (let i = 0; i < this.queue.length; i++) {
            const url = this.queue[i];
            await ytdl.getBasicInfo(url).then(m => {
                queue += `**[${i}]** ${m.videoDetails.title} \n`;
            })
        }

        this.queue.forEach(async (url, i) => {
            await ytdl.getBasicInfo(url).then(m => {
                queue += `**[${i}]** ${m.videoDetails.title} \n`;
            })
        });

        const embed = new Discord.MessageEmbed({
            "description": queue,
            "color": 0x00c7fd,
            "author": {
                "name": `Music Bot | QUEUE:`,
                "icon_url": "https://i.imgur.com/Pxk3gPQ.jpg"
            },
            "footer": {
                "icon_url": msg.member.user.displayAvatarURL,
                "text": msg.member.displayName
            },
        })
        msg.channel.send(embed)
    }

    async Commands(msg){
        const embed = new Discord.MessageEmbed({
            "color": 0x669d34,
            "author": {
                "name": `Music Bot | COMMANDS:`,
                "icon_url": "https://i.imgur.com/Pxk3gPQ.jpg"
            },
            "fields": [
                {
                    'name': "Join Channel",
                    "value": "!join"
                },
                {
                    'name': "Leave Channel",
                    "value": "!leave"
                },
                {
                    'name': "Play Song Or Add Song To Queue",
                    "value": "!play { url / title / song number }"
                },
                {
                    'name': "Stop Playing",
                    "value": "!stop"
                },
                {
                    'name': "Resume Song",
                    "value": "!resume"
                },
                {
                    'name': "Pause Song",
                    "value": "!pause"
                },
                {
                    'name': "Skip Song",
                    "value": "!skip"
                },
                {
                    'name': "Loop Song",
                    "value": "!loop { on / off }"
                },
                {
                    'name': "Change Volume",
                    "value": "!volume { 0-100 }"
                },
                {
                    'name': "Show Queue",
                    "value": "!queue"
                },
                {
                    'name': "Clear Queue",
                    "value": "!clear"
                },
                {
                    'name': "Add Song To Queue",
                    "value": "!add { url / title }"
                },
                {
                    'name': "Remove Song From Queue",
                    "value": "!remove { url / title / song number }"
                },
            ]
        })
        msg.channel.send(embed)
    }
}

module.exports = new MusicBot();
