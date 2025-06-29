// File: index.js
require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior, getVoiceConnection } = require('@discordjs/voice');
const play = require('play-dl');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

const prefix = '!';
const queue = new Map();
const OWNER_ID = 'masukkan_discord_id_owner_di_sini';

client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (!message.content.startsWith(prefix) || message.author.bot) return;

  const serverQueue = queue.get(message.guild.id);
  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'play') {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.reply('🎤 Kamu harus di voice channel!');
    const songInfo = args.join(' ');
    if (!songInfo) return message.reply('Masukkan judul lagu atau link YouTube/Spotify');

    const song = await play.search(songInfo, { limit: 1 });
    if (!song || !song[0]) return message.reply('❌ Lagu tidak ditemukan.');
    const stream = await play.stream(song[0].url);

    const songData = {
      title: song[0].title,
      url: song[0].url,
      stream: stream.stream,
      type: stream.type,
      volume: 1.0
    };

    if (!serverQueue) {
      const queueContruct = {
        textChannel: message.channel,
        voiceChannel: voiceChannel,
        connection: null,
        songs: [],
        player: createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } }),
        volume: 1.0,
        timeout: null
      };
      queue.set(message.guild.id, queueContruct);
      queueContruct.songs.push(songData);

      try {
        const connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: message.guild.id,
          adapterCreator: message.guild.voiceAdapterCreator
        });
        queueContruct.connection = connection;
        connection.subscribe(queueContruct.player);
        playSong(message.guild, queueContruct.songs[0]);
      } catch (err) {
        console.error(err);
        queue.delete(message.guild.id);
        return message.channel.send('❌ Gagal memutar lagu.');
      }
    } else {
      serverQueue.songs.push(songData);
      return message.channel.send(`🎵 Lagu ditambahkan ke antrean: **${songData.title}**`);
    }
  }

  if (command === 'skip') {
    if (!serverQueue) return message.reply('❌ Tidak ada lagu yang diputar.');
    serverQueue.player.stop();
    message.channel.send('⏭️ Melewati lagu...');
  }

  if (command === 'stop') {
    if (!serverQueue) return message.reply('❌ Tidak ada lagu yang diputar.');
    serverQueue.songs = [];
    serverQueue.player.stop();
    message.channel.send('⏹️ Musik dihentikan dan antrean dibersihkan.');
  }

  if (command === 'pause') {
    if (!serverQueue) return message.reply('❌ Tidak ada lagu yang diputar.');
    serverQueue.player.pause();
    message.channel.send('⏸️ Musik dijeda.');
  }

  if (command === 'resume') {
    if (!serverQueue) return message.reply('❌ Tidak ada lagu yang diputar.');
    serverQueue.player.unpause();
    message.channel.send('▶️ Musik dilanjutkan.');
  }

  if (command === 'volume') {
    if (!serverQueue) return message.reply('❌ Tidak ada musik.');
    const volume = parseFloat(args[0]);
    if (isNaN(volume) || volume < 0 || volume > 2) return message.reply('Gunakan volume antara 0.0 - 2.0');
    serverQueue.volume = volume;
    message.channel.send(`🔊 Volume disetel ke ${volume * 100}%`);
  }

  if (command === 'queue') {
    if (!serverQueue || serverQueue.songs.length === 0) return message.reply('🚫 Antrean kosong.');
    const q = serverQueue.songs.map((s, i) => `${i + 1}. ${s.title}`).join('\n');
    message.channel.send(`📜 Antrean lagu:\n${q}`);
  }

  if (command === 'shuffle') {
    if (!serverQueue || serverQueue.songs.length <= 1) return message.reply('❌ Tidak cukup lagu untuk diacak.');
    serverQueue.songs = [serverQueue.songs[0], ...shuffleArray(serverQueue.songs.slice(1))];
    message.channel.send('🔀 Antrean diacak!');
  }

  if (command === 'ping') {
    message.reply(`🏓 Pong! Latency: ${client.ws.ping}ms`);
  }

  if (command === 'announce') {
    if (message.author.id !== OWNER_ID) return message.reply('❌ Hanya owner yang bisa mengumumkan.');
    const content = args.join(' ');
    if (!content) return message.reply('Masukkan isi pengumuman.');
    const guilds = client.guilds.cache;
    guilds.forEach(guild => {
      const defaultChannel = guild.systemChannel || guild.channels.cache.find(ch => ch.type === 0 && ch.permissionsFor(guild.members.me).has('SendMessages'));
      if (defaultChannel) {
        defaultChannel.send(`📢 **Pengumuman dari Bot Owner**:\n${content}`);
      }
    });
    message.reply('✅ Pengumuman dikirim ke semua server.');
  }
});

function playSong(guild, song) {
  const serverQueue = queue.get(guild.id);
  if (!song) {
    serverQueue.timeout = setTimeout(() => {
      serverQueue.connection.destroy();
      queue.delete(guild.id);
    }, 300000); // 5 menit
    return;
  }
  const resource = createAudioResource(song.stream, { inputType: song.type, inlineVolume: true });
  resource.volume.setVolume(serverQueue.volume);
  serverQueue.player.play(resource);
  serverQueue.textChannel.send(`🎶 Sedang memutar: **${song.title}**`);

  serverQueue.player.once(AudioPlayerStatus.Idle, () => {
    serverQueue.songs.shift();
    playSong(guild, serverQueue.songs[0]);
  });
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

client.login(process.env.TOKEN);
