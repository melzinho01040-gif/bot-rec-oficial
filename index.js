const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  ActivityType,
  ModalBuilder,
  MessageFlags,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const fontconfigDir = path.join(__dirname, "fontconfig");
const fontconfigFile = path.join(fontconfigDir, "fonts.conf");
ensureFontconfigConfig(fontconfigDir, fontconfigFile);
process.env.FONTCONFIG_PATH ||= fontconfigDir;
process.env.FONTCONFIG_FILE ||= fontconfigFile;
process.env.XDG_CACHE_HOME ||= "/tmp";

let sharp = null;
try {
  sharp = require("sharp");
} catch {
  sharp = null;
}

const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  registerCommands: String(process.env.REGISTER_COMMANDS || "false").toLowerCase() === "true",
  brandName: process.env.BRAND_NAME || "Divine Hunters",
  color: parseColor(process.env.BRAND_COLOR || process.env.EMBED_COLOR || process.env.COLOR || "7b2cff"),
  bannerUrl: process.env.BANNER_URL || "",
  logoUrl: process.env.LOGO_URL || "",
  panelGifUrl: process.env.PANEL_GIF_URL || process.env.ANIMATION_GIF_URL || "",
  stockGifUrl: process.env.STOCK_GIF_URL || "",
  applicationLogChannelId: process.env.APPLICATION_LOG_CHANNEL_ID || "",
  applicationReviewChannelId: process.env.APPLICATION_REVIEW_CHANNEL_ID || process.env.REVIEW_CHANNEL_ID || "",
  auditLogChannelId: process.env.AUDIT_LOG_CHANNEL_ID || process.env.LOG_CHANNEL_ID || "",
  recruitmentCategoryId: process.env.RECRUITMENT_CATEGORY_ID || process.env.APPLICATION_CATEGORY_ID || "",
  stockChannelId: process.env.STOCK_CHANNEL_ID || "",
  stockShowSource: String(process.env.STOCK_SHOW_SOURCE || "false").toLowerCase() === "true",
  stockBrandName: process.env.STOCK_BRAND_NAME || "Divine Hunters",
  stockLogoUrl: process.env.STOCK_LOGO_URL || "",
  boostChannelId: process.env.BOOST_CHANNEL_ID || "",
  ticketCategoryId: process.env.TICKET_CATEGORY_ID || "",
  staffRoleId: process.env.STAFF_ROLE_ID || "",
  captainRoleId: process.env.CAPTAIN_ROLE_ID || "",
  memberRoleId: process.env.MEMBER_ROLE_ID || "1508588125365207120",
  pendingCrewRoleId: process.env.PART_CREW_ROLE_ID || process.env.PART_OF_CREW_ROLE_ID || process.env.PENDING_CREW_ROLE_ID || "1508588131975299073",
  stockApiUrls: parseUrlList(process.env.STOCK_API_URL || ""),
  stockIntervalMinutes: clamp(Number(process.env.STOCK_INTERVAL_MINUTES || 5), 1, 240),
  stockCacheMinutes: clamp(Number(process.env.STOCK_CACHE_MINUTES || 2), 0, 15),
  stockCacheMaxStaleHours: clamp(Number(process.env.STOCK_CACHE_MAX_STALE_HOURS || 12), 1, 72),
  stockNormalOffsetHour: clamp(Number(process.env.STOCK_NORMAL_OFFSET_HOUR || 1), 0, 23),
  stockMirageOffsetHour: clamp(Number(process.env.STOCK_MIRAGE_OFFSET_HOUR || 1), 0, 23),
  applicationCooldownMinutes: clamp(Number(process.env.APPLICATION_COOLDOWN_MINUTES || 10), 0, 1440),
  dataFile: process.env.DATA_FILE || path.join(__dirname, "bot-data.json"),
  timezone: process.env.TIMEZONE || process.env.TZ || "America/Sao_Paulo",
  services: parseServices(process.env.SERVICES_JSON),
  emoji: parseEmojiConfig(process.env.EMOJI_JSON),
  activities: parseActivityList(process.env.BOT_ACTIVITIES),
  badWords: parseBadWords(process.env.AUTOMOD_BAD_WORDS),
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildExpressions || GatewayIntentBits.GuildEmojisAndStickers,
  ].filter(Boolean),
});

let lastStockHashes = { normal: "", mirage: "" };
let stockSchedulerStarted = false;
let stockRotationTimer = null;
let stockCache = null;
const applicationCooldowns = new Map();
const EPHEMERAL = MessageFlags.Ephemeral;
const DATA_SAVE_DELAY_MS = 5000;
const XP_COOLDOWN_MS = 60000;
const data = loadData();
const xpCooldowns = new Map();
const inviteCache = new Map();
const spamBuckets = new Map();
const automodMuteCooldowns = new Map();
let dataSaveTimer = null;
let fruityBloxActionCache = { id: "", expiresAt: 0 };

const FRUITYBLOX_STOCK_URL = "https://fruityblox.com/stock";
const FRUITYBLOX_ACTION_ID_FALLBACK = "00f5faf6ef807fd99ad4baa377a0a84ba899093aba";
const FRUITYBLOX_ROUTER_STATE_TREE = "%5B%22%22%2C%7B%22children%22%3A%5B%22stock%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%2Ctrue%5D";
const BLOXFRUITSVALUES_URL = "https://bloxfruitsvalues.com/values/fruits?sortBy=value_high_low";

const EXTRA_COMMANDS = new Set([
  "addcrewaccount",
  "addmemberaccount",
  "addroleallmembers",
  "botservers",
  "checklevel",
  "closeregisteruser",
  "findlink",
  "findmember",
  "forceupdatefruitstock",
  "fruitvalue",
  "guildaccess",
  "guildbanuser",
  "invitecodes",
  "invitedlist",
  "inviter",
  "invites",
  "rankxp",
  "registercrew",
  "registermember",
  "removecrewaccount",
  "removeentecrew",
  "removefromcrew",
  "removememberaccount",
  "removepregister",
]);

const commands = [
  new SlashCommandBuilder()
    .setName("setup-recrutamento")
    .setDescription("Envia o painel completo de recrutamento com botoes.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("canal_aplicacoes")
        .setDescription("Canal privado onde as novas aplicacoes vao cair")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName("categoria_recrutamento")
        .setDescription("Categoria onde cada formulario de recrutamento vai abrir um canal")
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(false),
    )
    .addRoleOption((option) =>
      option
        .setName("cargo_staff")
        .setDescription("Cargo aplicado quando Staff for aprovado")
        .setRequired(false),
    )
    .addRoleOption((option) =>
      option
        .setName("cargo_capitao")
        .setDescription("Cargo aplicado quando Capitao for aprovado")
        .setRequired(false),
    )
    .addRoleOption((option) =>
      option
        .setName("cargo_membro")
        .setDescription("Cargo aplicado quando Recrutamento for aprovado")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("banner_url")
        .setDescription("URL de banner para esse embed")
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("recrutamento")
    .setDescription("Central moderna de recrutamento.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Cria o painel de recrutamento com canal individual por formulario.")
        .addChannelOption((option) =>
          option
            .setName("categoria")
            .setDescription("Categoria onde cada candidato tera um canal")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName("canal_painel")
            .setDescription("Canal onde o painel sera enviado; se vazio, usa o canal atual")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        )
        .addChannelOption((option) =>
          option
            .setName("canal_aplicacoes")
            .setDescription("Canal extra de logs/analise para receber uma copia")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        )
        .addRoleOption((option) =>
          option
            .setName("cargo_membro")
            .setDescription("Cargo aplicado quando Recrutamento for aprovado")
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("banner_url")
            .setDescription("URL de banner para esse embed")
            .setRequired(false),
        ),
    ),
  new SlashCommandBuilder()
    .setName("central")
    .setDescription("Ferramentas centrais do bot.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("embed")
        .setDescription("Cria uma embed personalizada e envia em um canal.")
        .addChannelOption((option) =>
          option
            .setName("canal")
            .setDescription("Canal onde a embed sera enviada")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("titulo")
            .setDescription("Titulo da embed")
            .setMaxLength(256)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("descricao")
            .setDescription("Texto principal da embed")
            .setMaxLength(4000)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("cor")
            .setDescription("Cor hexadecimal, exemplo: #7b2cff")
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("imagem_url")
            .setDescription("URL de imagem grande")
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("thumbnail_url")
            .setDescription("URL de imagem pequena")
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("rodape")
            .setDescription("Texto do rodape")
            .setMaxLength(2048)
            .setRequired(false),
        ),
    ),
  new SlashCommandBuilder()
    .setName("torneio")
    .setDescription("Sistema de torneios PVP.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("participante")
        .setDescription("Confirma um participante no torneio.")
        .addUserOption((option) => option.setName("jogador").setDescription("Jogador confirmado").setRequired(true))
        .addStringOption((option) => option.setName("bounty").setDescription("Bounty do jogador").setRequired(true))
        .addStringOption((option) => option.setName("plataforma").setDescription("PC, mobile ou console").setRequired(true))
        .addChannelOption((option) =>
          option.setName("canal").setDescription("Canal onde enviar").addChannelTypes(ChannelType.GuildText).setRequired(false),
        )
        .addStringOption((option) => option.setName("imagem_url").setDescription("Imagem/banner opcional").setRequired(false)),
    ),
  new SlashCommandBuilder()
    .setName("evento")
    .setDescription("Sistema de eventos da crew.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("confirmar")
        .setDescription("Confirma resultado/pontos de um evento.")
        .addUserOption((option) => option.setName("jogador").setDescription("Jogador").setRequired(true))
        .addStringOption((option) => option.setName("nome").setDescription("Nome do evento").setRequired(true))
        .addIntegerOption((option) => option.setName("pontos").setDescription("Pontos recebidos").setMinValue(0).setMaxValue(999).setRequired(true))
        .addChannelOption((option) =>
          option.setName("canal").setDescription("Canal onde enviar").addChannelTypes(ChannelType.GuildText).setRequired(false),
        )
        .addStringOption((option) => option.setName("imagem_url").setDescription("Imagem/banner opcional").setRequired(false)),
    ),
  new SlashCommandBuilder()
    .setName("pvp")
    .setDescription("Sistema de duelos PVP.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("duelo")
        .setDescription("Marca um duelo PVP.")
        .addUserOption((option) => option.setName("jogador1").setDescription("Primeiro jogador").setRequired(true))
        .addUserOption((option) => option.setName("jogador2").setDescription("Segundo jogador").setRequired(true))
        .addStringOption((option) => option.setName("data").setDescription("Data do duelo, ex.: 19/05/2026").setRequired(true))
        .addStringOption((option) => option.setName("hora").setDescription("Hora do duelo, ex.: 19:00").setRequired(true))
        .addChannelOption((option) =>
          option.setName("canal").setDescription("Canal onde enviar").addChannelTypes(ChannelType.GuildText).setRequired(false),
        )
        .addStringOption((option) => option.setName("imagem_url").setDescription("Imagem/banner opcional").setRequired(false)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("resultado")
        .setDescription("Registra resultado no ranking PVP.")
        .addUserOption((option) => option.setName("vencedor").setDescription("Quem venceu").setRequired(true))
        .addUserOption((option) => option.setName("perdedor").setDescription("Quem perdeu").setRequired(true))
        .addStringOption((option) => option.setName("observacao").setDescription("Detalhe opcional").setMaxLength(500).setRequired(false)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("ranking")
        .setDescription("Mostra ranking PVP da crew."),
    ),
  new SlashCommandBuilder()
    .setName("auditoria")
    .setDescription("Configura o canal de auditoria do bot.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Define o canal onde as auditorias serao enviadas.")
        .addChannelOption((option) =>
          option.setName("canal").setDescription("Canal de auditoria").addChannelTypes(ChannelType.GuildText).setRequired(true),
        ),
    ),
  new SlashCommandBuilder()
    .setName("regras")
    .setDescription("Cria uma embed bonita com as regras da crew.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Envia o painel de regras em um canal.")
        .addChannelOption((option) =>
          option.setName("canal").setDescription("Canal das regras").addChannelTypes(ChannelType.GuildText).setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("titulo").setDescription("Titulo do painel").setMaxLength(120).setRequired(false),
        )
        .addStringOption((option) =>
          option.setName("texto").setDescription("Regras personalizadas").setMaxLength(3500).setRequired(false),
        )
        .addStringOption((option) =>
          option.setName("imagem_url").setDescription("Banner/imagem opcional").setRequired(false),
        ),
    ),
  new SlashCommandBuilder()
    .setName("sugestao")
    .setDescription("Sistema de sugestoes da crew.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Define o canal onde as sugestoes serao enviadas.")
        .addChannelOption((option) =>
          option.setName("canal").setDescription("Canal de sugestoes").addChannelTypes(ChannelType.GuildText).setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("enviar")
        .setDescription("Envia uma sugestao para votacao.")
        .addStringOption((option) =>
          option.setName("texto").setDescription("Sua sugestao").setMaxLength(1800).setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("imagem_url").setDescription("Imagem opcional").setRequired(false),
        ),
    ),
  new SlashCommandBuilder()
    .setName("anuncio")
    .setDescription("Envia anuncios em embed no estilo da crew.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("enviar")
        .setDescription("Publica um anuncio em um canal.")
        .addChannelOption((option) =>
          option.setName("canal").setDescription("Canal do anuncio").addChannelTypes(ChannelType.GuildText).setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("titulo").setDescription("Titulo do anuncio").setMaxLength(160).setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("texto").setDescription("Texto do anuncio").setMaxLength(3500).setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("imagem_url").setDescription("Banner/imagem opcional").setRequired(false),
        )
        .addRoleOption((option) =>
          option.setName("cargo_ping").setDescription("Cargo para marcar junto do anuncio").setRequired(false),
        ),
    ),
  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Sistema simples de avisos da equipe.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Aplica um aviso em um membro.")
        .addUserOption((option) => option.setName("usuario").setDescription("Membro avisado").setRequired(true))
        .addStringOption((option) => option.setName("motivo").setDescription("Motivo do aviso").setMaxLength(800).setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("listar")
        .setDescription("Lista avisos de um membro.")
        .addUserOption((option) => option.setName("usuario").setDescription("Membro consultado").setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("limpar")
        .setDescription("Limpa os avisos de um membro.")
        .addUserOption((option) => option.setName("usuario").setDescription("Membro limpo").setRequired(true)),
    ),
  new SlashCommandBuilder()
    .setName("meta")
    .setDescription("Sistema de metas da crew.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand.setName("criar").setDescription("Cria uma meta.")
        .addStringOption((option) => option.setName("nome").setDescription("Nome da meta").setRequired(true))
        .addIntegerOption((option) => option.setName("alvo").setDescription("Valor alvo").setMinValue(1).setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("progresso").setDescription("Adiciona progresso a uma meta.")
        .addStringOption((option) => option.setName("nome").setDescription("Nome da meta").setRequired(true))
        .addIntegerOption((option) => option.setName("valor").setDescription("Valor para somar").setMinValue(1).setRequired(true))
        .addUserOption((option) => option.setName("membro").setDescription("Membro responsavel").setRequired(false)),
    )
    .addSubcommand((subcommand) => subcommand.setName("ranking").setDescription("Mostra metas ativas.")),
  new SlashCommandBuilder()
    .setName("presenca")
    .setDescription("Cria painel de confirmacao de presenca.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand.setName("criar").setDescription("Cria uma presenca com botao.")
        .addStringOption((option) => option.setName("evento").setDescription("Nome do evento").setRequired(true))
        .addStringOption((option) => option.setName("data").setDescription("Data/hora").setRequired(true))
        .addChannelOption((option) => option.setName("canal").setDescription("Canal").addChannelTypes(ChannelType.GuildText).setRequired(false)),
    ),
  new SlashCommandBuilder()
    .setName("plantao")
    .setDescription("Controle de plantao da staff.")
    .addSubcommand((subcommand) => subcommand.setName("abrir").setDescription("Entra em plantao."))
    .addSubcommand((subcommand) => subcommand.setName("fechar").setDescription("Sai do plantao."))
    .addSubcommand((subcommand) => subcommand.setName("status").setDescription("Mostra quem esta em plantao.")),
  new SlashCommandBuilder()
    .setName("blacklist")
    .setDescription("Blacklist interna da crew.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand.setName("add").setDescription("Adiciona alguem na blacklist.")
        .addStringOption((option) => option.setName("alvo").setDescription("ID, usuario, Roblox ou tag").setRequired(true))
        .addStringOption((option) => option.setName("motivo").setDescription("Motivo").setMaxLength(900).setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("remover").setDescription("Remove da blacklist.")
        .addStringOption((option) => option.setName("alvo").setDescription("Alvo").setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("check").setDescription("Consulta blacklist.")
        .addStringOption((option) => option.setName("alvo").setDescription("Alvo").setRequired(true)),
    )
    .addSubcommand((subcommand) => subcommand.setName("listar").setDescription("Lista blacklist.")),
  new SlashCommandBuilder()
    .setName("votacao")
    .setDescription("Cria votacao simples.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand.setName("criar").setDescription("Cria votacao com aprovar/reprovar.")
        .addStringOption((option) => option.setName("titulo").setDescription("Titulo").setRequired(true))
        .addStringOption((option) => option.setName("descricao").setDescription("Descricao").setMaxLength(1800).setRequired(true))
        .addChannelOption((option) => option.setName("canal").setDescription("Canal").addChannelTypes(ChannelType.GuildText).setRequired(false)),
    ),
  new SlashCommandBuilder()
    .setName("perfil")
    .setDescription("Mostra ficha completa de um membro.")
    .addUserOption((option) => option.setName("membro").setDescription("Membro").setRequired(false)),
  new SlashCommandBuilder()
    .setName("relatorio")
    .setDescription("Relatorios administrativos da crew.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) => subcommand.setName("semanal").setDescription("Mostra resumo semanal da crew.")),
  new SlashCommandBuilder()
    .setName("boasvindas")
    .setDescription("Configura boas-vindas em embed.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand.setName("setup").setDescription("Define canal de boas-vindas.")
        .addChannelOption((option) => option.setName("canal").setDescription("Canal").addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addStringOption((option) => option.setName("mensagem").setDescription("Mensagem opcional").setMaxLength(1000).setRequired(false))
        .addStringOption((option) => option.setName("imagem_url").setDescription("Imagem opcional").setRequired(false)),
    ),
  new SlashCommandBuilder()
    .setName("verificacao")
    .setDescription("Sistema de verificacao para liberar o servidor.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand.setName("setup").setDescription("Envia painel de verificacao.")
        .addChannelOption((option) => option.setName("canal").setDescription("Canal do painel").addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addRoleOption((option) => option.setName("cargo").setDescription("Cargo liberado apos verificar").setRequired(true))
        .addStringOption((option) => option.setName("link").setDescription("Link de regras/site para abrir antes de verificar").setRequired(false))
        .addStringOption((option) => option.setName("imagem_url").setDescription("Imagem opcional do painel").setRequired(false)),
    ),
  new SlashCommandBuilder()
    .setName("strike")
    .setDescription("Sistema de strikes da crew.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((subcommand) =>
      subcommand.setName("add").setDescription("Aplica strike.")
        .addUserOption((option) => option.setName("membro").setDescription("Membro").setRequired(true))
        .addStringOption((option) => option.setName("motivo").setDescription("Motivo").setMaxLength(900).setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("listar").setDescription("Lista strikes.")
        .addUserOption((option) => option.setName("membro").setDescription("Membro").setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("limpar").setDescription("Limpa strikes.")
        .addUserOption((option) => option.setName("membro").setDescription("Membro").setRequired(true)),
    ),
  new SlashCommandBuilder()
    .setName("crewstatus")
    .setDescription("Painel de status da crew.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand.setName("enviar").setDescription("Envia painel de status.")
        .addChannelOption((option) => option.setName("canal").setDescription("Canal").addChannelTypes(ChannelType.GuildText).setRequired(false)),
    ),
  new SlashCommandBuilder()
    .setName("setup-staff")
    .setDescription("Envia o painel de aplicacao para staff.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("canal_aplicacoes")
        .setDescription("Canal privado onde as novas aplicacoes vao cair")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .addRoleOption((option) =>
      option
        .setName("cargo_aprovado")
        .setDescription("Cargo aplicado quando a aplicacao for aprovada")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("banner_url")
        .setDescription("URL de banner para esse embed")
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("setup-capitao")
    .setDescription("Envia o painel de aplicacao para capitao.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("canal_aplicacoes")
        .setDescription("Canal privado onde as novas aplicacoes vao cair")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .addRoleOption((option) =>
      option
        .setName("cargo_aprovado")
        .setDescription("Cargo aplicado quando a aplicacao for aprovada")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("banner_url")
        .setDescription("URL de banner para esse embed")
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("embed-staff")
    .setDescription("Gera o embed de aplicacao para staff.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("canal_aplicacoes")
        .setDescription("Canal privado onde as novas aplicacoes vao cair")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .addRoleOption((option) =>
      option
        .setName("cargo_aprovado")
        .setDescription("Cargo aplicado quando a aplicacao for aprovada")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("banner_url")
        .setDescription("URL de banner para esse embed")
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("embed-capitao")
    .setDescription("Gera o embed de aplicacao para capitao.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("canal_aplicacoes")
        .setDescription("Canal privado onde as novas aplicacoes vao cair")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .addRoleOption((option) =>
      option
        .setName("cargo_aprovado")
        .setDescription("Cargo aplicado quando a aplicacao for aprovada")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("banner_url")
        .setDescription("URL de banner para esse embed")
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("setup-servicos")
    .setDescription("Envia o painel de servicos/precos com ticket.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName("banner_url")
        .setDescription("URL de banner para esse embed")
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("centralticket")
    .setDescription("Cria uma central de tickets por topicos privados.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("canal_sair_crew")
        .setDescription("Canal base dos topicos de sair da crew")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false),
    )
    .addChannelOption((option) =>
      option
        .setName("canal_suporte")
        .setDescription("Canal base dos topicos de suporte")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false),
    )
    .addRoleOption((option) =>
      option
        .setName("cargo_suporte")
        .setDescription("Cargo que pode ver/assumir tickets")
        .setRequired(false),
    )
    .addRoleOption((option) =>
      option
        .setName("cargo_admin")
        .setDescription("Cargo admin/sup/aux que pode ver tickets")
        .setRequired(false),
    )
    .addChannelOption((option) =>
      option
        .setName("canal_logs")
        .setDescription("Canal onde envia logs e transcript")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("setup-stock")
    .setDescription("Envia o painel de stock com botao de atualizar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("canal_stock")
        .setDescription("Canal onde o stock sera enviado")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("roblox")
    .setDescription("Mostra perfil e avatar Roblox pelo nome.")
    .addStringOption((option) =>
      option.setName("nome").setDescription("Nome do usuario Roblox").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("stock")
    .setDescription("Mostra o stock atual de Blox Fruits."),
  new SlashCommandBuilder()
    .setName("combo")
    .setDescription("Monta um combo de Blox Fruits pela sua fruta, estilo, espada e arma.")
    .addStringOption((option) =>
      option.setName("fruta").setDescription("Sua fruta, ex.: Dough, Portal, Kitsune").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("estilo").setDescription("Estilo de luta, ex.: Godhuman, Sanguine Art").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("espada").setDescription("Sua espada, ex.: Cursed Dual Katana").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("arma").setDescription("Sua arma/gun, ex.: Soul Guitar").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("objetivo")
        .setDescription("Tipo de combo")
        .setRequired(false)
        .addChoices(
          { name: "PVP", value: "pvp" },
          { name: "Bounty Hunt", value: "bounty" },
          { name: "One Shot", value: "oneshot" },
          { name: "Controle", value: "control" },
        ),
    ),
  new SlashCommandBuilder()
    .setName("api-status")
    .setDescription("Testa APIs de stock e Roblox.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Mostra a latencia do bot."),
  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Mostra o avatar de um usuario.")
    .addUserOption((option) =>
      option.setName("usuario").setDescription("Usuario opcional").setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Mostra informacoes do servidor."),
  new SlashCommandBuilder()
    .setName("limpar")
    .setDescription("Apaga mensagens do canal atual.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((option) =>
      option
        .setName("quantidade")
        .setDescription("Quantidade de mensagens para apagar, de 1 a 100")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true),
    )
    .addUserOption((option) =>
      option.setName("usuario").setDescription("Apagar so mensagens deste usuario").setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("nuke")
    .setDescription("Apaga todas as mensagens do canal recriando ele.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption((option) =>
      option.setName("motivo").setDescription("Motivo").setMaxLength(300).setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("precos")
    .setDescription("Mostra a tabela de servicos/precos configurada."),
  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Trava o canal atual para membros comuns.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption((option) =>
      option.setName("motivo").setDescription("Motivo do lock").setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Destrava o canal atual.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Bane um usuario do servidor.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) =>
      option.setName("usuario").setDescription("Usuario para banir").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("motivo").setDescription("Motivo do banimento").setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Aplica timeout em um membro.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName("usuario").setDescription("Usuario para mutar").setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("minutos")
        .setDescription("Tempo em minutos")
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("motivo").setDescription("Motivo do mute").setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Remove timeout de um membro.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName("usuario").setDescription("Usuario para desmutar").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("addcrewaccount")
    .setDescription("Adicionar conta para gerenciar membros da crew")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option.setName("conta").setDescription("Nome ou ID da conta").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("addmemberaccount")
    .setDescription("Adicionar membro na conta")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option.setName("conta").setDescription("Conta da crew").setRequired(true),
    )
    .addUserOption((option) =>
      option.setName("membro").setDescription("Membro do Discord").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("addroleallmembers")
    .setDescription("Adiciona um cargo a todos os membros do servidor (ignora bots)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addRoleOption((option) =>
      option.setName("cargo").setDescription("Cargo para adicionar").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("botservers")
    .setDescription("Mostra em quais servidores o bot esta")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("checklevel")
    .setDescription("Mostra suas estatisticas de mensagens no servidor")
    .addUserOption((option) =>
      option.setName("usuario").setDescription("Usuario opcional").setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("closeregisteruser")
    .setDescription("Finaliza o chat de registro do usuario")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder()
    .setName("findlink")
    .setDescription("Displays one of your invite links")
    .addUserOption((option) =>
      option.setName("usuario").setDescription("Dono do convite").setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("findmember")
    .setDescription("Buscar membro registrado na crew")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("discord")
        .setDescription("Buscar selecionando um membro do Discord")
        .addUserOption((option) =>
          option.setName("usuario").setDescription("Membro do Discord").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("roblox")
        .setDescription("Buscar pelo username do Roblox")
        .addStringOption((option) =>
          option.setName("username").setDescription("Username do Roblox").setRequired(true),
        ),
    ),
  new SlashCommandBuilder()
    .setName("forceupdatefruitstock")
    .setDescription("Exibe o catalogo atualizado de frutas do Blox Fruits.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("fruitvalue")
    .setDescription("Mostra o valor de uma fruta do Blox Fruits")
    .addStringOption((option) =>
      option.setName("fruta").setDescription("Nome da fruta").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("guildaccess")
    .setDescription("Gera acesso para o dono do bot entrar em uma guild")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("guildbanuser")
    .setDescription("Comando para banir todos os membros do servidor")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("invitecodes")
    .setDescription("Displays all of your invite codes in descending order")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("invitedlist")
    .setDescription("Displays a list of users invited via a member or invite link")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((option) =>
      option.setName("usuario").setDescription("Dono dos convites").setRequired(false),
    )
    .addStringOption((option) =>
      option.setName("codigo").setDescription("Codigo do convite").setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("inviter")
    .setDescription("Displays who invited the specified member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((option) =>
      option.setName("usuario").setDescription("Membro para consultar").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("invites")
    .setDescription("Displays the number of invites you or the specified member has")
    .addUserOption((option) =>
      option.setName("usuario").setDescription("Usuario opcional").setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("rankxp")
    .setDescription("Mostra o ranking de XP do servidor"),
  new SlashCommandBuilder()
    .setName("registercrew")
    .setDescription("Registra uma nova crew")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option.setName("nome").setDescription("Nome da crew").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("registermember")
    .setDescription("Registra um membro na crew")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((option) =>
      option.setName("membro").setDescription("Membro do Discord").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("roblox").setDescription("Username do Roblox").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("removecrewaccount")
    .setDescription("Remove uma conta da base de dados")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option.setName("conta").setDescription("Nome ou ID da conta").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("removeentecrew")
    .setDescription("Remove o cargo ENTER CREW de todos que ja sao membros da crew")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder()
    .setName("removefromcrew")
    .setDescription("Remover membro da crew")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("discord")
        .setDescription("Remover membro selecionando pelo Discord")
        .addUserOption((option) =>
          option.setName("usuario").setDescription("Membro do Discord").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("roblox")
        .setDescription("Remover membro pelo username do Roblox")
        .addStringOption((option) =>
          option.setName("username").setDescription("Username do Roblox").setRequired(true),
        ),
    ),
  new SlashCommandBuilder()
    .setName("removememberaccount")
    .setDescription("Remover membro da conta")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option.setName("conta").setDescription("Conta da crew").setRequired(true),
    )
    .addUserOption((option) =>
      option.setName("membro").setDescription("Membro do Discord").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("removepregister")
    .setDescription("Remove o pre-registro de um usuario")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((option) =>
      option.setName("usuario").setDescription("Usuario para remover").setRequired(true),
    ),
].map((command) => command.toJSON());

client.once(Events.ClientReady, async () => {
  console.log(`[OK] Logado como ${client.user.tag}`);

  if (config.registerCommands) {
    await registerSlashCommands();
  }

  startPresenceRotation();
  await cacheAllGuildInvites();
  ensureStockSchedulerStarted();
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
      return;
    }

    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }

    if (interaction.isUserSelectMenu()) {
      await handleUserSelect(interaction);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      await handleStringSelect(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleModal(interaction);
    }
  } catch (error) {
    if (isUnknownInteractionError(error)) {
      console.warn("[INTERACTION] Interacao expirada/ja encerrada pelo Discord. Ignorando.");
      return;
    }
    console.error(error);
    await sendInteractionError(interaction, error);
  }
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  if (oldMember.premiumSince || !newMember.premiumSince) return;
  const channel = await resolveChannel(newMember.guild, config.boostChannelId || newMember.guild.systemChannelId);
  if (!channel) return;

  const embed = baseEmbed(newMember.guild)
    .setTitle(`Server Boosted! ${emo(newMember.guild, "boost")}`)
    .setDescription(`Obrigado, ${newMember}! Seu acesso premium esta sendo processado.`)
    .setThumbnail(newMember.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "Booster", value: `${newMember}`, inline: true },
      { name: "Display Name", value: newMember.displayName, inline: true },
      { name: "Boost desde", value: `<t:${Math.floor(newMember.premiumSinceTimestamp / 1000)}:f>` },
    );

  await channel.send({ embeds: [embed] }).catch(() => {});
});

client.on(Events.MessageCreate, (message) => {
  trackMessageXp(message);
  guardMessage(message).catch((error) => console.warn(`[GUARD] ${error.message}`));
});

client.on(Events.MessageDelete, async (message) => {
  if (!message.guild || message.author?.bot) return;
  await sendAuditLog(message.guild, {
    title: "Auditoria: mensagem apagada",
    color: 0xffc857,
    fields: [
      ["Autor", message.author ? `${message.author} (\`${message.author.id}\`)` : "Nao informado"],
      ["Canal", `${message.channel}`],
      ["Conteudo", safeField(message.content || "Sem texto/cache")],
    ],
  });
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (!newMessage.guild || newMessage.author?.bot) return;
  if ((oldMessage.content || "") === (newMessage.content || "")) return;
  await sendAuditLog(newMessage.guild, {
    title: "Auditoria: mensagem editada",
    color: 0x7b2cff,
    fields: [
      ["Autor", `${newMessage.author} (\`${newMessage.author.id}\`)`],
      ["Canal", `${newMessage.channel}`],
      ["Antes", safeField(oldMessage.content || "Sem cache")],
      ["Depois", safeField(newMessage.content || "Sem texto")],
    ],
  });
});

client.on(Events.GuildMemberAdd, async (member) => {
  await trackMemberInvite(member);
  await sendWelcomeMessage(member);
});

client.on(Events.GuildCreate, async (guild) => {
  if (!config.registerCommands) return;
  await registerSlashCommandsForGuild(guild.id).catch((error) => {
    console.warn(`[WARN] Nao consegui registrar comandos em ${guild.name}: ${error.message}`);
  });
});

client.on(Events.ThreadDelete, (thread) => {
  if (!thread.guildId) return;
  clearOpenTicketRecord(thread.guildId, "", thread.id);
});

client.on(Events.ThreadUpdate, (oldThread, newThread) => {
  if (!oldThread.archived && newThread.archived && newThread.guildId) {
    clearOpenTicketRecord(newThread.guildId, "", newThread.id);
  }
});

async function handleCommand(interaction) {
  const command = interaction.commandName;

  if (EXTRA_COMMANDS.has(command)) {
    await handleExtraCommand(interaction);
    return;
  }

  if (command === "setup-recrutamento") {
    const targetChannelId = getApplicationTargetFromCommand(interaction);
    if (!(await ensureApplicationTarget(interaction, targetChannelId))) return;
    const roles = getApplicationRolesFromCommand(interaction);
    const recruitmentCategoryId = getRecruitmentCategoryFromCommand(interaction);
    const bannerUrl = getBannerUrlFromCommand(interaction);
    await interaction.reply({
      embeds: [recruitmentEmbed(interaction.guild, bannerUrl)],
      components: [recruitmentButtons(targetChannelId, interaction.guild, roles, recruitmentCategoryId)],
    });
    return;
  }

  if (command === "recrutamento") {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "setup") {
      await setupRecruitmentPanel(interaction);
      return;
    }
  }

  if (command === "central") {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "embed") {
      await sendCustomCentralEmbed(interaction);
      return;
    }
  }

  if (command === "torneio") {
    await handleTournamentCommand(interaction);
    return;
  }

  if (command === "evento") {
    await handleEventCommand(interaction);
    return;
  }

  if (command === "pvp") {
    await handlePvpCommand(interaction);
    return;
  }

  if (command === "auditoria") {
    await handleAuditCommand(interaction);
    return;
  }

  if (command === "regras") {
    await handleRulesCommand(interaction);
    return;
  }

  if (command === "sugestao") {
    await handleSuggestionCommand(interaction);
    return;
  }

  if (command === "anuncio") {
    await handleAnnouncementCommand(interaction);
    return;
  }

  if (command === "warn") {
    await handleWarnCommand(interaction);
    return;
  }

  if (command === "meta") {
    await handleGoalCommand(interaction);
    return;
  }

  if (command === "presenca") {
    await handlePresenceCommand(interaction);
    return;
  }

  if (command === "plantao") {
    await handleShiftCommand(interaction);
    return;
  }

  if (command === "blacklist") {
    await handleBlacklistCommand(interaction);
    return;
  }

  if (command === "votacao") {
    await handlePollCommand(interaction);
    return;
  }

  if (command === "perfil") {
    await handleProfileCommand(interaction);
    return;
  }

  if (command === "relatorio") {
    await handleReportCommand(interaction);
    return;
  }

  if (command === "boasvindas") {
    await handleWelcomeCommand(interaction);
    return;
  }

  if (command === "verificacao") {
    await handleVerificationCommand(interaction);
    return;
  }

  if (command === "strike") {
    await handleStrikeCommand(interaction);
    return;
  }

  if (command === "crewstatus") {
    await handleCrewStatusCommand(interaction);
    return;
  }

  if (command === "setup-staff" || command === "embed-staff") {
    const targetChannelId = getApplicationTargetFromCommand(interaction);
    if (!(await ensureApplicationTarget(interaction, targetChannelId))) return;
    const approvedRoleId = getApprovedRoleFromCommand(interaction, config.staffRoleId);
    const bannerUrl = getBannerUrlFromCommand(interaction);
    await interaction.reply({
      embeds: [staffEmbed(interaction.guild, bannerUrl)],
      components: [new ActionRowBuilder().addComponents(button(buildApplyCustomId("apply_staff", targetChannelId, approvedRoleId), "Aplicar para Staff", ButtonStyle.Primary, "staff", interaction.guild))],
    });
    return;
  }

  if (command === "setup-capitao" || command === "embed-capitao") {
    const targetChannelId = getApplicationTargetFromCommand(interaction);
    if (!(await ensureApplicationTarget(interaction, targetChannelId))) return;
    const approvedRoleId = getApprovedRoleFromCommand(interaction, config.captainRoleId);
    const bannerUrl = getBannerUrlFromCommand(interaction);
    await interaction.reply({
      embeds: [captainEmbed(interaction.guild, bannerUrl)],
      components: [new ActionRowBuilder().addComponents(button(buildApplyCustomId("apply_captain", targetChannelId, approvedRoleId), "Registrar para Capitao", ButtonStyle.Success, "pirate", interaction.guild))],
    });
    return;
  }

  if (command === "setup-servicos") {
    const bannerUrl = getBannerUrlFromCommand(interaction);
    await interaction.reply({
      embeds: [servicesEmbed(interaction.guild, bannerUrl)],
      components: [servicesButtons(interaction.guild)],
    });
    return;
  }

  if (command === "centralticket") {
    await setupTicketCenter(interaction);
    return;
  }

  if (command === "setup-stock") {
    if (!(await safeDeferReply(interaction, { flags: EPHEMERAL }))) return;
    const targetChannel = interaction.options.getChannel("canal_stock", false) || interaction.channel;
    if (!(await ensureStockTarget(interaction, targetChannel))) return;
    const stock = await fetchStock({ force: true });
    const store = guildData(interaction.guildId);
    store.stockChannelId = targetChannel.id;
    const messages = await upsertStockMessages(targetChannel, store, stock, ["normal", "mirage"]);
    scheduleDataSave();
    updateLastStockHashes(stock, ["normal", "mirage"]);
    ensureStockSchedulerStarted(false);
    await safeEditReply(interaction, `Stock configurado em ${targetChannel}. A partir de agora eu mando uma nova imagem a cada atualizacao: Normal ${messages.normal?.url || "sem dados"} | Mirage ${messages.mirage?.url || "sem dados"}.`);
    return;
  }

  if (command === "roblox") {
    await interaction.deferReply();
    const username = interaction.options.getString("nome", true);
    const roblox = await getRobloxProfile(username);
    if (!roblox) {
      await interaction.editReply(`Nao achei nenhum usuario Roblox chamado \`${username}\`.`);
      return;
    }
    await interaction.editReply({ embeds: [robloxEmbed(roblox)] });
    return;
  }

  if (command === "stock") {
    if (!(await safeDeferReply(interaction))) return;
    const stock = await fetchStock({ force: true });
    await safeEditReply(interaction, await stockMessagePayload(stock, interaction.guild));
    return;
  }

  if (command === "combo") {
    await handleComboCommand(interaction);
    return;
  }

  if (command === "api-status") {
    await interaction.deferReply({ flags: EPHEMERAL });
    const status = await getApiStatus();
    await safeEditReply(interaction, { embeds: [apiStatusEmbed(status, interaction.guild)] });
    return;
  }

  if (command === "ping") {
    await interaction.reply({
      embeds: [baseEmbed(interaction.guild)
        .setTitle(`${emo(interaction.guild, "ping")} Pong`)
        .setDescription(`WebSocket: **${client.ws.ping}ms**\nResposta: **${Date.now() - interaction.createdTimestamp}ms**`)],
      flags: EPHEMERAL,
    });
    return;
  }

  if (command === "avatar") {
    const user = interaction.options.getUser("usuario") || interaction.user;
    await interaction.reply({
      embeds: [baseEmbed(interaction.guild)
        .setTitle(`${emo(interaction.guild, "member")} Avatar de ${user.username}`)
        .setImage(user.displayAvatarURL({ size: 1024, extension: "png" }))],
    });
    return;
  }

  if (command === "serverinfo") {
    await interaction.reply({ embeds: [serverInfoEmbed(interaction.guild)] });
    return;
  }

  if (command === "limpar") {
    await clearMessages(interaction);
    return;
  }

  if (command === "nuke") {
    await nukeChannel(interaction);
    return;
  }

  if (command === "precos") {
    await interaction.reply({ embeds: [servicesEmbed(interaction.guild)] });
    return;
  }

  if (command === "lock") {
    const reason = interaction.options.getString("motivo") || "Sem motivo informado";
    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
      SendMessages: false,
    });
    await interaction.reply({ embeds: [baseEmbed().setTitle("Canal travado").setDescription(`Motivo: ${reason}`)] });
    return;
  }

  if (command === "unlock") {
    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
      SendMessages: null,
    });
    await interaction.reply({ embeds: [baseEmbed().setTitle("Canal destravado").setDescription("Os membros podem falar novamente.")] });
    return;
  }

  if (command === "ban") {
    const user = interaction.options.getUser("usuario", true);
    const reason = interaction.options.getString("motivo") || "Sem motivo informado";
    await interaction.guild.members.ban(user.id, { reason });
    await interaction.reply({ embeds: [baseEmbed().setTitle("Usuario banido").setDescription(`${user} foi banido.\nMotivo: ${reason}`)] });
    return;
  }

  if (command === "mute") {
    const user = interaction.options.getUser("usuario", true);
    const minutes = interaction.options.getInteger("minutos", true);
    const reason = interaction.options.getString("motivo") || "Sem motivo informado";
    const member = await interaction.guild.members.fetch(user.id);
    await member.timeout(minutes * 60 * 1000, reason);
    await interaction.reply({ embeds: [baseEmbed().setTitle("Usuario mutado").setDescription(`${member} recebeu timeout por ${minutes} minuto(s).\nMotivo: ${reason}`)] });
    return;
  }

  if (command === "unmute") {
    const user = interaction.options.getUser("usuario", true);
    const member = await interaction.guild.members.fetch(user.id);
    await member.timeout(null, "Timeout removido");
    await interaction.reply({ embeds: [baseEmbed().setTitle("Mute removido").setDescription(`${member} pode falar novamente.`)] });
  }
}

async function setupRecruitmentPanel(interaction) {
  const category = interaction.options.getChannel("categoria", true);
  const panelChannel = interaction.options.getChannel("canal_painel", false) || interaction.channel;
  const targetChannel = interaction.options.getChannel("canal_aplicacoes", false);
  const role = interaction.options.getRole("cargo_membro", false);
  const bannerUrl = getBannerUrlFromCommand(interaction);

  if (!(await ensurePanelTarget(interaction, panelChannel))) return;
  if (!(await ensureRecruitmentCategory(interaction, category))) return;
  if (targetChannel && !(await ensureApplicationTarget(interaction, targetChannel.id))) return;

  const roles = {
    staffRoleId: config.staffRoleId,
    captainRoleId: config.captainRoleId,
    memberRoleId: role?.id || config.memberRoleId || "",
  };

  await panelChannel.send({
    embeds: [recruitmentEmbed(interaction.guild, bannerUrl)],
    components: [recruitmentButtons(targetChannel?.id || "default", interaction.guild, roles, category.id)],
  });

  await interaction.reply(hidden({
    content: `Painel de recrutamento enviado em ${panelChannel}. Cada formulario vai criar um canal em **${category.name}**.`,
  }));
}

async function sendCustomCentralEmbed(interaction) {
  const channel = interaction.options.getChannel("canal", true);
  if (!(await ensurePanelTarget(interaction, channel))) return;

  const title = safeField(interaction.options.getString("titulo", true)).slice(0, 256);
  const description = safeField(interaction.options.getString("descricao", true)).slice(0, 4000);
  const footer = interaction.options.getString("rodape", false);
  const color = parseOptionalColor(interaction.options.getString("cor", false));
  const imageUrl = safeImageUrl(interaction.options.getString("imagem_url", false));
  const thumbnailUrl = safeImageUrl(interaction.options.getString("thumbnail_url", false));

  const embed = baseEmbed(interaction.guild)
    .setTitle(title)
    .setDescription(description)
    .setColor(color ?? config.color)
    .setTimestamp();

  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  if (imageUrl) embed.setImage(imageUrl);
  if (footer) embed.setFooter({ text: safeField(footer).slice(0, 2048), iconURL: config.logoUrl || interaction.guild?.iconURL({ size: 64 }) || undefined });

  await channel.send({ embeds: [embed] });
  await interaction.reply(hidden({ content: `Embed enviada em ${channel}.` }));
}

async function handleTournamentCommand(interaction) {
  const player = interaction.options.getUser("jogador", true);
  const bounty = interaction.options.getString("bounty", true);
  const platform = interaction.options.getString("plataforma", true);
  const channel = interaction.options.getChannel("canal", false) || interaction.channel;
  const imageUrl = safeImageUrl(interaction.options.getString("imagem_url", false));
  if (!(await ensurePanelTarget(interaction, channel))) return;

  const embed = eventStyleEmbed(interaction.guild, 0x8b3dff)
    .setTitle("⚔️ Novo Participante no Torneio PVP!")
    .setDescription([
      `👤 **${player.username}** confirmou presenca!`,
      `💀 **Bounty:** ${safeField(bounty)}`,
      `🎮 **Plataforma:** ${safeField(platform)}`,
    ].join("\n"))
    .setThumbnail(player.displayAvatarURL({ size: 256 }))
    .setFooter({ text: `${config.brandName} • Boa sorte no torneio! • ${formatDateTime()}` });
  if (imageUrl) embed.setImage(imageUrl);

  await channel.send({ embeds: [embed] });
  await sendAuditLog(interaction.guild, {
    title: "⚔️ Auditoria: participante confirmado",
    color: 0x8b3dff,
    fields: [
      ["Responsavel", `${interaction.user} (\`${interaction.user.id}\`)`],
      ["Jogador", `${player} (\`${player.id}\`)`],
      ["Canal", `${channel}`],
      ["Bounty / Plataforma", `${safeField(bounty)} / ${safeField(platform)}`],
    ],
  });
  await interaction.reply(hidden({ content: `Participante confirmado em ${channel}.` }));
}

async function handleEventCommand(interaction) {
  const player = interaction.options.getUser("jogador", true);
  const eventName = interaction.options.getString("nome", true);
  const points = interaction.options.getInteger("pontos", true);
  const channel = interaction.options.getChannel("canal", false) || interaction.channel;
  const imageUrl = safeImageUrl(interaction.options.getString("imagem_url", false));
  if (!(await ensurePanelTarget(interaction, channel))) return;

  const embed = eventStyleEmbed(interaction.guild, 0x00ff85)
    .setTitle("🏆 EVENTO CONFIRMADO")
    .setDescription([
      `👤 **Player:** ${player}`,
      `📌 **Evento:** ${safeField(eventName)}`,
      `⭐ **Pontos:** ${points} pts`,
    ].join("\n"))
    .setThumbnail(player.displayAvatarURL({ size: 256 }))
    .setFooter({ text: `${config.brandName} • Eventos • Hoje as ${formatClock()}` });
  if (imageUrl) embed.setImage(imageUrl);

  await channel.send({ embeds: [embed] });
  await sendAuditLog(interaction.guild, {
    title: "🏆 Auditoria: evento confirmado",
    color: 0x00ff85,
    fields: [
      ["Responsavel", `${interaction.user} (\`${interaction.user.id}\`)`],
      ["Player", `${player} (\`${player.id}\`)`],
      ["Evento", safeField(eventName)],
      ["Pontos", `${points} pts`],
      ["Canal", `${channel}`],
    ],
  });
  await interaction.reply(hidden({ content: `Evento confirmado em ${channel}.` }));
}

async function handlePvpCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "resultado") {
    const winner = interaction.options.getUser("vencedor", true);
    const loser = interaction.options.getUser("perdedor", true);
    const note = interaction.options.getString("observacao") || "Sem observacao";
    const store = guildData(interaction.guildId);
    const win = pvpRecord(store, winner.id);
    const lose = pvpRecord(store, loser.id);
    win.wins += 1;
    win.streak += 1;
    lose.losses += 1;
    lose.streak = 0;
    store.pvp.history.push({ winnerId: winner.id, loserId: loser.id, note, by: interaction.user.id, at: Date.now() });
    store.pvp.history = store.pvp.history.slice(-100);
    scheduleDataSave();
    await interaction.reply({ embeds: [baseEmbed(interaction.guild)
      .setTitle("Resultado PVP registrado")
      .setDescription(`${winner} venceu ${loser}.\n${safeField(note)}`)
      .addFields({ name: "Streak", value: `${winner}: **${win.streak}**`, inline: false })] });
    return;
  }
  if (sub === "ranking") {
    const store = guildData(interaction.guildId);
    const lines = Object.entries(store.pvp.players)
      .map(([userId, record]) => ({ userId, ...record, score: (record.wins || 0) * 3 - (record.losses || 0) }))
      .sort((a, b) => b.score - a.score || b.wins - a.wins)
      .slice(0, 10)
      .map((item, index) => `**${index + 1}.** <@${item.userId}> - ${item.wins || 0}W/${item.losses || 0}L | streak ${item.streak || 0}`);
    await interaction.reply({ embeds: [baseEmbed(interaction.guild).setTitle("Ranking PVP").setDescription(lines.length ? lines.join("\n") : "Sem resultados PVP ainda.")] });
    return;
  }

  const playerOne = interaction.options.getUser("jogador1", true);
  const playerTwo = interaction.options.getUser("jogador2", true);
  const date = interaction.options.getString("data", true);
  const hour = interaction.options.getString("hora", true);
  const channel = interaction.options.getChannel("canal", false) || interaction.channel;
  const imageUrl = safeImageUrl(interaction.options.getString("imagem_url", false));
  if (!(await ensurePanelTarget(interaction, channel))) return;

  const embed = eventStyleEmbed(interaction.guild, 0x7b2cff)
    .setTitle("⚔️ DUELO PVP MARCADO")
    .setDescription([
      `👤 ${playerOne} **(${playerOne.username})**`,
      `👤 ${playerTwo} **(${playerTwo.username})**`,
      "",
      `📅 **Data:** ${safeField(date)}`,
      `⏰ **Hora:** ${safeField(hour)}`,
    ].join("\n"))
    .setFooter({ text: `${config.brandName} • Arena PVP • ${formatDateTime()}` });
  if (imageUrl) embed.setImage(imageUrl);

  await channel.send({ embeds: [embed] });
  await sendAuditLog(interaction.guild, {
    title: "⚔️ Auditoria: duelo PVP marcado",
    color: 0x7b2cff,
    fields: [
      ["Responsavel", `${interaction.user} (\`${interaction.user.id}\`)`],
      ["Jogadores", `${playerOne} vs ${playerTwo}`],
      ["Data/Hora", `${safeField(date)} as ${safeField(hour)}`],
      ["Canal", `${channel}`],
    ],
  });
  await interaction.reply(hidden({ content: `Duelo PVP marcado em ${channel}.` }));
}

async function handleAuditCommand(interaction) {
  const channel = interaction.options.getChannel("canal", true);
  if (!(await ensurePanelTarget(interaction, channel))) return;

  const store = guildData(interaction.guildId);
  store.auditLogChannelId = channel.id;
  scheduleDataSave();

  await channel.send({
    embeds: [eventStyleEmbed(interaction.guild, 0x7b2cff)
      .setTitle("📚 AUDITORIA ATIVADA")
      .setDescription([
        `👤 **Responsavel:** ${interaction.user}`,
        `📌 **Canal:** ${channel}`,
        "✅ Recrutamento, aprovacoes, recusas, eventos, torneios e PVP serao registrados aqui.",
      ].join("\n"))
      .setFooter({ text: `${config.brandName} • Auditoria • ${formatDateTime()}` })],
  });
  await interaction.reply(hidden({ content: `Auditoria configurada em ${channel}.` }));
}

async function handleRulesCommand(interaction) {
  const channel = interaction.options.getChannel("canal", true);
  if (!(await ensurePanelTarget(interaction, channel))) return;

  const title = interaction.options.getString("titulo") || `Regras da ${config.brandName}`;
  const text = interaction.options.getString("texto") || [
    "1. Respeite todos os membros da crew.",
    "2. Nao divulgue links, spam ou conteudo ofensivo.",
    "3. Siga as orientacoes da staff em eventos, PVP e recrutamento.",
    "4. Evite brigas, provocacoes pesadas e flood nos canais.",
    "5. Qualquer tentativa de golpe, toxidade ou abuso pode gerar punicao.",
  ].join("\n");
  const imageUrl = interaction.options.getString("imagem_url") || config.bannerUrl;

  const embed = baseEmbed(interaction.guild)
    .setTitle(title)
    .setDescription(text)
    .setColor(0x7b2cff)
    .setTimestamp();
  if (imageUrl) embed.setImage(imageUrl);

  await channel.send({ embeds: [embed] });
  await sendAuditLog(interaction.guild, {
    title: "Auditoria: regras publicadas",
    color: 0x7b2cff,
    fields: [
      ["Responsavel", `${interaction.user} (\`${interaction.user.id}\`)`],
      ["Canal", `${channel}`],
    ],
  });
  await interaction.reply(hidden({ content: `Painel de regras enviado em ${channel}.` }));
}

async function handleSuggestionCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const store = guildData(interaction.guildId);

  if (subcommand === "setup") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply(hidden({ content: "So administradores podem configurar o canal de sugestoes." }));
      return;
    }
    const channel = interaction.options.getChannel("canal", true);
    if (!(await ensurePanelTarget(interaction, channel))) return;
    store.suggestionChannelId = channel.id;
    scheduleDataSave();
    await channel.send({
      embeds: [baseEmbed(interaction.guild)
        .setTitle("Central de Sugestoes")
        .setDescription("As ideias enviadas pela crew aparecem aqui para a equipe avaliar e a comunidade votar.")
        .setColor(0x00ff85)],
    });
    await interaction.reply(hidden({ content: `Canal de sugestoes configurado em ${channel}.` }));
    return;
  }

  const channel = await resolveChannel(interaction.guild, store.suggestionChannelId) || interaction.channel;
  if (!(await ensurePanelTarget(interaction, channel))) return;
  const text = interaction.options.getString("texto", true);
  const imageUrl = interaction.options.getString("imagem_url") || "";
  const embed = baseEmbed(interaction.guild)
    .setTitle("Nova Sugestao")
    .setDescription(text)
    .setColor(0x00ff85)
    .addFields({ name: "Autor", value: `${interaction.user} (\`${interaction.user.id}\`)` })
    .setTimestamp();
  if (imageUrl) embed.setImage(imageUrl);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("suggestion_vote:up").setLabel("Aprovar").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("suggestion_vote:down").setLabel("Reprovar").setStyle(ButtonStyle.Danger),
  );
  await channel.send({ embeds: [embed], components: [row] });
  await sendAuditLog(interaction.guild, {
    title: "Auditoria: sugestao enviada",
    color: 0x00ff85,
    fields: [
      ["Autor", `${interaction.user} (\`${interaction.user.id}\`)`],
      ["Canal", `${channel}`],
      ["Sugestao", text],
    ],
  });
  await interaction.reply(hidden({ content: `Sugestao enviada em ${channel}.` }));
}

async function handleAnnouncementCommand(interaction) {
  const channel = interaction.options.getChannel("canal", true);
  if (!(await ensurePanelTarget(interaction, channel))) return;

  const title = interaction.options.getString("titulo", true);
  const text = interaction.options.getString("texto", true);
  const imageUrl = interaction.options.getString("imagem_url") || "";
  const pingRole = interaction.options.getRole("cargo_ping", false);
  const embed = eventStyleEmbed(interaction.guild, 0x7b2cff)
    .setTitle(title)
    .setDescription(text)
    .setFooter({ text: `${config.brandName} • Anuncio • ${formatDateTime()}` });
  if (imageUrl) embed.setImage(imageUrl);

  await channel.send({
    content: pingRole ? `${pingRole}` : undefined,
    embeds: [embed],
    allowedMentions: pingRole ? { roles: [pingRole.id] } : { parse: [] },
  });
  await sendAuditLog(interaction.guild, {
    title: "Auditoria: anuncio publicado",
    color: 0x7b2cff,
    fields: [
      ["Responsavel", `${interaction.user} (\`${interaction.user.id}\`)`],
      ["Canal", `${channel}`],
      ["Titulo", title],
    ],
  });
  await interaction.reply(hidden({ content: `Anuncio enviado em ${channel}.` }));
}

async function handleWarnCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const user = interaction.options.getUser("usuario", true);
  const store = guildData(interaction.guildId);
  store.warns[user.id] ||= [];

  if (subcommand === "add") {
    const reason = interaction.options.getString("motivo", true);
    const record = {
      reason,
      moderatorId: interaction.user.id,
      createdAt: Date.now(),
    };
    store.warns[user.id].push(record);
    scheduleDataSave();
    await sendAuditLog(interaction.guild, {
      title: "Auditoria: aviso aplicado",
      color: 0xffc857,
      fields: [
        ["Moderador", `${interaction.user} (\`${interaction.user.id}\`)`],
        ["Membro", `${user} (\`${user.id}\`)`],
        ["Total", String(store.warns[user.id].length)],
        ["Motivo", reason],
      ],
    });
    await interaction.reply(hidden({ content: `${user} recebeu um aviso. Total: **${store.warns[user.id].length}**.` }));
    return;
  }

  if (subcommand === "limpar") {
    const total = store.warns[user.id].length;
    store.warns[user.id] = [];
    scheduleDataSave();
    await sendAuditLog(interaction.guild, {
      title: "Auditoria: avisos limpos",
      color: 0x00ff85,
      fields: [
        ["Moderador", `${interaction.user} (\`${interaction.user.id}\`)`],
        ["Membro", `${user} (\`${user.id}\`)`],
        ["Avisos removidos", String(total)],
      ],
    });
    await interaction.reply(hidden({ content: `Avisos de ${user} limpos. Removidos: **${total}**.` }));
    return;
  }

  const lines = store.warns[user.id]
    .map((warn, index) => `**${index + 1}.** ${safeField(warn.reason, 260)}\nStaff: <@${warn.moderatorId}> • <t:${Math.floor(warn.createdAt / 1000)}:R>`)
    .slice(-10);
  await interaction.reply(hidden({
    embeds: [baseEmbed(interaction.guild)
      .setTitle(`Avisos de ${user.username}`)
      .setDescription(lines.length ? lines.join("\n\n") : "Esse membro nao tem avisos salvos.")],
  }));
}

async function handleGoalCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  const store = guildData(interaction.guildId);
  if (sub === "criar") {
    const name = interaction.options.getString("nome", true).slice(0, 80);
    const target = interaction.options.getInteger("alvo", true);
    store.goals[normalizeKey(name)] = { name, target, current: 0, byUser: {}, createdBy: interaction.user.id, createdAt: Date.now() };
    scheduleDataSave();
    await interaction.reply({ embeds: [baseEmbed(interaction.guild).setTitle("Meta criada").setDescription(`**${name}**\nProgresso: **0/${target}**`)] });
    return;
  }
  if (sub === "progresso") {
    const key = normalizeKey(interaction.options.getString("nome", true));
    const goal = store.goals[key];
    if (!goal) return interaction.reply(hidden({ content: "Nao achei essa meta." }));
    const value = interaction.options.getInteger("valor", true);
    const user = interaction.options.getUser("membro") || interaction.user;
    goal.current = Math.min(goal.target, (goal.current || 0) + value);
    goal.byUser[user.id] = (goal.byUser[user.id] || 0) + value;
    scheduleDataSave();
    await interaction.reply({ embeds: [goalEmbed(interaction.guild, goal)] });
    return;
  }
  const goals = Object.values(store.goals).slice(-10);
  await interaction.reply({ embeds: [baseEmbed(interaction.guild).setTitle("Metas da crew").setDescription(goals.length ? goals.map((goal) => goalLine(goal)).join("\n") : "Nenhuma meta ativa.")] });
}

async function handlePresenceCommand(interaction) {
  const eventName = interaction.options.getString("evento", true).slice(0, 120);
  const date = interaction.options.getString("data", true).slice(0, 80);
  const channel = interaction.options.getChannel("canal", false) || interaction.channel;
  if (!(await ensurePanelTarget(interaction, channel))) return;
  const id = `${Date.now()}`;
  const store = guildData(interaction.guildId);
  store.presences[id] = { id, eventName, date, members: {}, createdBy: interaction.user.id, createdAt: Date.now() };
  scheduleDataSave();
  await channel.send({
    embeds: [presenceEmbed(interaction.guild, store.presences[id])],
    components: [new ActionRowBuilder().addComponents(button(`presence_join:${id}`, "Confirmar presença", ButtonStyle.Success, "approve", interaction.guild))],
  });
  await interaction.reply(hidden({ content: `Painel de presenca enviado em ${channel}.` }));
}

async function handleShiftCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  const store = guildData(interaction.guildId);
  if (sub === "abrir") {
    store.shifts[interaction.user.id] = { userId: interaction.user.id, since: Date.now() };
    scheduleDataSave();
    await interaction.reply({ embeds: [baseEmbed(interaction.guild).setTitle("Plantao aberto").setDescription(`${interaction.user} entrou em plantao.`)] });
    return;
  }
  if (sub === "fechar") {
    const existed = delete store.shifts[interaction.user.id];
    scheduleDataSave();
    await interaction.reply(hidden({ content: existed ? "Voce saiu do plantao." : "Voce nao estava em plantao." }));
    return;
  }
  const lines = Object.values(store.shifts).map((shift) => `<@${shift.userId}> desde <t:${Math.floor(shift.since / 1000)}:R>`);
  await interaction.reply({ embeds: [baseEmbed(interaction.guild).setTitle("Staff em plantao").setDescription(lines.length ? lines.join("\n") : "Ninguem em plantao agora.")] });
}

async function handleBlacklistCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  const store = guildData(interaction.guildId);
  const target = interaction.options.getString("alvo", false);
  const key = normalizeBlacklistKey(target);
  if (sub === "add") {
    const reason = interaction.options.getString("motivo", true);
    store.blacklist[key] = { target, reason, by: interaction.user.id, at: Date.now() };
    scheduleDataSave();
    await interaction.reply(hidden({ content: `Blacklist adicionada: **${target}**.` }));
    return;
  }
  if (sub === "remover") {
    const removed = delete store.blacklist[key];
    scheduleDataSave();
    await interaction.reply(hidden({ content: removed ? "Removido da blacklist." : "Nao achei esse alvo." }));
    return;
  }
  if (sub === "check") {
    const hit = store.blacklist[key];
    await interaction.reply(hidden({ content: hit ? `Encontrado: **${hit.target}**\nMotivo: ${hit.reason}\nPor: <@${hit.by}>` : "Nao esta na blacklist." }));
    return;
  }
  const lines = Object.values(store.blacklist).slice(-15).map((item) => `**${item.target}** - ${safeField(item.reason, 160)} (<@${item.by}>)`);
  await interaction.reply(hidden({ embeds: [baseEmbed(interaction.guild).setTitle("Blacklist interna").setDescription(lines.length ? lines.join("\n") : "Blacklist vazia.")] }));
}

async function handlePollCommand(interaction) {
  const title = interaction.options.getString("titulo", true).slice(0, 120);
  const description = interaction.options.getString("descricao", true);
  const channel = interaction.options.getChannel("canal", false) || interaction.channel;
  if (!(await ensurePanelTarget(interaction, channel))) return;
  const id = `${Date.now()}`;
  const store = guildData(interaction.guildId);
  store.polls[id] = { id, title, description, yes: {}, no: {}, createdBy: interaction.user.id, createdAt: Date.now() };
  scheduleDataSave();
  await channel.send({
    embeds: [pollEmbed(interaction.guild, store.polls[id])],
    components: [new ActionRowBuilder().addComponents(
      button(`poll_vote:${id}:yes`, "Aprovar", ButtonStyle.Success, "approve", interaction.guild),
      button(`poll_vote:${id}:no`, "Reprovar", ButtonStyle.Danger, "deny", interaction.guild),
    )],
  });
  await interaction.reply(hidden({ content: `Votacao enviada em ${channel}.` }));
}

async function handleProfileCommand(interaction) {
  const user = interaction.options.getUser("membro") || interaction.user;
  const store = guildData(interaction.guildId);
  const memberRecord = store.members[user.id];
  const pvp = store.pvp.players[user.id] || { wins: 0, losses: 0, streak: 0 };
  const warns = store.warns[user.id] || [];
  const strikes = store.strikes[user.id] || [];
  const presenceCount = Object.values(store.presences).filter((presence) => presence.members?.[user.id]).length;
  const blacklist = findBlacklistHit(interaction.guildId, [user.id, user.tag, memberRecord?.roblox].filter(Boolean));
  const embed = baseEmbed(interaction.guild)
    .setTitle(`Ficha de ${user.username}`)
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "Crew", value: memberRecord ? `Roblox: **${memberRecord.roblox || "N/A"}**` : "Nao registrado na base da crew.", inline: false },
      { name: "PVP", value: `${pvp.wins || 0}W/${pvp.losses || 0}L | streak ${pvp.streak || 0}`, inline: true },
      { name: "Presencas", value: String(presenceCount), inline: true },
      { name: "Warns", value: String(warns.length), inline: true },
      { name: "Strikes", value: String(strikes.length), inline: true },
      { name: "Blacklist", value: blacklist ? `Sim: ${safeField(blacklist.reason)}` : "Nao", inline: true },
    );
  await interaction.reply({ embeds: [embed] });
}

async function handleReportCommand(interaction) {
  const store = guildData(interaction.guildId);
  await interaction.reply({ embeds: [weeklyReportEmbed(interaction.guild, store)] });
}

async function handleWelcomeCommand(interaction) {
  const channel = interaction.options.getChannel("canal", true);
  if (!(await ensurePanelTarget(interaction, channel))) return;
  const store = guildData(interaction.guildId);
  store.welcome.channelId = channel.id;
  store.welcome.message = interaction.options.getString("mensagem") || "";
  store.welcome.imageUrl = safeImageUrl(interaction.options.getString("imagem_url", false)) || "";
  scheduleDataSave();
  await interaction.reply(hidden({ content: `Boas-vindas configuradas em ${channel}.` }));
}

async function handleVerificationCommand(interaction) {
  const channel = interaction.options.getChannel("canal", true);
  const role = interaction.options.getRole("cargo", true);
  const link = safeHttpUrl(interaction.options.getString("link", false)) || "";
  const imageUrl = safeImageUrl(interaction.options.getString("imagem_url", false)) || "";
  if (!(await ensurePanelTarget(interaction, channel))) return;
  const botMember = await interaction.guild.members.fetchMe().catch(() => null);
  if (!botMember?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply(hidden({ content: "Eu preciso da permissao Gerenciar cargos para liberar membros." }));
    return;
  }
  if (role.managed || botMember.roles.highest.comparePositionTo(role) <= 0) {
    await interaction.reply(hidden({ content: "Meu cargo precisa ficar acima do cargo de verificacao na lista de cargos." }));
    return;
  }

  const store = guildData(interaction.guildId);
  store.verification.roleId = role.id;
  store.verification.channelId = channel.id;
  store.verification.link = link;
  store.verification.imageUrl = imageUrl;
  scheduleDataSave();

  await channel.send({
    embeds: [verificationEmbed(interaction.guild, role, link, imageUrl)],
    components: [verificationButtons(interaction.guild, role.id, link)],
  });
  await interaction.reply(hidden({ content: `Painel de verificacao enviado em ${channel}. Cargo liberado: ${role}.` }));
}

async function verifyMember(interaction) {
  const [, roleId] = String(interaction.customId).split(":");
  const store = guildData(interaction.guildId);
  const targetRoleId = normalizeSnowflake(roleId) || store.verification.roleId;
  const role = targetRoleId ? interaction.guild.roles.cache.get(targetRoleId) : null;
  if (!role) {
    await interaction.reply(hidden({ content: "Cargo de verificacao nao encontrado. Peça para um admin recriar o painel." }));
    return;
  }
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await interaction.reply(hidden({ content: "Nao consegui localizar seu perfil no servidor." }));
    return;
  }
  if (member.roles.cache.has(role.id)) {
    await interaction.reply(hidden({ content: "Voce ja esta verificado e liberado no servidor." }));
    return;
  }
  const botMember = await interaction.guild.members.fetchMe().catch(() => null);
  if (!botMember?.permissions?.has(PermissionFlagsBits.ManageRoles) || role.managed || botMember.roles.highest.comparePositionTo(role) <= 0) {
    await interaction.reply(hidden({ content: "Nao consigo entregar esse cargo. A equipe precisa ajustar minhas permissoes/cargos." }));
    return;
  }
  await member.roles.add(role, `Verificacao concluida por ${interaction.user.tag}`);
  await sendAuditLog(interaction.guild, {
    title: "Auditoria: membro verificado",
    color: 0x00ff85,
    fields: [
      ["Membro", `${interaction.user} (\`${interaction.user.id}\`)`],
      ["Cargo liberado", `${role} (\`${role.id}\`)`],
    ],
  });
  await interaction.reply(hidden({ content: `Verificacao concluida. Voce recebeu ${role} e o servidor foi liberado.` }));
}

async function handleStrikeCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  const user = interaction.options.getUser("membro", true);
  const store = guildData(interaction.guildId);
  store.strikes[user.id] ||= [];
  if (sub === "add") {
    const reason = interaction.options.getString("motivo", true);
    store.strikes[user.id].push({ reason, moderatorId: interaction.user.id, createdAt: Date.now() });
    scheduleDataSave();
    const total = store.strikes[user.id].length;
    await sendAuditLog(interaction.guild, {
      title: total >= 3 ? "Auditoria: membro atingiu 3 strikes" : "Auditoria: strike aplicado",
      color: total >= 3 ? 0xff3b5c : 0xffc857,
      fields: [
        ["Moderador", `${interaction.user} (\`${interaction.user.id}\`)`],
        ["Membro", `${user} (\`${user.id}\`)`],
        ["Total", String(total)],
        ["Motivo", reason],
      ],
    });
    await interaction.reply(hidden({ content: `${user} recebeu strike. Total: **${total}**.` }));
    return;
  }
  if (sub === "limpar") {
    const total = store.strikes[user.id].length;
    store.strikes[user.id] = [];
    scheduleDataSave();
    await interaction.reply(hidden({ content: `Strikes de ${user} limpos. Removidos: **${total}**.` }));
    return;
  }
  const lines = store.strikes[user.id].map((strike, index) => `**${index + 1}.** ${safeField(strike.reason)} - <@${strike.moderatorId}>`).slice(-10);
  await interaction.reply(hidden({ embeds: [baseEmbed(interaction.guild).setTitle(`Strikes de ${user.username}`).setDescription(lines.length ? lines.join("\n") : "Sem strikes.")] }));
}

async function handleCrewStatusCommand(interaction) {
  const channel = interaction.options.getChannel("canal", false) || interaction.channel;
  if (!(await ensurePanelTarget(interaction, channel))) return;
  await channel.send({ embeds: [crewStatusEmbed(interaction.guild, guildData(interaction.guildId))] });
  await interaction.reply(hidden({ content: `Painel de status enviado em ${channel}.` }));
}

async function sendWelcomeMessage(member) {
  const store = guildData(member.guild.id);
  const channel = await resolveChannel(member.guild, store.welcome.channelId);
  if (!channel?.isTextBased?.()) return;
  const message = (store.welcome.message || "Bem-vindo(a), {user}! Leia as regras, conheca a crew e abra o recrutamento quando estiver pronto.")
    .replace(/\{user\}/gi, `${member}`)
    .replace(/\{server\}/gi, member.guild.name);
  const embed = baseEmbed(member.guild)
    .setTitle(`Bem-vindo a ${config.brandName}`)
    .setDescription(message)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "Membro", value: `${member}`, inline: true },
      { name: "Conta criada", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
      { name: "Entrada", value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true },
    )
    .setTimestamp();
  if (store.welcome.imageUrl) embed.setImage(store.welcome.imageUrl);
  await channel.send({ content: `${member}`, embeds: [embed], allowedMentions: { users: [member.id] } }).catch(() => {});
}

function weeklyReportEmbed(guild, store) {
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const presences = Object.values(store.presences || {}).filter((item) => (item.createdAt || 0) >= since);
  const pvpMatches = (store.pvp.history || []).filter((item) => (item.createdAt || 0) >= since);
  const warns = Object.values(store.warns || {}).flat().filter((item) => (item.createdAt || 0) >= since);
  const strikes = Object.values(store.strikes || {}).flat().filter((item) => (item.createdAt || 0) >= since);
  const openTickets = Object.keys(store.tickets.openByUser || {}).length;
  const goals = Object.values(store.goals || {}).filter((goal) => !goal.done);
  const topPvp = Object.entries(store.pvp.players || {})
    .sort(([, a], [, b]) => ((b.wins || 0) - (b.losses || 0)) - ((a.wins || 0) - (a.losses || 0)))
    .slice(0, 5)
    .map(([id, stats], index) => `${index + 1}. <@${id}> - ${stats.wins || 0}W/${stats.losses || 0}L`)
    .join("\n") || "Sem partidas registradas.";

  return baseEmbed(guild)
    .setTitle("Relatorio semanal da crew")
    .setDescription(`Resumo dos ultimos 7 dias em **${config.brandName}**.`)
    .addFields(
      { name: "Eventos e presencas", value: `Presencas criadas: **${presences.length}**\nDuelos PVP: **${pvpMatches.length}**`, inline: true },
      { name: "Moderacao", value: `Warns: **${warns.length}**\nStrikes: **${strikes.length}**`, inline: true },
      { name: "Operacao", value: `Tickets abertos: **${openTickets}**\nMetas ativas: **${goals.length}**`, inline: true },
      { name: "Top PVP", value: safeField(topPvp, 900), inline: false },
      { name: "Metas em andamento", value: safeField(goals.slice(0, 5).map(goalLine).join("\n") || "Nenhuma meta ativa.", 900), inline: false },
    )
    .setTimestamp();
}

function crewStatusEmbed(guild, store) {
  const activeShifts = Object.values(store.shifts || {}).filter((shift) => shift.startedAt && !shift.endedAt);
  const openTickets = Object.keys(store.tickets.openByUser || {}).length;
  const activeGoals = Object.values(store.goals || {}).filter((goal) => !goal.done).slice(0, 5);
  const latestPresence = Object.values(store.presences || {})
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  const topPvp = Object.entries(store.pvp.players || {})
    .sort(([, a], [, b]) => (b.wins || 0) - (a.wins || 0))
    .slice(0, 5)
    .map(([id, stats], index) => `${index + 1}. <@${id}> - ${stats.wins || 0} vitorias`)
    .join("\n") || "Sem ranking ainda.";

  return baseEmbed(guild)
    .setTitle(`Status da ${config.brandName}`)
    .setDescription("Painel rapido para acompanhar a operacao da crew.")
    .addFields(
      { name: "Servidor", value: `Membros: **${guild.memberCount || 0}**\nTickets abertos: **${openTickets}**`, inline: true },
      { name: "Plantao", value: activeShifts.length ? activeShifts.map((shift) => `<@${shift.userId}>`).slice(0, 8).join("\n") : "Ninguem em plantao.", inline: true },
      { name: "Ultima presenca", value: latestPresence ? `**${latestPresence.title}**\nConfirmados: **${Object.keys(latestPresence.members || {}).length}**` : "Nenhuma presenca criada.", inline: true },
      { name: "Metas ativas", value: safeField(activeGoals.map(goalLine).join("\n") || "Nenhuma meta ativa.", 900), inline: false },
      { name: "Top PVP", value: safeField(topPvp, 900), inline: false },
    )
    .setTimestamp();
}

async function handlePresenceButton(interaction) {
  const [, id] = String(interaction.customId).split(":");
  const store = guildData(interaction.guildId);
  const presence = store.presences[id];
  if (!presence) return interaction.reply(hidden({ content: "Essa presenca nao existe mais." }));
  presence.members[interaction.user.id] = { userId: interaction.user.id, at: Date.now() };
  scheduleDataSave();
  await interaction.message.edit({ embeds: [presenceEmbed(interaction.guild, presence)] }).catch(() => {});
  await interaction.reply(hidden({ content: "Presenca confirmada." }));
}

async function handlePollVote(interaction) {
  const [, , id, vote] = String(interaction.customId).split(":");
  const store = guildData(interaction.guildId);
  const poll = store.polls[id];
  if (!poll) return interaction.reply(hidden({ content: "Essa votacao nao existe mais." }));
  delete poll.yes[interaction.user.id];
  delete poll.no[interaction.user.id];
  poll[vote === "no" ? "no" : "yes"][interaction.user.id] = Date.now();
  scheduleDataSave();
  await interaction.message.edit({ embeds: [pollEmbed(interaction.guild, poll)] }).catch(() => {});
  await interaction.reply(hidden({ content: "Voto registrado." }));
}

async function handleSuggestionVote(interaction) {
  const [, vote] = String(interaction.customId).split(":");
  const emoji = vote === "up" ? "✅" : "❌";
  await interaction.message.react(emoji).catch(() => null);
  await interaction.reply(hidden({ content: `Voto registrado: ${vote === "up" ? "aprovar" : "reprovar"}.` }));
}

async function handleExtraCommand(interaction) {
  const command = interaction.commandName;

  if (command === "registercrew") {
    const name = interaction.options.getString("nome", true);
    const store = guildData(interaction.guildId);
    store.crew = {
      name: name.slice(0, 80),
      registeredBy: interaction.user.id,
      registeredAt: Date.now(),
    };
    scheduleDataSave();
    await interaction.reply(hidden({
      embeds: [baseEmbed(interaction.guild)
        .setTitle(`${emo(interaction.guild, "server")} Crew registrada`)
        .setDescription(`Crew **${store.crew.name}** registrada para este servidor.`)],
    }));
    return;
  }

  if (command === "registermember") {
    await interaction.deferReply({ flags: EPHEMERAL });
    const user = interaction.options.getUser("membro", true);
    const roblox = interaction.options.getString("roblox", true);
    const record = registerCrewMember(interaction.guildId, user, roblox, interaction.user.id);
    let roleMessage = "";

    if (config.memberRoleId) {
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (member) {
        await member.roles.add(config.memberRoleId).then(
          () => { roleMessage = "\nCargo de membro aplicado."; },
          () => { roleMessage = "\nNao consegui aplicar o cargo de membro. Confira hierarquia/permissoes."; },
        );
      }
    }

    scheduleDataSave();
    await interaction.editReply({
      embeds: [crewMemberEmbed(interaction.guild, record)
        .setTitle(`${emo(interaction.guild, "member")} Membro registrado`)
        .setDescription(`${user} foi registrado na crew.${roleMessage}`)],
    });
    return;
  }

  if (command === "addcrewaccount") {
    const account = interaction.options.getString("conta", true);
    const store = guildData(interaction.guildId);
    store.crewAccounts[normalizeKey(account)] = {
      name: account,
      addedBy: interaction.user.id,
      addedAt: Date.now(),
    };
    scheduleDataSave();
    await interaction.reply(hidden({ content: `Conta da crew adicionada: **${account}**.` }));
    return;
  }

  if (command === "removecrewaccount") {
    const account = interaction.options.getString("conta", true);
    const store = guildData(interaction.guildId);
    const removed = delete store.crewAccounts[normalizeKey(account)];
    scheduleDataSave();
    await interaction.reply(hidden({ content: removed ? `Conta removida: **${account}**.` : `Nao achei a conta **${account}** na base.` }));
    return;
  }

  if (command === "addmemberaccount") {
    const account = interaction.options.getString("conta", true);
    const user = interaction.options.getUser("membro", true);
    const store = guildData(interaction.guildId);
    const key = normalizeKey(account);
    store.memberAccounts[key] ||= { name: account, members: {}, addedAt: Date.now() };
    store.memberAccounts[key].members[user.id] = {
      userId: user.id,
      username: user.tag,
      addedBy: interaction.user.id,
      addedAt: Date.now(),
    };
    scheduleDataSave();
    await interaction.reply(hidden({ content: `${user} adicionado na conta **${account}**.` }));
    return;
  }

  if (command === "removememberaccount") {
    const account = interaction.options.getString("conta", true);
    const user = interaction.options.getUser("membro", true);
    const store = guildData(interaction.guildId);
    const memberAccount = store.memberAccounts[normalizeKey(account)];
    const removed = Boolean(memberAccount?.members?.[user.id]);
    if (removed) delete memberAccount.members[user.id];
    scheduleDataSave();
    await interaction.reply(hidden({ content: removed ? `${user} removido da conta **${account}**.` : `${user} nao estava na conta **${account}**.` }));
    return;
  }

  if (command === "findmember") {
    await handleFindMemberCommand(interaction);
    return;
  }

  if (command === "removefromcrew") {
    await handleRemoveFromCrewCommand(interaction);
    return;
  }

  if (command === "removepregister") {
    const user = interaction.options.getUser("usuario", true);
    const store = guildData(interaction.guildId);
    const removed = delete store.preregisters[user.id];
    scheduleDataSave();
    await interaction.reply(hidden({ content: removed ? `Pre-registro de ${user} removido.` : `${user} nao tinha pre-registro salvo.` }));
    return;
  }

  if (command === "removeentecrew") {
    await removeEnterCrewRole(interaction);
    return;
  }

  if (command === "addroleallmembers") {
    await addRoleAllMembers(interaction);
    return;
  }

  if (command === "closeregisteruser") {
    await closeRegisterChannel(interaction);
    return;
  }

  if (command === "botservers") {
    await showBotServers(interaction);
    return;
  }

  if (command === "checklevel") {
    await showLevel(interaction);
    return;
  }

  if (command === "rankxp") {
    await showXpRank(interaction);
    return;
  }

  if (command === "forceupdatefruitstock") {
    await forceUpdateFruitStock(interaction);
    return;
  }

  if (command === "fruitvalue") {
    await showFruitValue(interaction);
    return;
  }

  if (command === "guildaccess") {
    await createGuildAccess(interaction);
    return;
  }

  if (command === "guildbanuser") {
    await interaction.reply(hidden({
      embeds: [baseEmbed(interaction.guild)
        .setTitle(`${emo(interaction.guild, "warn")} Comando bloqueado`)
        .setDescription("Por seguranca, este bot nao executa banimento em massa. Use `/ban` para banir um usuario especifico.")],
    }));
    return;
  }

  if (command === "findlink") {
    await showInviteLink(interaction);
    return;
  }

  if (command === "invitecodes") {
    await showInviteCodes(interaction);
    return;
  }

  if (command === "invitedlist") {
    await showInvitedList(interaction);
    return;
  }

  if (command === "inviter") {
    await showInviter(interaction);
    return;
  }

  if (command === "invites") {
    await showInvites(interaction);
  }
}

async function handleFindMemberCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const store = guildData(interaction.guildId);
  let record = null;

  if (subcommand === "discord") {
    const user = interaction.options.getUser("usuario", true);
    record = store.members[user.id] || null;
  }

  if (subcommand === "roblox") {
    const username = interaction.options.getString("username", true);
    record = Object.values(store.members).find((item) => normalizeKey(item.roblox) === normalizeKey(username)) || null;
  }

  if (!record) {
    await interaction.reply(hidden({ content: "Nao achei esse membro na base da crew." }));
    return;
  }

  await interaction.reply(hidden({ embeds: [crewMemberEmbed(interaction.guild, record).setTitle(`${emo(interaction.guild, "member")} Membro encontrado`)] }));
}

async function handleRemoveFromCrewCommand(interaction) {
  await interaction.deferReply({ flags: EPHEMERAL });
  const subcommand = interaction.options.getSubcommand();
  const store = guildData(interaction.guildId);
  let userId = "";
  let label = "";

  if (subcommand === "discord") {
    const user = interaction.options.getUser("usuario", true);
    userId = user.id;
    label = `${user}`;
  }

  if (subcommand === "roblox") {
    const username = interaction.options.getString("username", true);
    const entry = Object.entries(store.members).find(([, item]) => normalizeKey(item.roblox) === normalizeKey(username));
    userId = entry?.[0] || "";
    label = username;
  }

  const record = userId ? store.members[userId] : null;
  if (!record) {
    await interaction.editReply("Nao achei esse membro na base da crew.");
    return;
  }

  delete store.members[userId];
  if (config.memberRoleId) {
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    await member?.roles.remove(config.memberRoleId).catch(() => {});
  }

  scheduleDataSave();
  await interaction.editReply(`Membro removido da crew: **${label || record.roblox}**.`);
}

async function addRoleAllMembers(interaction) {
  await interaction.deferReply({ flags: EPHEMERAL });
  const role = interaction.options.getRole("cargo", true);
  const botMember = await interaction.guild.members.fetchMe();

  if (role.managed || role.position >= botMember.roles.highest.position) {
    await interaction.editReply("Nao consigo aplicar esse cargo. Ele e gerenciado ou esta acima do cargo do bot.");
    return;
  }

  const members = await interaction.guild.members.fetch();
  let added = 0;
  let skipped = 0;
  let failed = 0;

  for (const member of members.values()) {
    if (member.user.bot || member.roles.cache.has(role.id)) {
      skipped += 1;
      continue;
    }
    await member.roles.add(role, `Comando /addroleallmembers por ${interaction.user.tag}`).then(
      () => { added += 1; },
      () => { failed += 1; },
    );
  }

  await interaction.editReply(`Cargo ${role} processado.\nAdicionados: **${added}**\nIgnorados: **${skipped}**\nFalhas: **${failed}**`);
}

async function removeEnterCrewRole(interaction) {
  await interaction.deferReply({ flags: EPHEMERAL });
  const enterRole = interaction.guild.roles.cache.find((role) => role.name.toLowerCase() === "enter crew");
  if (!enterRole) {
    await interaction.editReply("Nao achei um cargo chamado `ENTER CREW`.");
    return;
  }

  const botMember = await interaction.guild.members.fetchMe();
  if (enterRole.position >= botMember.roles.highest.position) {
    await interaction.editReply("Nao consigo remover esse cargo porque ele esta acima do cargo do bot.");
    return;
  }

  const store = guildData(interaction.guildId);
  const registeredIds = new Set(Object.keys(store.members));
  const members = await interaction.guild.members.fetch();
  let removed = 0;
  let skipped = 0;
  let failed = 0;

  for (const member of members.values()) {
    if (member.user.bot || !member.roles.cache.has(enterRole.id)) {
      skipped += 1;
      continue;
    }

    const isCrewMember = registeredIds.has(member.id)
      || (config.memberRoleId && member.roles.cache.has(config.memberRoleId))
      || (!registeredIds.size && !config.memberRoleId);

    if (!isCrewMember) {
      skipped += 1;
      continue;
    }

    await member.roles.remove(enterRole, `Comando /removeentecrew por ${interaction.user.tag}`).then(
      () => { removed += 1; },
      () => { failed += 1; },
    );
  }

  await interaction.editReply(`Cargo ${enterRole} removido dos membros da crew.\nRemovidos: **${removed}**\nIgnorados: **${skipped}**\nFalhas: **${failed}**`);
}

async function closeRegisterChannel(interaction) {
  if (interaction.channel?.isThread?.()) {
    await interaction.reply(hidden({ content: "Chat de registro finalizado e arquivado." }));
    await interaction.channel.setLocked(true).catch(() => {});
    await interaction.channel.setArchived(true, "Registro finalizado").catch(() => {});
    return;
  }

  await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
    SendMessages: false,
  });
  await interaction.reply(hidden({ content: "Chat de registro finalizado. O canal foi travado para membros comuns." }));
}

async function showBotServers(interaction) {
  const lines = client.guilds.cache
    .sort((a, b) => b.memberCount - a.memberCount)
    .map((guild) => `**${guild.name}** - \`${guild.id}\` - ${guild.memberCount || 0} membros`)
    .slice(0, 20);

  await interaction.reply(hidden({
    embeds: [baseEmbed(interaction.guild)
      .setTitle(`${emo(interaction.guild, "server")} Servidores do bot`)
      .setDescription(lines.length ? lines.join("\n") : "O bot nao esta em nenhum servidor no cache.")],
  }));
}

async function showLevel(interaction) {
  const user = interaction.options.getUser("usuario") || interaction.user;
  const record = xpRecord(interaction.guildId, user.id);
  const level = xpLevel(record.xp);
  const next = xpForLevel(level + 1);

  await interaction.reply({
    embeds: [baseEmbed(interaction.guild)
      .setTitle(`${emo(interaction.guild, "spark")} Level de ${user.username}`)
      .addFields(
        { name: "Level", value: String(level), inline: true },
        { name: "XP", value: `${record.xp}/${next}`, inline: true },
        { name: "Mensagens", value: String(record.messages), inline: true },
      )],
  });
}

async function showXpRank(interaction) {
  const guildXp = data.xp[interaction.guildId] || {};
  const top = Object.entries(guildXp)
    .sort(([, a], [, b]) => (b.xp || 0) - (a.xp || 0))
    .slice(0, 10);

  const lines = top.map(([userId, record], index) => {
    const level = xpLevel(record.xp || 0);
    return `**${index + 1}.** <@${userId}> - Level ${level} - ${record.xp || 0} XP`;
  });

  await interaction.reply({
    embeds: [baseEmbed(interaction.guild)
      .setTitle(`${emo(interaction.guild, "rocket")} Ranking de XP`)
      .setDescription(lines.length ? lines.join("\n") : "Ainda nao tenho mensagens suficientes para montar ranking.")],
  });
}

async function forceUpdateFruitStock(interaction) {
  if (!(await safeDeferReply(interaction))) return;
  const stock = await fetchStock({ force: true });
  await safeEditReply(interaction, await stockMessagePayload(stock, interaction.guild));
}

async function showFruitValue(interaction) {
  await interaction.deferReply();
  const fruit = interaction.options.getString("fruta", true);
  const found = findFruitMeta(fruit);
  if (!found) {
    await interaction.editReply(`Nao achei a fruta \`${fruit}\` no catalogo.`);
    return;
  }

  const trade = await fetchBloxFruitsValue(found.name).catch(() => null);
  const embed = baseEmbed(interaction.guild)
    .setTitle(`${emo(interaction.guild, "money")} ${found.name}`)
    .setURL(BLOXFRUITSVALUES_URL)
    .addFields(
      { name: "Beli", value: found.meta.beli || "Nao informado", inline: true },
      { name: "Robux", value: found.meta.robux || "Nao informado", inline: true },
      { name: "Tipo", value: found.meta.type || "Nao informado", inline: true },
      { name: "Trading Value", value: trade?.value || "Confira na fonte", inline: true },
      { name: "Demand", value: trade?.demand || "Fonte ao vivo", inline: true },
      { name: "Fonte", value: `[BloxFruitsValues](${BLOXFRUITSVALUES_URL})`, inline: false },
    );

  if (found.meta.imageUrl) embed.setThumbnail(found.meta.imageUrl);
  await interaction.editReply({ embeds: [embed] });
}

async function fetchBloxFruitsValue(name) {
  const html = await fetchText(BLOXFRUITSVALUES_URL, {
    headers: { "User-Agent": "DivineHuntersDiscordBot/1.0" },
    timeoutMs: 10000,
  });
  const key = normalizeFruitName(name);
  const compact = String(html || "").replace(/\s+/g, " ");
  const namePattern = new RegExp(`"${escapeRegExp(name)}"[^{}]{0,500}`, "i");
  const textPattern = new RegExp(`${escapeRegExp(name)}[^\\d]{0,120}([\\d,]{4,})[^A-Za-z0-9]{0,80}(Low|Medium|High|Very High|Extreme)?`, "i");
  const slice = compact.match(namePattern)?.[0] || compact.match(textPattern)?.[0] || "";
  const valueMatch = slice.match(/([\d,]{4,})/);
  const demandMatch = slice.match(/\b(Low|Medium|High|Very High|Extreme)\b/i);
  if (!valueMatch && !slice.toLowerCase().includes(key)) return null;
  return {
    value: valueMatch ? valueMatch[1] : "",
    demand: demandMatch ? demandMatch[1] : "",
  };
}

async function handleComboCommand(interaction) {
  const build = {
    fruit: cleanFruitName(interaction.options.getString("fruta", true)),
    style: interaction.options.getString("estilo", true).trim(),
    sword: interaction.options.getString("espada", true).trim(),
    gun: interaction.options.getString("arma", true).trim(),
    goal: interaction.options.getString("objetivo") || "pvp",
  };
  const combo = buildComboPlan(build);

  const embed = baseEmbed(interaction.guild)
    .setTitle(`${emo(interaction.guild, "spark")} Combo ${combo.title}`)
    .setDescription(combo.sequence.map((step, index) => `**${index + 1}.** ${step}`).join("\n"))
    .addFields(
      { name: "Build", value: `Fruta: **${build.fruit}**\nEstilo: **${build.style}**\nEspada: **${build.sword}**\nArma: **${build.gun}**`, inline: true },
      { name: "Objetivo", value: combo.goalLabel, inline: true },
      { name: "Dificuldade", value: combo.difficulty, inline: true },
      { name: "Ajustes", value: combo.tips.join("\n"), inline: false },
    )
    .setFooter({ text: `${config.brandName} | Combo gerado automaticamente` });

  const fruitMeta = findFruitMeta(build.fruit);
  if (fruitMeta?.meta?.imageUrl) embed.setThumbnail(fruitMeta.meta.imageUrl);
  await interaction.reply({ embeds: [embed] });
}

function buildComboPlan(build) {
  const fruitKey = normalizeFruitName(build.fruit);
  const styleKey = normalizeKey(build.style).replace(/[^a-z0-9]/g, "");
  const swordKey = normalizeKey(build.sword).replace(/[^a-z0-9]/g, "");
  const gunKey = normalizeKey(build.gun).replace(/[^a-z0-9]/g, "");
  const fruit = comboFruitProfile(fruitKey);
  const style = comboStyleProfile(styleKey, build.style);
  const sword = comboSwordProfile(swordKey, build.sword);
  const gun = comboGunProfile(gunKey, build.gun);
  const goal = comboGoalProfile(build.goal);
  const preset = comboPreset(fruitKey, styleKey, swordKey, gunKey);

  const sequence = preset || [
    `${gun.breaker} para gastar/quebrar Instinct antes do combo real.`,
    `${fruit.stun} para confirmar stun. Se errar, nao force o resto.`,
    `${sword.pull || style.gap} para puxar/alinha o alvo.`,
    `${style.damage} para encaixar dano enquanto o alvo esta preso.`,
    `${sword.damage} como burst principal.`,
    `${fruit.finish} ou ${gun.finish} para finalizar e sair do trade.`,
  ];

  return {
    title: `${build.fruit} + ${build.style}`,
    goalLabel: goal.label,
    difficulty: comboDifficulty(fruit, style, sword, gun, goal),
    sequence,
    tips: [
      "Regra base: quebre Instinct/Ken primeiro, depois stun, pull, dano e finisher.",
      goal.tip,
      fruit.tip,
      `${style.name}: ${style.tip}`,
      `${sword.name}: ${sword.tip}`,
      `${gun.name}: ${gun.tip}`,
      "Com ping alto, corte uma etapa e use uma rota mais curta.",
    ],
  };
}

function comboGoalProfile(goal) {
  const profiles = {
    bounty: { id: "bounty", label: "Bounty Hunt", tip: "Priorize iniciar de surpresa e sair rapido depois do kill." },
    oneshot: { id: "oneshot", label: "One Shot", tip: "Use tudo depois de confirmar stun; se errar o inicio, reseta." },
    control: { id: "control", label: "Controle", tip: "Segure cooldowns e jogue mais pelo stun do que por dano bruto." },
    pvp: { id: "pvp", label: "PVP", tip: "Nao gaste todos os cooldowns se o alvo ainda tiver mobilidade." },
  };
  return profiles[goal] || profiles.pvp;
}

function comboFruitProfile(key) {
  const profiles = [
    [["dough"], "Dough", "Dough V ou X", "Dough C/V", "Dough e forte quando o stun ja foi confirmado; nao abra seco contra Instinct ativo."],
    [["portal"], "Portal", "Portal Z", "Portal V para reposicionar ou resetar", "Portal depende de espada/estilo para dano; use mobilidade para punir erro."],
    [["kitsune"], "Kitsune", "Kitsune C ou X", "Kitsune Z/F para chase", "Use mobilidade para baitar Instinct antes do combo real."],
    [["dragon"], "Dragon", "Dragon X/Z", "Dragon C/V", "Confirme stun antes de gastar movimentos longos."],
    [["leopard"], "Leopard", "Leopard Z/X", "Leopard C/F", "Pressione com mobilidade e finalize rapido."],
    [["rumble", "lightning"], "Rumble", "Rumble X", "Rumble V", "Rumble joga muito por stun e confirma bem espada/pull."],
    [["ice"], "Ice", "Ice V", "Ice C + espada", "Freeze e sua janela principal; se errar, recue."],
    [["dark"], "Dark", "Dark C/X", "Dark V", "Dark depende de controle; jogue paciente e confirme pull."],
    [["shadow"], "Shadow", "Shadow Z/X", "Shadow V/C", "Boa pressao de medio alcance; finalize depois do escape inimigo."],
    [["venom"], "Venom", "Venom X", "Venom C/F", "Use puddle/dano continuo depois do stun."],
    [["magma"], "Magma", "Magma X/Z", "Magma V/C", "Magma recompensa alvo preso em area de dano."],
    [["spirit"], "Spirit", "Spirit Z/C", "Spirit V", "Use pressao para forcar movimento antes do stun."],
    [["light"], "Light", "Light X/Z", "Light V/C", "Entre e saia rapido antes do contra-combo."],
  ];
  const found = profiles.find(([keys]) => keys.some((item) => key.includes(item)));
  if (found) return { name: found[1], stun: found[2], finish: found[3], tip: found[4] };
  return { name: "Fruta", stun: `${foundMoveName(key, "Fruta")} skill de stun`, finish: `${foundMoveName(key, "Fruta")} finisher`, tip: "Use primeiro o movimento que prende ou força Instinct." };
}

function comboStyleProfile(key, fallback) {
  const profiles = [
    [["godhuman"], "Godhuman", "Godhuman C", "Godhuman Z + X", "Muito bom depois de stun curto; C ajuda a conectar."],
    [["sanguineart", "sanguine"], "Sanguine Art", "Sanguine C", "Sanguine Z + X", "Forte em pressao curta e chase."],
    [["electricclaw", "eclaw"], "Electric Claw", "Electric Claw C", "Electric Claw Z + X", "Rapido para bounty hunt e punish."],
    [["sharkmankarate", "sharkman"], "Sharkman Karate", "Sharkman X", "Sharkman C + Z", "Consistente quando o alvo esta preso."],
    [["dragontalon"], "Dragon Talon", "Dragon Talon X", "Dragon Talon C + Z", "Dano alto, mas exige confirmar bem."],
    [["deathstep"], "Death Step", "Death Step C", "Death Step Z + X", "Use depois de stun, nao como abertura."],
    [["superhuman"], "Superhuman", "Superhuman Z", "Superhuman C + X", "Classico para combos curtos."],
  ];
  const found = profiles.find(([keys]) => keys.some((item) => key.includes(item)));
  if (found) return { name: found[1], gap: found[2], damage: found[3], tip: found[4] };
  return { name: fallback, gap: `${fallback} skill de aproximacao`, damage: `${fallback} dano principal`, tip: "Use o golpe mais rapido logo depois do stun." };
}

function comboGunProfile(key, fallback) {
  const profiles = [
    [["soulguitar", "skullguitar"], "Soul Guitar", "Soul Guitar X", "Soul Guitar Z", "X e uma abertura forte para stun/Instinct break."],
    [["kabucha"], "Kabucha", "Kabucha X", "Kabucha Z", "Use X para quebrar Instinct ou empurrar para confirmar."],
    [["acidumrifle"], "Acidum Rifle", "Acidum Rifle Z", "Acidum Rifle X", "Boa para iniciar e manter pressao."],
    [["serpentsbow"], "Serpent Bow", "Serpent Bow Z", "Serpent Bow X", "Controle de distancia."],
    [["dragonstorm"], "Dragonstorm", "Dragonstorm Z", "Dragonstorm X", "Use como dano/pressao, nao como stun principal."],
  ];
  const found = profiles.find(([keys]) => keys.some((item) => key.includes(item)));
  if (found) return { name: found[1], breaker: found[2], finish: found[3], tip: found[4] };
  return { name: fallback, breaker: `${fallback} skill de abertura`, finish: `${fallback} skill final`, tip: "Use para quebrar Instinct ou segurar distancia." };
}

function comboSwordProfile(key, fallback) {
  const profiles = [
    [["curseddualkatana", "cdk"], "Cursed Dual Katana", "CDK Z", "CDK X", "CDK X/Z dao burst pesado depois do stun."],
    [["spikeytrident"], "Spikey Trident", "Spikey Trident X", "Spikey Trident Z", "Spikey X e pull forte para alinhar combo."],
    [["sharkanchor"], "Shark Anchor", "Shark Anchor X", "Shark Anchor Z", "Bom pull/dano, melhor depois de stun."],
    [["dragontrident"], "Dragon Trident", "Dragon Trident X", "Dragon Trident Z", "Controle em area para manter o alvo preso."],
    [["tushita"], "Tushita", "Tushita X", "Tushita Z", "Mobilidade e dano rapido."],
    [["yama"], "Yama", "Yama X", "Yama Z", "Bom chase para finalizar."],
    [["darkblade", "yoru"], "Dark Blade", "Dark Blade X", "Dark Blade Z", "Dano direto; confirme antes de usar."],
    [["hollowscythe"], "Hallow Scythe", "Hallow Scythe Z", "Hallow Scythe X", "Bom para manter pressao."],
  ];
  const found = profiles.find(([keys]) => keys.some((item) => key.includes(item)));
  if (found) return { name: found[1], pull: found[2], damage: found[3], tip: found[4] };
  return { name: fallback, pull: `${fallback} skill de pull/stun`, damage: `${fallback} skill de dano`, tip: "Use depois de confirmar stun, nao seco." };
}

function comboPreset(fruitKey, styleKey, swordKey, gunKey) {
  const has = (...keys) => keys.some((key) => fruitKey.includes(key) || styleKey.includes(key) || swordKey.includes(key) || gunKey.includes(key));
  const god = styleKey.includes("godhuman");
  const soul = gunKey.includes("soulguitar") || gunKey.includes("skullguitar");
  const cdk = swordKey.includes("curseddualkatana") || swordKey.includes("cdk");
  const spikey = swordKey.includes("spikeytrident");
  if (fruitKey.includes("dough") && god && cdk && soul) {
    return ["Soul Guitar X", "Dough V", "CDK Z", "Godhuman C", "Dough X", "CDK X", "Godhuman Z para finalizar"];
  }
  if (fruitKey.includes("rumble") && god && spikey && soul) {
    return ["Soul Guitar X para quebrar Instinct", "Rumble X", "Spikey Trident X para puxar", "Godhuman C", "Rumble V", "Godhuman Z/X para finalizar"];
  }
  if (fruitKey.includes("ice") && god) {
    return ["Ice V para freeze", "Godhuman C", cdk ? "CDK Z" : "Espada X/Z", "Ice C", "Godhuman Z/X", "Gun finisher se precisar"];
  }
  if (fruitKey.includes("dark") && spikey) {
    return ["Dark C", "Spikey Trident X", god ? "Godhuman C" : "Estilo de luta stun/dano", "Dark X", "Spikey Trident Z", "Gun finisher"];
  }
  if (fruitKey.includes("portal") && cdk && soul) {
    return ["Soul Guitar X", "Portal Z para entrar", "CDK Z", god ? "Godhuman C" : "Estilo de luta dano", "CDK X", "Portal V apenas para reset/reposicionar"];
  }
  if (has("kitsune")) {
    return ["Baita Instinct com mobilidade", "Gun X/Z para confirmar", "Kitsune C ou X", "Estilo de luta dano rapido", "Espada burst", "Kitsune chase para finalizar"];
  }
  return null;
}

function comboDifficulty(...parts) {
  const text = parts.map((item) => `${item.name || ""} ${item.label || ""}`).join(" ").toLowerCase();
  if (/portal|dragon|control|oneshot/.test(text)) return "Alta";
  if (/dough|rumble|godhuman|sanguine|cursed|spikey/.test(text)) return "Media";
  return "Baixa/Media";
}

function foundMoveName(key, fallback) {
  return key ? cleanFruitName(key) : fallback;
}

async function createGuildAccess(interaction) {
  await interaction.deferReply({ flags: EPHEMERAL });
  const channel = interaction.channel;

  if (!channel?.createInvite) {
    await interaction.editReply("Nao consigo criar convite neste canal.");
    return;
  }

  const invite = await channel.createInvite({
    maxAge: 24 * 60 * 60,
    maxUses: 1,
    unique: true,
    reason: `Acesso gerado por ${interaction.user.tag}`,
  }).catch(() => null);

  if (!invite) {
    await interaction.editReply("Nao consegui gerar o convite. Confira a permissao Create Instant Invite.");
    return;
  }

  await interaction.editReply(`Acesso gerado: ${invite.url}`);
}

async function showInviteLink(interaction) {
  const user = interaction.options.getUser("usuario") || interaction.user;
  const invites = await fetchGuildInvites(interaction.guild);
  if (!invites) {
    await interaction.reply(hidden({ content: "Nao consegui ler convites. O bot precisa de permissao para gerenciar/ver convites." }));
    return;
  }

  const invite = invites
    .filter((item) => item.inviter?.id === user.id)
    .sort((a, b) => (b.uses || 0) - (a.uses || 0))
    .first();

  await interaction.reply(hidden({ content: invite ? `Convite de ${user}: https://discord.gg/${invite.code}` : `Nao achei convite criado por ${user}.` }));
}

async function showInviteCodes(interaction) {
  const invites = await fetchGuildInvites(interaction.guild);
  if (!invites) {
    await interaction.reply(hidden({ content: "Nao consegui ler convites. Confira as permissoes do bot." }));
    return;
  }

  const lines = invites
    .sort((a, b) => (b.uses || 0) - (a.uses || 0))
    .map((invite) => `\`${invite.code}\` - **${invite.uses || 0}** usos - ${invite.inviter || "sem dono"}`)
    .slice(0, 15);

  await interaction.reply(hidden({
    embeds: [baseEmbed(interaction.guild)
      .setTitle(`${emo(interaction.guild, "pin")} Invite codes`)
      .setDescription(lines.length ? lines.join("\n") : "Nao ha convites ativos neste servidor.")],
  }));
}

async function showInvitedList(interaction) {
  const user = interaction.options.getUser("usuario");
  const code = interaction.options.getString("codigo");
  const records = Object.entries(guildData(interaction.guildId).inviteMembers)
    .map(([memberId, record]) => ({ memberId, ...record }))
    .filter((record) => !user || record.inviterId === user.id)
    .filter((record) => !code || normalizeKey(record.code) === normalizeKey(code))
    .sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0))
    .slice(0, 20);

  const lines = records.map((record) => `<@${record.memberId}> - \`${record.code || "sem codigo"}\` - <@${record.inviterId || "0"}>`);
  await interaction.reply(hidden({
    embeds: [baseEmbed(interaction.guild)
      .setTitle(`${emo(interaction.guild, "logs")} Membros convidados`)
      .setDescription(lines.length ? lines.join("\n") : "Ainda nao tenho registro de entradas por convite. O rastreio começa depois que o bot fica online.")],
  }));
}

async function showInviter(interaction) {
  const user = interaction.options.getUser("usuario", true);
  const record = guildData(interaction.guildId).inviteMembers[user.id];
  await interaction.reply(hidden({
    content: record
      ? `${user} entrou pelo convite \`${record.code || "desconhecido"}\` de <@${record.inviterId}>.`
      : `Nao tenho registro de quem convidou ${user}.`,
  }));
}

async function showInvites(interaction) {
  const user = interaction.options.getUser("usuario") || interaction.user;
  const invites = await fetchGuildInvites(interaction.guild);
  const inviteUses = invites
    ? invites.filter((invite) => invite.inviter?.id === user.id).reduce((sum, invite) => sum + (invite.uses || 0), 0)
    : 0;
  const tracked = Object.values(guildData(interaction.guildId).inviteMembers).filter((record) => record.inviterId === user.id).length;

  await interaction.reply({
    embeds: [baseEmbed(interaction.guild)
      .setTitle(`${emo(interaction.guild, "pin")} Convites de ${user.username}`)
      .addFields(
        { name: "Usos atuais", value: String(inviteUses), inline: true },
        { name: "Entradas rastreadas", value: String(tracked), inline: true },
      )],
  });
}

async function handleButton(interaction) {
  const id = interaction.customId;

  if (id.startsWith("verify:")) {
    await verifyMember(interaction);
    return;
  }

  if (id.startsWith("apply_staff")) {
    await interaction.showModal(staffModal(getCustomIdTarget(id), getCustomIdRole(id)));
    return;
  }

  if (id.startsWith("apply_captain")) {
    await interaction.showModal(captainModal(getCustomIdTarget(id), getCustomIdRole(id)));
    return;
  }

  if (id.startsWith("apply_recruit")) {
    await interaction.showModal(recruitModal(getCustomIdTarget(id), getCustomIdRole(id), getCustomIdCategory(id)));
    return;
  }

  if (id === "service_ticket") {
    await createTicket(interaction);
    return;
  }

  if (id === "stock_refresh") {
    if (!(await safeDeferUpdate(interaction))) return;
    const stock = await fetchStock({ force: true });
    await interaction.editReply(await stockMessagePayload(stock, interaction.guild));
    return;
  }

  if (id.startsWith("tc:")) {
    await startTicketModal(interaction);
    return;
  }

  if (id.startsWith("tclaim:")) {
    await claimTicket(interaction);
    return;
  }

  if (id.startsWith("tleave:")) {
    await leaveTicket(interaction);
    return;
  }

  if (id.startsWith("x:")) {
    await closeTicket(interaction);
    return;
  }

  if (id.startsWith("suggestion_vote:")) {
    await handleSuggestionVote(interaction);
    return;
  }

  if (id.startsWith("presence_join:")) {
    await handlePresenceButton(interaction);
    return;
  }

  if (id.startsWith("poll_vote:")) {
    await handlePollVote(interaction);
    return;
  }

  if (id.startsWith("rec_close:")) {
    await closeRecruitmentChannel(interaction);
    return;
  }

  if (id.startsWith("ticket_channel_close:")) {
    await closeTicketChannel(interaction);
    return;
  }

  if (id.startsWith("review_")) {
    await handleReviewButton(interaction);
  }
}

async function handleUserSelect(interaction) {
  if (interaction.customId.startsWith("tadd:")) {
    await addPeopleToTicket(interaction);
  }
}

async function handleStringSelect(interaction) {
  if (interaction.customId.startsWith("tcselect:")) {
    await startTicketModalFromSelect(interaction);
  }
}

async function handleModal(interaction) {
  if (interaction.customId.startsWith("modal_staff")) {
    await submitApplication(interaction, {
      kind: "Staff",
      emoji: emo(interaction.guild, "staff"),
      roleId: getCustomIdRole(interaction.customId) || config.staffRoleId,
      targetChannelId: getCustomIdTarget(interaction.customId),
      fields: [
        ["Tempo online", "staff_time"],
        ["Experiencia de staff", "staff_experience"],
        ["Motivacao", "staff_reason"],
        ["Familiaridade com bots", "staff_bots"],
        ["Nome Roblox", "staff_roblox"],
      ],
    });
    return;
  }

  if (interaction.customId.startsWith("modal_captain")) {
    await submitApplication(interaction, {
      kind: "Capitao",
      emoji: emo(interaction.guild, "captain"),
      roleId: getCustomIdRole(interaction.customId) || config.captainRoleId,
      targetChannelId: getCustomIdTarget(interaction.customId),
      fields: [
        ["Horario disponivel", "captain_free"],
        ["Horario ocupado", "captain_busy"],
        [`Plano na ${config.brandName}`, "captain_plan"],
        ["Vai dar o maximo?", "captain_effort"],
        ["Nome Roblox", "captain_roblox"],
      ],
    });
    return;
  }

  if (interaction.customId.startsWith("modal_recruit")) {
    await submitApplication(interaction, {
      kind: "Recrutamento",
      emoji: emo(interaction.guild, "recruit"),
      roleId: getCustomIdRole(interaction.customId) || config.memberRoleId,
      targetChannelId: getCustomIdTarget(interaction.customId),
      categoryId: getCustomIdCategory(interaction.customId),
      fields: [
        ["Nome Roblox", "recruit_roblox"],
        ["Bounty/Honor", "recruit_bounty"],
        ["Dispositivo", "recruit_device"],
        ["Level e fruta", "recruit_level"],
        ["Por que quer entrar?", "recruit_reason"],
      ],
    });
    return;
  }

  if (interaction.customId.startsWith("tm:")) {
    await submitTicketModal(interaction);
  }
}

async function submitApplication(interaction, application) {
  if (!(await safeDeferReply(interaction, { flags: EPHEMERAL }))) return;
  const cooldownKey = `${interaction.guildId}:${interaction.user.id}:${application.kind}`;
  const cooldownUntil = applicationCooldowns.get(cooldownKey) || 0;

  if (Date.now() < cooldownUntil) {
    await safeEditReply(interaction, `Voce ja enviou uma aplicacao de **${application.kind}**. Tente de novo <t:${Math.floor(cooldownUntil / 1000)}:R>.`);
    return;
  }

  const answers = application.fields.map(([label, key]) => ({
    label,
    value: safeField(interaction.fields.getTextInputValue(key)),
  }));

  const robloxAnswer = answers.find((answer) => /roblox/i.test(answer.label));
  const roblox = robloxAnswer ? await getRobloxProfile(robloxAnswer.value).catch(() => null) : null;
  const blacklistHit = findBlacklistHit(interaction.guildId, [interaction.user.id, interaction.user.tag, robloxAnswer?.value, roblox?.name].filter(Boolean));
  if (blacklistHit) {
    await sendAuditLog(interaction.guild, {
      title: "Auditoria: formulario bloqueado por blacklist",
      color: 0xff3b5c,
      fields: [
        ["Candidato", `${interaction.user} (\`${interaction.user.id}\`)`],
        ["Alvo blacklist", blacklistHit.target],
        ["Motivo", blacklistHit.reason],
      ],
    });
    await safeEditReply(interaction, "Sua aplicacao nao pode ser enviada no momento. A equipe foi avisada.");
    return;
  }
  const channel = await resolveApplicationDestination(interaction, application, answers, roblox);
  const reviewId = `${interaction.user.id}:${application.kind}:${Date.now()}`;

  if (!channel || !channel.isTextBased?.()) {
    await safeEditReply(interaction, "Nao achei o destino de analise. Recrie o painel com canal/categoria validos.");
    return;
  }

  const embed = applicationReviewEmbed(interaction, application, answers, roblox, reviewId);
  const row = new ActionRowBuilder().addComponents(
    button(`review_approve:${interaction.user.id}:${normalizeSnowflake(application.roleId) || "none"}`, "Aprovar", ButtonStyle.Success, "approve", interaction.guild),
    button(`review_deny:${interaction.user.id}:none`, "Recusar", ButtonStyle.Danger, "deny", interaction.guild),
    button(`review_call:${interaction.user.id}:none`, "Enviar DM", ButtonStyle.Secondary, "support", interaction.guild),
  );
  const components = [row];
  if (isRecruitmentApplicationChannel(channel, application, interaction.user.id)) {
    components.push(recruitmentChannelControlRow(interaction.guild, interaction.user.id));
  }
  const mentionPayload = applicationMentionPayload(interaction, application);

  let sent = false;
  await channel.send({
    ...mentionPayload,
    embeds: [embed],
    components,
  }).then(() => {
    sent = true;
  }).catch(async (error) => {
    console.warn(`[WARN] Nao consegui enviar aplicacao para analise: ${error.message}`);
    await safeEditReply(interaction, "Nao consegui enviar a aplicacao no canal de analise. Confira permissoes do bot nesse canal.");
  });
  if (!sent) return;
  if (config.applicationCooldownMinutes > 0) {
    applicationCooldowns.set(cooldownKey, Date.now() + config.applicationCooldownMinutes * 60 * 1000);
  }
  await sendAuditLog(interaction.guild, {
    title: "📝 Auditoria: formulário recebido",
    color: 0x7b2cff,
    fields: [
      ["Candidato", `${interaction.user} (\`${interaction.user.id}\`)`],
      ["Tipo", application.kind],
      ["Destino", `${channel}`],
      ["Cargo ao aprovar", roleMention(application.roleId)],
    ],
  });
  await safeEditReply(interaction, `Sua aplicacao foi enviada para analise em ${channel}. Boa sorte.`);
}

function applicationMentionPayload(interaction, application) {
  const roleId = normalizeSnowflake(application.roleId);
  if (!roleId) {
    return {
      content: `${interaction.user}`,
      allowedMentions: { users: [interaction.user.id], roles: [] },
    };
  }

  return {
    content: `Novo formulario de **${application.kind}**: <@&${roleId}> | Candidato: ${interaction.user}`,
    allowedMentions: { roles: [roleId], users: [interaction.user.id] },
  };
}

async function resolveApplicationDestination(interaction, application, answers, roblox) {
  if (application.kind === "Recrutamento" && normalizeSnowflake(application.categoryId)) {
    const channel = await createRecruitmentApplicationChannel(interaction, application, answers, roblox);
    if (channel) return channel;
  }

  return resolveChannel(
    interaction.guild,
    application.targetChannelId || config.applicationReviewChannelId || config.applicationLogChannelId,
  );
}

async function createRecruitmentApplicationChannel(interaction, application, answers, roblox) {
  const category = await interaction.guild.channels.fetch(application.categoryId).catch(() => null);
  if (!category || category.type !== ChannelType.GuildCategory) return null;

  const botMember = await interaction.guild.members.fetchMe().catch(() => null);
  const permissions = botMember ? category.permissionsFor(botMember) : null;
  const missing = [
    [PermissionFlagsBits.ManageChannels, "Gerenciar canais"],
    [PermissionFlagsBits.ViewChannel, "Ver categoria"],
  ]
    .filter(([permission]) => !permissions?.has(permission))
    .map(([, label]) => label);

  if (missing.length) {
    await safeEditReply(interaction, `Nao consigo criar canal em **${category.name}**. Falta permissao: **${missing.join(", ")}**.`);
    return null;
  }

  const nameSeed = roblox?.name || interaction.user.username || "candidato";
  const cleanName = slugChannelName(nameSeed).slice(0, 38) || "candidato";
  const channelName = `rec-${cleanName}`;
  const parentOverwrites = category.permissionOverwrites.cache.map((overwrite) => ({
    id: overwrite.id,
    allow: overwrite.allow.bitfield,
    deny: overwrite.deny.bitfield,
  }));
  const overwrites = [
    ...parentOverwrites,
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  return interaction.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `Recrutamento de ${interaction.user.tag} (${interaction.user.id})`,
    permissionOverwrites: overwrites,
    reason: `Formulario de recrutamento enviado por ${interaction.user.tag}`,
  }).catch(async (error) => {
    console.warn(`[WARN] Nao consegui criar canal de recrutamento: ${error.message}`);
    await safeEditReply(interaction, "Nao consegui criar o canal do recrutamento. Confira Manage Channels e permissoes da categoria.");
    return null;
  });
}

function isRecruitmentApplicationChannel(channel, application, userId) {
  return application.kind === "Recrutamento"
    && normalizeSnowflake(application.categoryId)
    && channel?.parentId === application.categoryId
    && String(channel.topic || "").includes(userId);
}

async function handleReviewButton(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply(hidden({ content: "So a equipe pode usar os botoes de analise." }));
    return;
  }

  if (!(await safeDeferReply(interaction, { flags: EPHEMERAL }))) return;

  const [action, userId, rawRoleId] = interaction.customId.replace("review_", "").split(":");
  const roleId = normalizeSnowflake(rawRoleId);
  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  const user = member?.user || await client.users.fetch(userId).catch(() => null);

  if (action === "approve") {
    const roleResult = await applyApprovedRole(member, roleId);
    const dmResult = await sendApplicationDm(user, `Sua aplicacao na **${config.brandName}** foi aprovada.`);
    await removeReviewMessage(interaction);
    await sendAuditLog(interaction.guild, {
      title: "✅ Auditoria: aplicação aprovada",
      color: 0x00ff85,
      fields: [
        ["Equipe", `${interaction.user} (\`${interaction.user.id}\`)`],
        ["Candidato", user ? `${user} (\`${user.id}\`)` : `\`${userId}\``],
        ["Cargo aplicado", roleMention(roleId)],
        ["Resultado", roleResult],
      ],
    });
    await safeEditReply(interaction, `Aplicacao aprovada por ${interaction.user}.\n${roleResult}\n${dmResult}`);
    return;
  }

  if (action === "deny") {
    const dmResult = await sendApplicationDm(user, `Sua aplicacao na **${config.brandName}** foi recusada por enquanto.`);
    await removeReviewMessage(interaction);
    await sendAuditLog(interaction.guild, {
      title: "❌ Auditoria: aplicação recusada",
      color: 0xff3b5c,
      fields: [
        ["Equipe", `${interaction.user} (\`${interaction.user.id}\`)`],
        ["Candidato", user ? `${user} (\`${user.id}\`)` : `\`${userId}\``],
        ["DM", dmResult],
      ],
    });
    await safeEditReply(interaction, `Aplicacao recusada por ${interaction.user}.\n${dmResult}`);
    return;
  }

  if (action === "call") {
    const dmResult = await sendApplicationDm(user, `A equipe da **${config.brandName}** quer falar com voce sobre sua aplicacao.`);
    await sendAuditLog(interaction.guild, {
      title: "📨 Auditoria: candidato chamado",
      color: 0x7b2cff,
      fields: [
        ["Equipe", `${interaction.user} (\`${interaction.user.id}\`)`],
        ["Candidato", user ? `${user} (\`${user.id}\`)` : `\`${userId}\``],
        ["DM", dmResult],
      ],
    });
    await safeEditReply(interaction, dmResult);
    return;
  }

  await safeEditReply(interaction, "Esse botao de analise esta invalido.");
}

async function closeRecruitmentChannel(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply(hidden({ content: "So a equipe pode fechar canal de recrutamento." }));
    return;
  }

  const [, candidateId] = String(interaction.customId).split(":");
  if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
    await interaction.reply(hidden({ content: "Esse botao so funciona em canal de texto de recrutamento." }));
    return;
  }

  await interaction.reply({
    embeds: [eventStyleEmbed(interaction.guild, 0xff3b5c)
      .setTitle("Canal de recrutamento fechado")
      .setDescription(`Fechado por ${interaction.user}. Este canal sera deletado em alguns segundos.`)
      .setFooter({ text: `${config.brandName} | Recrutamento` })],
  });
  await sendAuditLog(interaction.guild, {
    title: "Auditoria: canal de recrutamento fechado",
    color: 0xff3b5c,
    fields: [
      ["Equipe", `${interaction.user} (\`${interaction.user.id}\`)`],
      ["Candidato", normalizeSnowflake(candidateId) ? `<@${candidateId}> (\`${candidateId}\`)` : "Nao informado"],
      ["Canal", `${interaction.channel.name} (\`${interaction.channel.id}\`)`],
    ],
  });
  setTimeout(() => {
    interaction.channel.delete(`Recrutamento fechado por ${interaction.user.tag}`).catch(() => {});
  }, 5000);
}

function applicationReviewEmbed(interaction, application, answers, roblox, reviewId) {
  const roleId = normalizeSnowflake(application.roleId);
  const embed = baseEmbed(interaction.guild)
    .setColor(application.kind === "Recrutamento" ? 0x00ff85 : config.color)
    .setAuthor({ name: `${config.brandName} | Analise de aplicacao`, iconURL: config.logoUrl || interaction.guild?.iconURL({ size: 128 }) || undefined })
    .setTitle(`${application.emoji || ""} Nova aplicacao: ${application.kind}`)
    .setDescription([
      `**Candidato:** ${interaction.user}`,
      `**Cargo ao aprovar:** ${roleMention(roleId)}`,
      "**Status:** aguardando decisao da equipe",
      "",
      application.kind === "Recrutamento"
        ? "Acompanhe o candidato neste canal, converse se precisar e finalize pelos botoes abaixo."
        : "Use os botoes abaixo para finalizar a analise.",
    ].join("\n"))
    .setThumbnail(roblox?.avatarUrl || interaction.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "Usuario", value: `${interaction.user.tag}\nID: \`${interaction.user.id}\``, inline: true },
      { name: "Tipo", value: application.kind, inline: true },
      { name: "Canal", value: `<#${interaction.channelId}>`, inline: true },
      { name: "Acoes da equipe", value: application.kind === "Recrutamento" ? "Aprovar, recusar, chamar por DM ou fechar o canal." : "Aprovar, recusar ou chamar por DM.", inline: false },
    )
    .setFooter({ text: `Review ID: ${reviewId} | ${config.brandName}` })
    .setTimestamp();

  if (roblox) {
    embed.addFields({
      name: "Perfil Roblox",
      value: `[${roblox.name} (@${roblox.displayName})](https://www.roblox.com/users/${roblox.id}/profile)\nID: \`${roblox.id}\``,
      inline: false,
    });
  }

  embed.addFields(answers.map((answer) => ({
    name: answer.label,
    value: answer.value,
    inline: false,
  })));

  const banner = safeImageUrl(config.bannerUrl);
  if (banner) embed.setImage(banner);
  return embed;
}

async function applyApprovedRole(member, roleId) {
  if (!member) return "Nao achei o membro no servidor para aplicar cargo.";
  if (!roleId) return "Nenhum cargo foi configurado para aplicar.";

  const messages = [];
  try {
    await member.roles.add(roleId);
    messages.push(`Cargo ${roleMention(roleId)} aplicado.`);
  } catch (error) {
    console.warn(`[WARN] Nao consegui aplicar cargo aprovado: ${error.message}`);
    messages.push(`Nao consegui aplicar o cargo ${roleMention(roleId)}. Confira a permissao e a hierarquia do bot.`);
  }

  const pendingRole = findPendingCrewRole(member);
  if (pendingRole && pendingRole.id !== roleId) {
    await member.roles.remove(pendingRole.id, "Aplicacao aprovada: removendo cargo temporario da crew")
      .then(() => messages.push(`Cargo temporario ${pendingRole} removido.`))
      .catch((error) => {
        console.warn(`[WARN] Nao consegui remover cargo temporario: ${error.message}`);
        messages.push(`Nao consegui remover o cargo temporario ${pendingRole}.`);
      });
  }

  return messages.join("\n");
}

async function sendApplicationDm(user, message) {
  if (!user) return "Nao achei o usuario para enviar DM.";
  return user.send(message)
    .then(() => "DM enviada ao candidato.")
    .catch(() => "Nao consegui enviar DM ao candidato.");
}

function findPendingCrewRole(member) {
  if (!member?.roles?.cache) return null;
  const configured = normalizeSnowflake(config.pendingCrewRoleId);
  if (configured && member.roles.cache.has(configured)) return member.roles.cache.get(configured);
  const names = [
    "parte da crew",
    "entrar na crew",
    "entrada na crew",
    "quer entrar na crew",
    "recrutamento",
    "pendente crew",
  ].map(roleSearchKey);
  return member.roles.cache.find((role) => {
    const key = roleSearchKey(role.name);
    return names.some((name) => key === name || key.includes(name));
  }) || null;
}

function roleSearchKey(value) {
  return normalizeKey(value).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function eventStyleEmbed(guild, color = config.color) {
  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: config.brandName, iconURL: config.logoUrl || guild?.iconURL({ size: 128 }) || undefined })
    .setTimestamp();
}

async function sendAuditLog(guild, audit) {
  const store = guildData(guild.id);
  const channel = await resolveChannel(
    guild,
    store.auditLogChannelId || config.auditLogChannelId || config.applicationLogChannelId || config.applicationReviewChannelId,
  );
  if (!channel?.isTextBased?.()) return false;

  const embed = eventStyleEmbed(guild, audit.color || config.color)
    .setTitle(audit.title || "📚 Auditoria")
    .setFooter({ text: `${config.brandName} • Auditoria • ${formatDateTime()}` });

  if (audit.description) embed.setDescription(audit.description);
  if (audit.thumbnail) embed.setThumbnail(audit.thumbnail);
  if (audit.image) embed.setImage(audit.image);
  if (Array.isArray(audit.fields)) {
    embed.addFields(audit.fields.map(([name, value, inline = false]) => ({
      name,
      value: safeField(value),
      inline,
    })));
  }

  await channel.send({ embeds: [embed] }).catch((error) => {
    console.warn(`[AUDIT] Nao consegui enviar auditoria: ${error.message}`);
  });
  return true;
}

function formatClock(date = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: config.timezone,
  }).format(date);
}

function formatDateTime(date = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: config.timezone,
  }).format(date);
}

async function removeReviewMessage(interaction) {
  if (!interaction.message) return;
  await interaction.message.delete().catch(async () => {
    await interaction.message.edit({ components: [] }).catch(() => {});
  });
}

async function createTicket(interaction) {
  await interaction.deferReply({ flags: EPHEMERAL });
  const cleanName = interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 18) || "ticket";
  const channel = await interaction.guild.channels.create({
    name: `ticket-${cleanName}`,
    type: ChannelType.GuildText,
    parent: config.ticketCategoryId || null,
    permissionOverwrites: [
      {
        id: interaction.guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: interaction.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      },
      ...(config.staffRoleId
        ? [{
          id: config.staffRoleId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        }]
        : []),
    ],
  });

  await channel.send({
    content: [String(interaction.user), config.staffRoleId ? `<@&${config.staffRoleId}>` : ""].filter(Boolean).join(" "),
    embeds: [baseEmbed(interaction.guild)
      .setTitle(`${emo(interaction.guild, "ticket")} Atendimento aberto`)
      .setDescription([
        `Atendimento aberto para ${interaction.user}.`,
        "",
        "**Status:** Aguardando equipe",
        "**Tipo:** Servicos / atendimento geral",
        "",
        "Explique o que voce precisa, envie prints se tiver e aguarde a equipe.",
      ].join("\n"))
      .setColor(0x7b2cff)],
    components: [new ActionRowBuilder().addComponents(
      button(`ticket_channel_close:${interaction.user.id}`, "Fechar atendimento", ButtonStyle.Danger, "close", interaction.guild),
    )],
    allowedMentions: { users: [interaction.user.id], roles: config.staffRoleId ? [config.staffRoleId] : [] },
  });

  await interaction.editReply(`Ticket criado: ${channel}`);
}

async function closeTicketChannel(interaction) {
  const [, openerId] = String(interaction.customId).split(":");
  const canClose = interaction.user.id === openerId
    || interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)
    || interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
    || (config.staffRoleId && interaction.member?.roles?.cache?.has(config.staffRoleId));
  if (!canClose) {
    await interaction.reply(hidden({ content: "Apenas quem abriu ou a equipe pode fechar este ticket." }));
    return;
  }
  const transcript = await buildTranscript(interaction.channel);
  const attachment = new AttachmentBuilder(Buffer.from(transcript, "utf8"), {
    name: `transcript-${interaction.channel.id}.txt`,
  });
  const store = guildData(interaction.guildId);
  const logChannel = await resolveChannel(
    interaction.guild,
    store.auditLogChannelId || config.auditLogChannelId || config.applicationLogChannelId || config.applicationReviewChannelId,
  );
  if (logChannel?.isTextBased?.()) {
    await logChannel.send({
      embeds: [baseEmbed(interaction.guild)
        .setTitle("Auditoria: ticket de canal fechado")
        .setColor(0xff3b5c)
        .addFields(
          { name: "Aberto por", value: `<@${openerId}> (\`${openerId}\`)`, inline: true },
          { name: "Fechado por", value: `${interaction.user} (\`${interaction.user.id}\`)`, inline: true },
          { name: "Canal", value: `${interaction.channel.name} (\`${interaction.channel.id}\`)`, inline: false },
        )],
      files: [attachment],
    }).catch(() => {});
  }
  await interaction.reply({
    embeds: [baseEmbed(interaction.guild)
      .setTitle("Atendimento fechado")
      .setDescription(`Fechado por ${interaction.user}. Este canal sera deletado em alguns segundos.`)
      .setColor(0xff3b5c)],
  });
  setTimeout(() => {
    interaction.channel?.delete(`Ticket fechado por ${interaction.user.tag}`).catch(() => {});
  }, 5000);
}

async function setupTicketCenter(interaction) {
  const leaveChannel = interaction.options.getChannel("canal_sair_crew", false);
  const supportChannel = interaction.options.getChannel("canal_suporte", false);
  const supportRole = interaction.options.getRole("cargo_suporte", false);
  const adminRole = interaction.options.getRole("cargo_admin", false);
  const logChannel = interaction.options.getChannel("canal_logs", false);
  const parentChannel = supportChannel || leaveChannel || interaction.channel;
  const supportRoleId = supportRole?.id || config.staffRoleId || "0";

  if (!(await ensureTicketParent(interaction, parentChannel))) return;
  if (logChannel && !(await ensurePanelTarget(interaction, logChannel))) return;

  await interaction.reply({
    embeds: [ticketCenterEmbed(interaction.guild)],
    components: [ticketCenterMenu(interaction.guild, {
      parentChannelId: parentChannel.id,
      supportRoleId,
      adminRoleId: adminRole?.id || "0",
      logChannelId: logChannel?.id || "0",
    })],
  });
}

async function ensureTicketParent(interaction, channel) {
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply(hidden({ content: "Escolha um canal de texto valido para abrir os topicos de ticket." }));
    return false;
  }

  const botMember = await interaction.guild.members.fetchMe().catch(() => null);
  const permissions = botMember ? channel.permissionsFor(botMember) : null;
  const needed = [
    [PermissionFlagsBits.ViewChannel, "Ver canal"],
    [PermissionFlagsBits.SendMessages, "Enviar mensagens"],
    [PermissionFlagsBits.SendMessagesInThreads, "Enviar em topicos"],
    [PermissionFlagsBits.CreatePrivateThreads, "Criar topicos privados"],
    [PermissionFlagsBits.ManageThreads, "Gerenciar topicos"],
  ];
  const missing = needed.filter(([bit]) => !permissions?.has(bit)).map(([, label]) => label);

  if (missing.length) {
    await interaction.reply(hidden({
      content: `Faltam permissoes para ticket em ${channel}: ${missing.join(", ")}.`,
    }));
    return false;
  }
  return true;
}

function ticketCenterEmbed(guild) {
  return baseEmbed(guild)
    .setTitle("Atendimento ao publico")
    .setDescription([
      "## Central de ajuda",
      "",
      "**Peca ajuda, tire suas duvidas, faca denuncias e fale com a equipe.**",
      "",
      "- Escolha uma opcao no menu abaixo para abrir um ticket.",
      "- Explique tudo com calma no formulario.",
      "- Um membro da equipe vai assumir seu atendimento.",
      "- Quanto mais detalhes, mais rapido fica o suporte.",
    ].join("\n"))
    .addFields(
      {
        name: `${emo(guild, "support")} Como funciona`,
        value: [
          "O bot cria um topico privado para voce e a equipe.",
          "O ticket pode ser assumido, receber convidados e gerar transcript ao fechar.",
          "Canais e cargos configurados ficam ocultos no painel.",
        ].join("\n"),
        inline: false,
      },
      {
        name: `${emo(guild, "staff")} Sigilo`,
        value: "Evite marcar staff sem necessidade. O sistema ja avisa a equipe quando o ticket abre.",
        inline: false,
      },
    )
    .setFooter({ text: `${config.brandName} | Atendimento privado` });
}

function ticketCenterMenu(guild, setup) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`tcselect:${setup.parentChannelId}:${setup.supportRoleId}:${setup.adminRoleId}:${setup.logChannelId}`)
      .setPlaceholder(`${emojiText(guild, "ticket")} Clique aqui para escolher uma opcao`)
      .addOptions(
        {
          label: "Suporte",
          description: "Peca suporte da equipe",
          value: "tech",
          emoji: emojiValue(guild, "support") || undefined,
        },
        {
          label: "Denuncias",
          description: "Faca uma denuncia com provas",
          value: "report",
          emoji: emojiValue(guild, "warn") || undefined,
        },
        {
          label: "Duvidas",
          description: "Tire sua duvida com a equipe",
          value: "question",
          emoji: emojiValue(guild, "support") || undefined,
        },
        {
          label: "Sair da crew",
          description: "Fale com a lideranca sobre saida",
          value: "crew",
          emoji: emojiValue(guild, "leave") || undefined,
        },
        {
          label: "Sorteio / Resgate",
          description: "Resgate premio ou fale sobre sorteio",
          value: "prize",
          emoji: emojiValue(guild, "spark") || undefined,
        },
      ),
  );
}

async function startTicketModal(interaction) {
  const parsed = parseTicketOpenId(interaction.customId);
  if (!parsed) {
    await interaction.reply(hidden({ content: "Esse painel de ticket esta invalido. Peça para um admin criar outro." }));
    return;
  }
  await interaction.showModal(ticketOpenModal(parsed));
}

async function startTicketModalFromSelect(interaction) {
  const parsed = parseTicketSelectId(interaction.customId, interaction.values?.[0]);
  if (!parsed) {
    await interaction.reply(hidden({ content: "Essa central de ticket esta invalida. Peça para um admin criar outra." }));
    return;
  }
  await interaction.showModal(ticketOpenModal(parsed));
}

function ticketOpenModal(ticket) {
  return new ModalBuilder()
    .setCustomId(`tm:${ticket.type}:${ticket.parentChannelId}:${ticket.supportRoleId}:${ticket.adminRoleId}:${ticket.logChannelId}`)
    .setTitle(ticketTypeLabel(ticket.type).slice(0, 45))
    .addComponents(
      textInput("ticket_subject", ticketSubjectLabel(ticket.type), ticketSubjectPlaceholder(ticket.type), TextInputStyle.Short),
      textInput("ticket_details", "Explique com detalhes", ticketDetailsPlaceholder(ticket.type), TextInputStyle.Paragraph),
      textInput("ticket_roblox", "Nome no Roblox", "Ex.: SeuNickRoblox ou N/A", TextInputStyle.Short),
      textInput("ticket_platform", "Plataforma", "PC, mobile, console ou N/A", TextInputStyle.Short),
    );
}

async function submitTicketModal(interaction) {
  if (!(await safeDeferReply(interaction, { flags: EPHEMERAL }))) return;
  const parsed = parseTicketModalId(interaction.customId);
  if (!parsed) {
    await interaction.editReply("Esse formulario de ticket esta invalido. Crie outro pela central.");
    return;
  }
  await createAdvancedTicketThread(interaction, parsed, {
    subject: interaction.fields.getTextInputValue("ticket_subject"),
    details: interaction.fields.getTextInputValue("ticket_details"),
    roblox: interaction.fields.getTextInputValue("ticket_roblox"),
    platform: interaction.fields.getTextInputValue("ticket_platform"),
  });
}

async function openTicketThread(interaction) {
  await interaction.deferReply({ flags: EPHEMERAL });

  const parsed = parseTicketOpenId(interaction.customId);
  if (!parsed) {
    await interaction.editReply("Esse painel de ticket esta invalido. Peça para um admin criar outro.");
    return;
  }

  const parent = await resolveChannel(interaction.guild, parsed.parentChannelId);
  if (!parent || parent.type !== ChannelType.GuildText) {
    await interaction.editReply("Nao achei o canal configurado para esse tipo de ticket.");
    return;
  }

  const botMember = await interaction.guild.members.fetchMe();
  const permissions = parent.permissionsFor(botMember);
  const needed = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.SendMessagesInThreads,
    PermissionFlagsBits.CreatePrivateThreads,
  ];

  if (!permissions || !permissions.has(needed)) {
    await interaction.editReply("Faltam permissoes no canal configurado: View Channel, Send Messages, Send Messages in Threads e Create Private Threads.");
    return;
  }

  const safeUser = normalizeChannelName(interaction.user.username);
  const thread = await parent.threads.create({
    name: `${ticketTypeLabel(parsed.type)}-${safeUser}`.slice(0, 95),
    type: ChannelType.PrivateThread,
    autoArchiveDuration: 1440,
    invitable: false,
    reason: `Ticket aberto por ${interaction.user.tag}`,
  });

  await addTicketMembers(thread, interaction, parsed);

  await thread.send({
    content: `${interaction.user}`,
    embeds: [ticketInitialEmbed(interaction.guild, interaction.user, parsed)],
    components: ticketComponents(interaction.guild, interaction.user.id, parsed),
  });

  await interaction.editReply(`Ticket criado: ${thread}. Explique seu problema la dentro.`);
}

async function createAdvancedTicketThread(interaction, parsed, form) {
  const parent = await resolveChannel(interaction.guild, parsed.parentChannelId);
  if (!parent || parent.type !== ChannelType.GuildText) {
    await interaction.editReply("Nao achei o canal configurado para esse tipo de ticket.");
    return;
  }

  const store = guildData(interaction.guildId);
  const ticketKey = ticketOpenKey(interaction.user.id, parsed.type);
  const oldThreadId = store.tickets.openByUser[ticketKey];
  const oldThread = oldThreadId ? await parent.threads.fetch(oldThreadId).catch(() => null) : null;
  if (oldThread && !oldThread.archived) {
    await interaction.editReply(`Voce ja tem um ticket desse tipo aberto: ${oldThread}.`);
    return;
  }
  delete store.tickets.openByUser[ticketKey];

  const botMember = await interaction.guild.members.fetchMe();
  const permissions = parent.permissionsFor(botMember);
  const needed = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.SendMessagesInThreads,
    PermissionFlagsBits.CreatePrivateThreads,
  ];

  if (!permissions || !permissions.has(needed)) {
    await interaction.editReply("Faltam permissoes no canal configurado: View Channel, Send Messages, Send Messages in Threads e Create Private Threads.");
    return;
  }

  const safeUser = normalizeChannelName(interaction.user.username);
  const safeSubject = normalizeChannelName(form.subject).slice(0, 28) || ticketTypeLabel(parsed.type);
  const thread = await parent.threads.create({
    name: `${ticketTypeShort(parsed.type)}-${safeUser}-${safeSubject}`.slice(0, 95),
    type: ChannelType.PrivateThread,
    autoArchiveDuration: 1440,
    invitable: false,
    reason: `Ticket ${ticketTypeLabel(parsed.type)} aberto por ${interaction.user.tag}`,
  });

  await addTicketMembers(thread, interaction, parsed);
  store.tickets.openByUser[ticketKey] = thread.id;
  scheduleDataSave();

  await thread.send({
    content: [String(interaction.user), parsed.supportRoleId !== "0" ? `<@&${parsed.supportRoleId}>` : ""].filter(Boolean).join(" "),
    embeds: [ticketInitialEmbed(interaction.guild, interaction.user, parsed, form)],
    components: ticketComponents(interaction.guild, interaction.user.id, parsed),
    allowedMentions: { users: [interaction.user.id], roles: parsed.supportRoleId !== "0" ? [parsed.supportRoleId] : [] },
  });

  await sendAuditLog(interaction.guild, {
    title: "Auditoria: ticket aberto",
    color: ticketTypeColor(parsed.type),
    fields: [
      ["Usuario", `${interaction.user} (\`${interaction.user.id}\`)`],
      ["Tipo", ticketTypeLabel(parsed.type), true],
      ["Topico", `${thread}`, true],
      ["Assunto", form.subject],
    ],
  });

  await interaction.editReply(`Ticket criado: ${thread}. A equipe ja recebeu seu formulario.`);
}

function ticketInitialEmbed(guild, user, ticket, form = null) {
  const embed = baseEmbed(guild)
    .setTitle(`${ticketTypeEmoji(guild, ticket.type)} ${ticketTypeLabel(ticket.type)}`)
    .setDescription([
      `Atendimento aberto para ${user}.`,
      "",
      "**Status:** Aguardando equipe",
      `**Prioridade:** ${ticketTypePriority(ticket.type)}`,
      "",
      ticketTypeGuide(ticket.type),
      "",
      "Use os botoes abaixo para assumir, adicionar pessoas ou fechar com transcript.",
    ].join("\n"))
    .setColor(ticketTypeColor(ticket.type))
    .setTimestamp();
  if (form) {
    embed.addFields(
      { name: "Assunto", value: safeField(form.subject), inline: false },
      { name: "Detalhes", value: safeField(form.details), inline: false },
      { name: "Roblox", value: safeField(form.roblox), inline: true },
      { name: "Plataforma", value: safeField(form.platform), inline: true },
    );
  }
  return embed;
}

function ticketComponents(guild, openerId, ticket, assumerId = "0") {
  return [
    ticketButtonRow(guild, openerId, ticket, assumerId),
    ticketAddPeopleRow(guild, openerId, ticket),
  ];
}

function ticketButtonRow(guild, openerId, ticket, assumerId = "0") {
  const row = new ActionRowBuilder();
  const claim = button(`tclaim:${openerId}:${ticket.supportRoleId}:${ticket.adminRoleId}:${ticket.logChannelId}`, assumerId === "0" ? "Assumir" : "Assumido", ButtonStyle.Success, "claim", guild);
  if (assumerId !== "0") claim.setDisabled(true);

  row.addComponents(
    claim,
    button(`tleave:${openerId}`, "Sair do ticket", ButtonStyle.Secondary, "leave", guild),
    assumerId === "0"
      ? button(`x:${openerId}:${ticket.logChannelId}:r:${ticket.supportRoleId}:${ticket.adminRoleId}`, "Fechar com transcript", ButtonStyle.Danger, "close", guild)
      : button(`x:${openerId}:${ticket.logChannelId}:u:${assumerId}`, "Fechar com transcript", ButtonStyle.Danger, "close", guild),
  );

  return row;
}

function ticketAddPeopleRow(guild, openerId, ticket) {
  return new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`tadd:${openerId}:${ticket.supportRoleId}:${ticket.adminRoleId}`)
      .setPlaceholder(`${emojiText(guild, "add")} Adicionar pessoas ao ticket`)
      .setMinValues(1)
      .setMaxValues(5),
  );
}

async function addTicketMembers(thread, interaction, ticket) {
  const ids = new Set([interaction.user.id, interaction.guild.ownerId]);
  await interaction.guild.members.fetch().catch(() => null);

  for (const roleId of [ticket.supportRoleId, ticket.adminRoleId]) {
    if (!roleId || roleId === "0") continue;
    const role = interaction.guild.roles.cache.get(roleId);
    if (!role) continue;
    for (const member of role.members.values()) {
      if (!member.user.bot) ids.add(member.id);
      if (ids.size >= 80) break;
    }
  }

  for (const id of ids) {
    await thread.members.add(id).catch(() => {});
  }
}

async function claimTicket(interaction) {
  const ticket = parseTicketClaimId(interaction.customId);
  if (!ticket || !interaction.channel?.isThread()) {
    await interaction.reply(hidden({ content: "Esse botao de atendimento esta invalido." }));
    return;
  }

  if (!hasTicketStaff(interaction.member, ticket.supportRoleId, ticket.adminRoleId)) {
    await interaction.reply(hidden({ content: "So suporte/admin pode assumir este ticket." }));
    return;
  }

  await interaction.deferUpdate();
  await isolateThreadMembers(interaction.channel, [ticket.openerId, interaction.user.id, client.user.id]);

  await interaction.message.edit({
    embeds: interaction.message.embeds.length
      ? [EmbedBuilder.from(interaction.message.embeds[0])
        .setDescription([
          `Atendimento aberto para <@${ticket.openerId}>.`,
          "",
          `**Status:** Assumido por ${interaction.user}`,
          "**Prioridade:** Em andamento",
          "",
          "A equipe ja esta cuidando deste ticket.",
          "",
          "Use os botoes abaixo para adicionar pessoas ou fechar com transcript.",
        ].join("\n"))]
      : undefined,
    components: ticketComponents(interaction.guild, ticket.openerId, ticket, interaction.user.id),
  }).catch(() => {});

  await interaction.followUp(hidden({ content: "Voce assumiu este ticket. O topico foi ajustado para ficar mais privado." })).catch(() => {});
}

async function isolateThreadMembers(thread, allowedIds) {
  const allowed = new Set(allowedIds.filter(Boolean));
  const members = await thread.members.fetch().catch(() => null);
  if (!members) return;

  for (const member of members.values()) {
    const id = member.id;
    if (!allowed.has(id)) {
      await thread.members.remove(id).catch(() => {});
    }
  }
}

async function leaveTicket(interaction) {
  const [, openerId] = String(interaction.customId).split(":");
  if (!interaction.channel?.isThread()) {
    await interaction.reply(hidden({ content: "Esse botao so funciona dentro do topico do ticket." }));
    return;
  }

  const isStaff = interaction.memberPermissions?.has(PermissionFlagsBits.ManageThreads)
    || interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

  if (isStaff) {
    await interaction.reply(hidden({ content: "Suporte/admin nao usa Sair. Use Fechar se o atendimento acabou." }));
    return;
  }

  if (interaction.user.id !== openerId) {
    await interaction.reply(hidden({ content: "Apenas quem abriu o ticket pode usar esse botao." }));
    return;
  }

  await interaction.reply(hidden({ content: "Voce saiu do ticket. Se precisar de novo, abra outro pela central." }));
  await interaction.channel.members.remove(interaction.user.id).catch(() => {});
}

async function addPeopleToTicket(interaction) {
  const ticket = parseTicketAddId(interaction.customId);
  if (!ticket || !interaction.channel?.isThread()) {
    await interaction.reply(hidden({ content: "Esse menu de adicionar pessoas esta invalido." }));
    return;
  }

  if (!hasTicketStaff(interaction.member, ticket.supportRoleId, ticket.adminRoleId)) {
    await interaction.reply(hidden({ content: "So suporte/admin pode adicionar pessoas neste ticket." }));
    return;
  }

  const added = [];
  for (const userId of interaction.values) {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user || user.bot) continue;
    await interaction.channel.members.add(userId).then(() => added.push(`<@${userId}>`)).catch(() => {});
  }

  await interaction.reply(hidden({
    content: added.length ? `Adicionado(s): ${added.join(", ")}` : "Nao consegui adicionar ninguem.",
  }));
}

async function closeTicket(interaction) {
  const ticket = parseTicketCloseId(interaction.customId);
  if (!ticket || !interaction.channel?.isThread()) {
    await interaction.reply(hidden({ content: "Esse botao de fechamento esta invalido." }));
    return;
  }

  const canClose = interaction.user.id === ticket.assumerId
    || hasTicketStaff(interaction.member, ticket.supportRoleId, ticket.adminRoleId)
    || interaction.memberPermissions?.has(PermissionFlagsBits.ManageThreads);

  if (!canClose) {
    await interaction.reply(hidden({ content: "Membro so pode usar Sair. Fechar ticket e apenas para suporte/admin." }));
    return;
  }

  await interaction.deferReply({ flags: EPHEMERAL });
  const transcript = await buildTranscript(interaction.channel);
  const attachment = new AttachmentBuilder(Buffer.from(transcript, "utf8"), {
    name: `transcript-${interaction.channel.id}.txt`,
  });

  const logChannel = await resolveChannel(interaction.guild, ticket.logChannelId);
  if (logChannel) {
    await logChannel.send({
      embeds: [baseEmbed(interaction.guild)
        .setTitle(`${emo(interaction.guild, "logs")} Ticket fechado`)
        .addFields(
          { name: "Topico", value: interaction.channel.name, inline: true },
          { name: "Aberto por", value: `<@${ticket.openerId}>`, inline: true },
          { name: "Fechado por", value: `${interaction.user}`, inline: true },
        )
        .setTimestamp()],
      files: [attachment],
    }).catch(() => {});
  }

  clearOpenTicketRecord(interaction.guildId, ticket.openerId, interaction.channel.id);
  await interaction.editReply(`Ticket fechado. ${logChannel ? "Transcript enviado nas logs." : "Sem canal de logs configurado."}`);
  await interaction.channel.setLocked(true).catch(() => {});
  await interaction.channel.setArchived(true, "Ticket fechado").catch(() => {});
}

function clearOpenTicketRecord(guildId, openerId, threadId) {
  const store = guildData(guildId);
  for (const [key, value] of Object.entries(store.tickets.openByUser || {})) {
    if (value === threadId || key.startsWith(`${openerId}:`)) {
      delete store.tickets.openByUser[key];
    }
  }
  scheduleDataSave();
}

async function buildTranscript(thread) {
  const messages = [];
  let before;

  while (messages.length < 500) {
    const batch = await thread.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch?.size) break;
    messages.push(...batch.values());
    before = batch.last().id;
  }

  return messages
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((message) => {
      const time = new Date(message.createdTimestamp).toISOString();
      const files = message.attachments.size
        ? `\nAnexos: ${message.attachments.map((item) => item.url).join(", ")}`
        : "";
      return `[${time}] ${message.author.tag}: ${message.content || "(embed/anexo)"}${files}`;
    })
    .join("\n");
}

function parseTicketOpenId(customId) {
  const [, type, parentChannelId, supportRoleId, adminRoleId, logChannelId] = String(customId).split(":");
  if (!["crew", "tech", "report", "partner"].includes(type) || !/^\d{10,25}$/.test(parentChannelId)) return null;
  return { type, parentChannelId, supportRoleId, adminRoleId, logChannelId };
}

function parseTicketModalId(customId) {
  const [, type, parentChannelId, supportRoleId, adminRoleId, logChannelId] = String(customId).split(":");
  if (!isTicketType(type) || !/^\d{10,25}$/.test(parentChannelId)) return null;
  return { type, parentChannelId, supportRoleId, adminRoleId, logChannelId };
}

function parseTicketSelectId(customId, type) {
  const [, parentChannelId, supportRoleId, adminRoleId, logChannelId] = String(customId).split(":");
  if (!isTicketType(type) || !/^\d{10,25}$/.test(parentChannelId)) return null;
  return { type, parentChannelId, supportRoleId, adminRoleId, logChannelId };
}

function parseTicketClaimId(customId) {
  const [, openerId, supportRoleId, adminRoleId, logChannelId] = String(customId).split(":");
  if (!/^\d{10,25}$/.test(openerId)) return null;
  return { openerId, supportRoleId, adminRoleId, logChannelId };
}

function parseTicketAddId(customId) {
  const [, openerId, supportRoleId, adminRoleId] = String(customId).split(":");
  if (!/^\d{10,25}$/.test(openerId)) return null;
  return { openerId, supportRoleId, adminRoleId };
}

function parseTicketCloseId(customId) {
  const [, openerId, logChannelId, mode, firstId, secondId] = String(customId).split(":");
  if (!/^\d{10,25}$/.test(openerId)) return null;
  if (mode === "u") {
    return { openerId, logChannelId, supportRoleId: "0", adminRoleId: "0", assumerId: firstId };
  }
  return { openerId, logChannelId, supportRoleId: firstId, adminRoleId: secondId, assumerId: "0" };
}

function hasTicketStaff(member, supportRoleId, adminRoleId) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.ManageGuild) || member.permissions?.has(PermissionFlagsBits.ManageThreads)) return true;
  return [supportRoleId, adminRoleId].some((roleId) => roleId && roleId !== "0" && member.roles?.cache?.has(roleId));
}

function ticketTypeLabel(type) {
  if (type === "crew") return "Quero sair da crew";
  if (type === "report") return "Denuncia";
  if (type === "partner") return "Parceria";
  if (type === "question") return "Duvidas";
  if (type === "prize") return "Sorteio / Resgate";
  return "Suporte tecnico";
}

function ticketTypeShort(type) {
  if (type === "crew") return "crew";
  if (type === "report") return "denuncia";
  if (type === "partner") return "parceria";
  if (type === "question") return "duvida";
  if (type === "prize") return "resgate";
  return "suporte";
}

function ticketTypeGuide(type) {
  if (type === "report") return "Informe quem esta envolvido, provas, horarios e links/prints se tiver.";
  if (type === "partner") return "Explique a proposta, servidor/perfil envolvido e o que a parceria oferece.";
  if (type === "crew") return "Explique o motivo da saida e se precisa falar com algum lider.";
  if (type === "question") return "Descreva sua duvida e diga exatamente onde voce travou.";
  if (type === "prize") return "Informe qual premio, sorteio ou resgate voce quer tratar e envie provas se tiver.";
  return "Diga o erro, onde aconteceu, mande prints e informe seu dispositivo.";
}

function ticketTypeColor(type) {
  if (type === "crew") return 0xff3b5c;
  if (type === "report") return 0xffc857;
  if (type === "partner") return 0x00ff85;
  if (type === "question") return 0x44d7ff;
  if (type === "prize") return 0xfff04d;
  return 0x7b2cff;
}

function ticketTypeEmoji(guild, type) {
  if (type === "crew") return emo(guild, "leave");
  if (type === "report") return emo(guild, "warn");
  if (type === "question") return emo(guild, "support");
  if (type === "prize") return emo(guild, "spark");
  return emo(guild, "support");
}

function ticketTypePriority(type) {
  if (type === "report") return "Alta";
  if (type === "prize") return "Media";
  return "Normal";
}

function ticketSubjectLabel(type) {
  if (type === "report") return "Quem/qual problema voce denuncia?";
  if (type === "prize") return "Qual premio ou sorteio?";
  if (type === "question") return "Qual e a sua duvida?";
  if (type === "crew") return "Motivo principal";
  return "Assunto do ticket";
}

function ticketSubjectPlaceholder(type) {
  if (type === "report") return "Ex.: jogador x fez tal coisa";
  if (type === "prize") return "Ex.: premio do sorteio de hoje";
  if (type === "question") return "Ex.: duvida sobre recrutamento";
  if (type === "crew") return "Ex.: quero sair da crew por...";
  return "Ex.: preciso de suporte sobre...";
}

function ticketDetailsPlaceholder(type) {
  if (type === "report") return "Conte o que aconteceu, quando aconteceu e quais provas voce tem.";
  if (type === "prize") return "Mande contexto, print/link do sorteio e seu nick.";
  if (type === "question") return "Explique sua duvida com detalhes para a equipe responder rapido.";
  if (type === "crew") return "Explique a situacao e se quer falar com algum responsavel.";
  return "Conte o que aconteceu, mande contexto e o que voce precisa.";
}

function isTicketType(type) {
  return ["crew", "tech", "report", "partner", "question", "prize"].includes(type);
}

function ticketOpenKey(userId, type) {
  return `${userId}:${type}`;
}

function normalizeChannelName(value) {
  return String(value || "usuario")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24) || "usuario";
}

async function clearMessages(interaction) {
  await interaction.deferReply({ flags: EPHEMERAL });
  const amount = interaction.options.getInteger("quantidade", true);
  const user = interaction.options.getUser("usuario", false);

  if (!interaction.channel?.bulkDelete) {
    await interaction.editReply("Esse canal nao suporta limpeza de mensagens.");
    return;
  }

  const messages = await interaction.channel.messages.fetch({ limit: 100 });
  const selected = messages
    .filter((message) => !user || message.author.id === user.id)
    .first(amount);

  if (!selected.length) {
    await interaction.editReply("Nao encontrei mensagens para apagar com esse filtro.");
    return;
  }

  const deleted = await interaction.channel.bulkDelete(selected, true);
  await interaction.editReply(`Limpei **${deleted.size}** mensagem(ns)${user ? ` de ${user}` : ""}. Mensagens com mais de 14 dias sao ignoradas pelo Discord.`);
}

async function nukeChannel(interaction) {
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply(hidden({ content: "Use /nuke em um canal de texto normal." }));
    return;
  }
  const reason = interaction.options.getString("motivo") || `Nuke por ${interaction.user.tag}`;
  await interaction.reply(hidden({ content: "Nukando canal..." }));
  const clone = await channel.clone({
    name: channel.name,
    reason,
  });
  await clone.setPosition(channel.position).catch(() => {});
  await clone.send({
    embeds: [baseEmbed(interaction.guild)
      .setTitle("Canal nukado")
      .setDescription(`Todas as mensagens antigas foram apagadas.\nResponsavel: ${interaction.user}\nMotivo: ${safeField(reason)}`)
      .setColor(0xff3b5c)],
  }).catch(() => {});
  await sendAuditLog(interaction.guild, {
    title: "Auditoria: canal nukado",
    color: 0xff3b5c,
    fields: [
      ["Responsavel", `${interaction.user} (\`${interaction.user.id}\`)`],
      ["Canal antigo", `${channel.name} (\`${channel.id}\`)`],
      ["Canal novo", `${clone} (\`${clone.id}\`)`],
      ["Motivo", reason],
    ],
  });
  await channel.delete(reason).catch(() => {});
}

function recruitmentEmbed(guild, bannerUrl = "") {
  const embed = baseEmbed(guild)
    .setTitle(`${emo(guild, "recruit")} Recrutamento Oficial`)
    .setDescription([
      `A **${config.brandName}** esta analisando novos membros e staff.`,
      "Escolha a opcao abaixo, responda com calma e aguarde a equipe no canal criado para voce.",
      "",
      `${emo(guild, "spark")} Cada formulario de membro abre um canal privado de analise.`,
      `${emo(guild, "logs")} A staff recebe suas respostas em embed com botoes de aprovar, recusar, chamar e fechar.`,
      `${emo(guild, "warn")} Nunca envie senha, cookie, token, email ou dados privados.`,
    ].join("\n"))
    .addFields(
      {
        name: `${emo(guild, "staff")} Staff`,
        value: "Para quem quer ajudar na moderacao, suporte, tickets e organizacao da comunidade.",
        inline: true,
      },
      {
        name: `${emo(guild, "member")} Membro / Crew`,
        value: "Para entrar na crew com Roblox, bounty/honor, level, fruta e objetivo registrados.",
        inline: true,
      },
      {
        name: `${emo(guild, "pin")} Como funciona`,
        value: "Envie o formulario uma vez, acompanhe pelo canal criado e aguarde a decisao da equipe.",
        inline: false,
      },
    )
    .setFooter({ text: `${config.brandName} | Formularios privados e analisados pela equipe` });

  applyEmbedBanner(embed, bannerUrl || config.bannerUrl || config.panelGifUrl);
  return embed;
}

function staffEmbed(guild, bannerUrl = "") {
  const embed = baseEmbed(guild)
    .setTitle(`${emo(guild, "staff")} Aplicacao para Staff`)
    .setDescription(`A equipe da **${config.brandName}** procura pessoas presentes, justas e responsaveis.`)
    .addFields(
      {
        name: `${emo(guild, "pin")} Perfil ideal`,
        value: "Boa comunicacao\nMaturidade para resolver conflitos\nConstancia para ajudar membros",
        inline: true,
      },
      {
        name: `${emo(guild, "form")} Formulario`,
        value: "Tempo online\nExperiencia\nMotivacao\nFamiliaridade com bots\nRoblox",
        inline: true,
      },
      {
        name: `${emo(guild, "spark")} Resultado`,
        value: "Ao aprovar, o bot pode aplicar o cargo escolhido no painel.",
        inline: false,
      },
    )
    .setFooter({ text: "Clique no botao abaixo para abrir o formulario." });

  applyEmbedBanner(embed, bannerUrl || config.bannerUrl || config.panelGifUrl);
  return embed;
}

function captainEmbed(guild, bannerUrl = "") {
  const embed = baseEmbed(guild)
    .setTitle(`${emo(guild, "captain")} Aplicacao para Capitao`)
    .setDescription(`A **${config.brandName}** procura lideres ativos para organizar membros, rotas e eventos.`)
    .addFields(
      {
        name: `${emo(guild, "sword")} Responsabilidades`,
        value: "Ajudar membros\nOrganizar atividades\nRepresentar a crew com postura",
        inline: true,
      },
      {
        name: `${emo(guild, "brain")} O que esperamos`,
        value: "Comprometimento\nAtividade diaria\nBoa comunicacao\nLideranca",
        inline: true,
      },
      {
        name: `${emo(guild, "rocket")} Analise`,
        value: "A resposta cai no canal escolhido com botoes de aprovar, recusar e enviar DM.",
        inline: false,
      },
    )
    .setFooter({ text: "Clique no botao abaixo para abrir o formulario." });

  applyEmbedBanner(embed, bannerUrl || config.bannerUrl || config.panelGifUrl);
  return embed;
}

function servicesEmbed(guild, bannerUrl = "") {
  const lines = config.services.map((service, index) =>
    `**${index + 1}. ${service.name}**\n${service.price} | ${service.description}`,
  );

  const embed = baseEmbed(guild)
    .setTitle(`${emo(guild, "money")} Servicos e Precos`)
    .setDescription(lines.join("\n\n"))
    .addFields({
      name: `${emo(guild, "ticket")} Atendimento`,
      value: "Abra um ticket para combinar disponibilidade, detalhes e pagamento.",
      inline: false,
    })
    .setFooter({ text: `${config.brandName} | Atendimento privado por ticket` });

  applyEmbedBanner(embed, bannerUrl || config.bannerUrl);
  return embed;
}

function stockEmbed(stock, guild) {
  const nextNormal = nextStockRotationText("normal");
  const nextMirage = nextStockRotationText("mirage");
  const status = stock.stale
    ? "Fallback ativo com ultimo stock salvo em memoria."
    : stock.cached
      ? "Cache rapido ativo, sincronizado com a rotacao."
      : "Sincronizado com fonte live.";
  const embed = stockBaseEmbed(guild)
    .setTitle(`${emo(guild, "stock")} Stock Atualizado`)
    .setDescription(stock.description || "Stock atual de Blox Fruits.")
    .setFooter({ text: `Live: ${status} | Auto: ${config.stockIntervalMinutes} min | Normal ${nextNormal} | Mirage ${nextMirage}` })
    .setTimestamp();

  if (stock.normal.length) {
    embed.addFields({ name: `${emo(guild, "normal")} Stock normal`, value: stock.normal.join("\n").slice(0, 1024), inline: false });
  }
  if (stock.mirage.length) {
    embed.addFields({ name: `${emo(guild, "mirage")} Mirage stock`, value: stock.mirage.join("\n").slice(0, 1024), inline: false });
  }
  if (!stock.mirage.length && /mirage/i.test(stock.description)) {
    embed.addFields({ name: `${emo(guild, "mirage")} Mirage stock`, value: "Nao veio na API agora. Configure uma API propria em `STOCK_API_URL` se quiser Mirage automatico.", inline: false });
  }
  if (stock.last?.length) {
    embed.addFields({ name: "Stock anterior", value: stock.last.join(", ").slice(0, 1024), inline: false });
  }
  if (stock.rawSummary && !stock.normal.length && !stock.mirage.length) {
    embed.addFields({ name: "Dados", value: stock.rawSummary.slice(0, 1024), inline: false });
  }
  if (stock.fetchedAt) {
    embed.addFields({ name: `${emo(guild, "clock")} Atualizado`, value: `<t:${Math.floor(stock.fetchedAt / 1000)}:R>`, inline: true });
  }
  if (stock.expiresAt) {
    embed.addFields(
      { name: `${emo(guild, "normal")} Proxima Normal`, value: `${nextStockRotationClock("normal")} - ${nextStockRotationText("normal")}`, inline: true },
      { name: `${emo(guild, "mirage")} Proxima Mirage`, value: `${nextStockRotationClock("mirage")} - ${nextStockRotationText("mirage")}`, inline: true },
    );
  }
  if (config.stockShowSource && stock.source) {
    embed.addFields({ name: "Fonte", value: stock.source, inline: false });
  }
  if (stock.imageUrl || config.stockGifUrl) embed.setImage(stock.imageUrl || config.stockGifUrl);

  return embed;
}

function stockEmbeds(stock, guild) {
  const embeds = [stockEmbed(stock, guild)];
  const photos = (stock.photos || []).slice(0, 9);

  for (const photo of photos) {
    if (!photo.imageUrl) continue;
    embeds.push(
      stockBaseEmbed(guild)
        .setTitle(`${photo.kind || "Stock"} - ${photo.name}`)
        .setDescription(photo.details || "Fruta disponivel agora.")
        .setImage(photo.imageUrl),
    );
  }

  return embeds.slice(0, 10);
}

function stockBaseEmbed(guild) {
  return baseEmbed(guild)
    .setAuthor({ name: config.stockBrandName || config.brandName, iconURL: config.stockLogoUrl || config.logoUrl || undefined });
}

async function stockMessagePayload(stock, guild, kind = "") {
  const visual = await stockVisualPayload(stock, guild, kind).catch((error) => {
    console.warn(`[STOCK_IMAGE] ${error.message}`);
    return null;
  });

  if (visual) {
    return {
      content: "",
      embeds: visual.embeds,
      files: visual.files,
      components: [],
    };
  }

  return {
    content: stockUpdateContent(stock, guild, kind),
    embeds: stockCleanFallbackEmbeds(stock, guild, kind),
    components: [],
  };
}

async function stockVisualPayload(stock, guild, kind = "") {
  if (!sharp) return null;

  const sections = [
    { key: "normal", title: "Normal Stock", items: stockItemsForKind(stock, "Normal", stock.normal) },
    { key: "mirage", title: "Mirage Stock", items: stockItemsForKind(stock, "Mirage", stock.mirage) },
  ].filter((section) => section.items.length)
    .filter((section) => !kind || section.key === kind);

  if (!sections.length) return null;

  const files = [];
  const embeds = [];

  for (const section of sections.slice(0, 2)) {
    const nextClock = stockSectionNextClock(section.key);
    const buffer = await renderStockImage(section.title, section.items, nextClock);
    const filename = `${section.key}_stock_${Date.now()}.png`;
    files.push(new AttachmentBuilder(buffer, { name: filename }));
    embeds.push(stockSectionEmbed(guild, section, nextClock, filename));
  }

  return { files, embeds };
}

function stockSectionEmbed(guild, section, nextClock, filename) {
  const icon = section.key === "mirage"
    ? (emo(guild, "mirage") || "🌙")
    : (emo(guild, "normal") || "📦");
  const clock = emo(guild, "clock") || "🏆";

  return new EmbedBuilder()
    .setColor(config.color)
    .setDescription([
      `${icon} **${section.title} Atualizado!**`,
      `${clock} Próxima atualização: **${nextClock}**`,
    ].join("\n"))
    .setImage(`attachment://${filename}`);
}

function stockCleanFallbackEmbeds(stock, guild, kind = "") {
  const embeds = [];
  if ((!kind || kind === "normal") && stock.normal?.length) {
    embeds.push(new EmbedBuilder()
      .setColor(config.color)
      .setDescription([
        `${emo(guild, "normal") || "📦"} **Normal Stock Atualizado!**`,
        `${emo(guild, "clock") || "🏆"} Próxima atualização: **${nextRotationClock(4)}**`,
        "",
        stock.normal.join("\n").slice(0, 1000),
      ].join("\n")));
  }
  if ((!kind || kind === "mirage") && stock.mirage?.length) {
    embeds.push(new EmbedBuilder()
      .setColor(config.color)
      .setDescription([
        `${emo(guild, "mirage") || "🌙"} **Mirage Stock Atualizado!**`,
        `${emo(guild, "clock") || "🏆"} Próxima atualização: **${nextStockRotationClock("mirage")}**`,
        "",
        stock.mirage.join("\n").slice(0, 1000),
      ].join("\n")));
  }
  return embeds.length ? embeds : stockEmbeds(stock, guild);
}

function stockItemsForKind(stock, kind, lines) {
  const photos = (stock.photos || []).filter((photo) => normalizeKey(photo.kind) === normalizeKey(kind));
  const photoByName = new Map(photos.map((photo) => [normalizeFruitName(photo.name), photo]));
  const names = stockNamesFromLines(lines || []);
  const source = names.length ? names : photos.map((photo) => photo.name);

  return source
    .map((name) => {
      const key = normalizeFruitName(name);
      const photo = photoByName.get(key);
      const meta = FRUIT_META[key] || {};
      return {
        name: cleanFruitName(photo?.name || meta.name || name),
        imageUrl: photo?.imageUrl || meta.imageUrl || fruitImageUrl(name),
        price: stockBeliText(photo?.details || meta.beli || ""),
        type: meta.type || "",
      };
    })
    .filter((item) => item.name)
    .slice(0, 8);
}

async function renderStockImage(title, items, nextClock = "") {
  const width = 1600;
  const height = items.length > 4 ? 1040 : 760;
  const cardWidth = 260;
  const cardHeight = 350;
  const gap = 40;
  const startX = 270;
  const startY = 145;
  const brand = config.stockBrandName || "Divine Hunters";
  const rows = Math.ceil(items.length / 4);
  const bgSvg = stockBackgroundSvg(width, height);
  const cardSvg = items.map((item, index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const x = startX + col * (cardWidth + gap);
    const y = startY + row * (cardHeight + 70);
    const name = pixelTextSvg(item.name, x + cardWidth / 2, y + 258, 5, "#f7f3ff", "middle");
    const price = pixelTextSvg(item.price || "?", x + cardWidth / 2, y + 308, 4, "#17ffc3", "middle");
    return `
      <g>
        <rect x="${x - 8}" y="${y - 8}" width="${cardWidth + 16}" height="${cardHeight + 16}" rx="24" fill="#4b1591" opacity="0.35" filter="url(#glow)"/>
        <rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="22" fill="url(#cardGrad)" stroke="#25003f" stroke-width="8"/>
        <rect x="${x + 10}" y="${y + 10}" width="${cardWidth - 20}" height="${cardHeight - 20}" rx="16" fill="#000000" opacity="0.18"/>
        ${name}
        ${price}
      </g>`;
  }).join("");

  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <radialGradient id="bgGlow" cx="45%" cy="40%" r="70%">
          <stop offset="0%" stop-color="#19265d"/>
          <stop offset="38%" stop-color="#120f34"/>
          <stop offset="100%" stop-color="#03020a"/>
        </radialGradient>
        <linearGradient id="cardGrad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="#07365b"/>
          <stop offset="52%" stop-color="#103a5e"/>
          <stop offset="100%" stop-color="#3b0057"/>
        </linearGradient>
        <filter id="glow" x="-45%" y="-45%" width="190%" height="190%">
          <feGaussianBlur stdDeviation="12" result="blur"/>
          <feColorMatrix in="blur" type="matrix" values="0.45 0 0 0 0.25 0 0.05 0 0 0.85 0 0 0.45 0 1 0 0 0 1 0"/>
          <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      ${bgSvg}
      <circle cx="112" cy="104" r="68" fill="#14032b" stroke="#7f38e8" stroke-width="5" filter="url(#glow)"/>
      ${pixelTextSvg("DH", 112, 70, 7, "#f5ecff", "middle")}
      ${pixelTextSvg("LIVE STOCK", 112, 122, 3, "#17ffc3", "middle")}
      ${pixelTextSvg(brand, 112, 188, 2, "#f2ebff", "middle")}
      ${pixelTextSvg(title, 260, 38, 6, "#ffffff", "start")}
      ${cardSvg}
      ${pixelTextSvg(`Proxima atualizacao: ${nextClock}`, 270, height - 86, 3, "#17ffc3", "start")}
      ${pixelTextSvg("Atualizado automaticamente pelo bot", 270, height - 50, 3, "#a9b6ff", "start")}
    </svg>`);

  const composites = [];

  if (config.stockLogoUrl) {
    const logo = await loadImageBuffer(config.stockLogoUrl).catch(() => null);
    if (logo) {
      composites.push({
        input: await sharp(logo).resize(180, 180, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
        left: 22,
        top: 18,
      });
    }
  }

  for (const [index, item] of items.entries()) {
    if (!item.imageUrl) continue;
    const image = await loadImageBuffer(item.imageUrl).catch(() => null);
    if (!image) continue;
    const col = index % 4;
    const row = Math.floor(index / 4);
    const x = startX + col * (cardWidth + gap);
    const y = startY + row * (cardHeight + 70);
    composites.push({
      input: await sharp(image).resize(190, 170, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
      left: x + 35,
      top: y + 30,
    });
  }

  return sharp(svg).composite(composites).png().toBuffer();
}

function stockBackgroundSvg(width, height) {
  const stars = Array.from({ length: 180 }, (_, index) => {
    const x = (index * 97) % width;
    const y = (index * 53) % height;
    const r = index % 9 === 0 ? 2.1 : index % 4 === 0 ? 1.4 : 0.8;
    const opacity = index % 6 === 0 ? 0.8 : 0.45;
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffffff" opacity="${opacity}"/>`;
  }).join("");

  return `
    <rect width="${width}" height="${height}" fill="url(#bgGlow)"/>
    <path d="M0 ${height * 0.58} C260 ${height * 0.34}, 510 ${height * 0.84}, 790 ${height * 0.57} S1260 ${height * 0.44}, ${width} ${height * 0.66} L${width} ${height} L0 ${height} Z" fill="#12051f" opacity="0.42"/>
    <rect width="${width}" height="${height}" fill="#000000" opacity="0.28"/>
    ${stars}`;
}

async function loadImageBuffer(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "VoidLegionsDiscordBot/1.0" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function stockFooterText(stock) {
  const status = stock.stale
    ? "Fallback ativo com ultimo stock salvo."
    : stock.cached
      ? "Cache rapido ativo."
      : "Fonte live sincronizada.";
  const source = config.stockShowSource && stock.source ? `\nFonte: ${stock.source}` : "";
  return `${status} Atualizado <t:${Math.floor((stock.fetchedAt || Date.now()) / 1000)}:R>.${source}`;
}

function stockUpdateContent(stock, guild, kind = "") {
  const lines = [];
  if ((!kind || kind === "normal") && stock.normal?.length) {
    lines.push(`${emo(guild, "normal") || "📦"} Normal Stock Atualizado!`);
    lines.push(`${emo(guild, "clock") || "⏳"} Proxima atualizacao: **${nextStockRotationClock("normal")}**`);
  }
  if ((!kind || kind === "mirage") && stock.mirage?.length) {
    lines.push(`${emo(guild, "mirage") || "🌌"} Mirage Stock Atualizado!`);
    lines.push(`${emo(guild, "clock") || "⏳"} Proxima atualizacao: **${nextStockRotationClock("mirage")}**`);
  }
  return lines.join("\n");
}

function stockSectionNextClock(key) {
  return nextStockRotationClock(key === "mirage" ? "mirage" : "normal");
}

function stockBeliText(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const price = text.match(/(?:B\$|\$)\s?[\d,.]+/i)?.[0] || text.split(" - ")[0].split("/")[0].trim();
  return price
    .replace(/^B\$\s*/i, "")
    .replace(/^\$\s*/, "")
    .replace(/[^\d,.]/g, "")
    .trim();
}

function pixelTextSvg(text, x, y, scale = 4, color = "#ffffff", align = "start") {
  const value = stripAccents(String(text || "").toUpperCase()).replace(/[^A-Z0-9 ,.:!?/\-]/g, "");
  const spacing = scale;
  const charWidth = 5 * scale;
  const charHeight = 7 * scale;
  const totalWidth = [...value].reduce((sum, char) => {
    if (char === " ") return sum + 3 * scale + spacing;
    return sum + charWidth + spacing;
  }, 0);
  let cursor = align === "middle" ? x - totalWidth / 2 : x;
  const rects = [];

  for (const char of value) {
    if (char === " ") {
      cursor += 3 * scale + spacing;
      continue;
    }

    const glyph = PIXEL_FONT[char] || PIXEL_FONT["?"];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < glyph[row].length; col += 1) {
        if (glyph[row][col] !== "1") continue;
        rects.push(`<rect x="${Math.round(cursor + col * scale)}" y="${Math.round(y + row * scale)}" width="${scale}" height="${scale}" fill="${color}"/>`);
      }
    }
    cursor += charWidth + spacing;
  }

  return `<g shape-rendering="crispEdges">${rects.join("")}</g>`;
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function robloxEmbed(profile) {
  return baseEmbed()
    .setTitle(`Roblox: ${profile.name}`)
    .setURL(`https://www.roblox.com/users/${profile.id}/profile`)
    .setDescription(profile.description || "Perfil Roblox encontrado.")
    .setThumbnail(profile.avatarUrl)
    .addFields(
      { name: "Display", value: profile.displayName || profile.name, inline: true },
      { name: "User ID", value: String(profile.id), inline: true },
      { name: "Criado em", value: profile.created ? `<t:${Math.floor(new Date(profile.created).getTime() / 1000)}:D>` : "Indisponivel", inline: true },
    );
}

function serverInfoEmbed(guild) {
  return baseEmbed(guild)
    .setTitle(`${emo(guild, "server")} Info do servidor`)
    .setThumbnail(guild.iconURL({ size: 256 }))
    .addFields(
      { name: "Servidor", value: guild.name, inline: true },
      { name: "ID", value: guild.id, inline: true },
      { name: "Membros", value: String(guild.memberCount || "Indisponivel"), inline: true },
      { name: "Canais", value: String(guild.channels.cache.size), inline: true },
      { name: "Cargos", value: String(guild.roles.cache.size), inline: true },
      { name: "Criado em", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
    );
}

function apiStatusEmbed(status, guild) {
  return baseEmbed(guild)
    .setTitle(`${emo(guild, "api")} Status das APIs`)
    .setDescription("Diagnostico rapido para saber se o problema esta no bot, na API ou na configuracao.")
    .addFields(
      { name: "Stock", value: status.stock, inline: false },
      { name: "Roblox", value: status.roblox, inline: false },
      { name: "Fonte stock", value: status.source || "Nenhuma fonte respondeu com dados.", inline: false },
    )
    .setTimestamp();
}

function recruitmentButtons(targetChannelId = "default", guild, roles = {}, categoryId = "") {
  return new ActionRowBuilder().addComponents(
    button(buildApplyCustomId("apply_staff", targetChannelId, roles.staffRoleId || config.staffRoleId), "Staff", ButtonStyle.Primary, "staff", guild),
    button(buildApplyCustomId("apply_recruit", targetChannelId, roles.memberRoleId || config.memberRoleId, categoryId), "Recrutamento", ButtonStyle.Secondary, "recruit", guild),
  );
}

function recruitmentChannelControlRow(guild, candidateId) {
  return new ActionRowBuilder().addComponents(
    button(`rec_close:${candidateId}`, "Fechar canal", ButtonStyle.Danger, "close", guild),
  );
}

function servicesButtons(guild) {
  return new ActionRowBuilder().addComponents(
    button("service_ticket", "Abrir atendimento", ButtonStyle.Primary, "ticket", guild),
  );
}

function verificationEmbed(guild, role, link, imageUrl) {
  const embed = baseEmbed(guild)
    .setTitle("Verificacao do servidor")
    .setDescription([
      "Para liberar o restante do servidor, leia as regras e conclua a verificacao.",
      "",
      link ? "1. Abra o link abaixo e confira as informacoes." : "1. Confira as regras do servidor.",
      "2. Clique em **Verificar**.",
      "3. O cargo de acesso sera entregue automaticamente.",
    ].join("\n"))
    .addFields(
      { name: "Cargo liberado", value: `${role}`, inline: true },
      { name: "Seguranca", value: "Contas suspeitas ou comportamento toxico ainda podem ser punidos pela equipe.", inline: false },
    )
    .setColor(0x00ff85);
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function verificationButtons(guild, roleId, link = "") {
  const row = new ActionRowBuilder();
  if (link) {
    row.addComponents(new ButtonBuilder()
      .setLabel("Abrir link")
      .setStyle(ButtonStyle.Link)
      .setURL(link)
      .setEmoji(emojiValue(guild, "pin") || undefined));
  }
  row.addComponents(button(`verify:${roleId}`, "Verificar", ButtonStyle.Success, "approve", guild));
  return row;
}

function stockButtons(guild) {
  return new ActionRowBuilder().addComponents(
    button("stock_refresh", "Atualizar stock", ButtonStyle.Primary, "refresh", guild),
  );
}

function staffModal(targetChannelId = "default", approvedRoleId = "none") {
  return new ModalBuilder()
    .setCustomId(`modal_staff:${targetChannelId || "default"}:${normalizeSnowflake(approvedRoleId) || "none"}`)
    .setTitle("🛡️ Aplicacao para Staff")
    .addComponents(
      textInput("staff_time", "Quanto tempo online voce tem disponivel?", "Ex.: 4h por dia, geralmente das 19h as 23h.", TextInputStyle.Paragraph),
      textInput("staff_experience", "Ja teve experiencia de staff?", "Ex.: moderador em servidor X por 6 meses.", TextInputStyle.Paragraph),
      textInput("staff_reason", `Por que voce quer ser staff da ${config.brandName}?`, "Explique sua motivacao com clareza.", TextInputStyle.Paragraph),
      textInput("staff_bots", "Tem familiaridade com bots?", "Comandos, moderacao, tickets, automacoes ou paineis.", TextInputStyle.Paragraph),
      textInput("staff_roblox", "Qual seu nome no Roblox?", "Ex.: SeuNickRoblox", TextInputStyle.Short),
    );
}

function captainModal(targetChannelId = "default", approvedRoleId = "none") {
  return new ModalBuilder()
    .setCustomId(`modal_captain:${targetChannelId || "default"}:${normalizeSnowflake(approvedRoleId) || "none"}`)
    .setTitle("🏴‍☠️ Aplicacao Capitao")
    .addComponents(
      textInput("captain_free", "Que horario esta disponivel?", "Ex.: noite, finais de semana, 3h por dia.", TextInputStyle.Paragraph),
      textInput("captain_busy", "Que horario esta ocupado?", "Ex.: escola/trabalho das 7h as 17h.", TextInputStyle.Paragraph),
      textInput("captain_plan", `Qual seu plano na ${config.brandName}?`, "Fale como pretende organizar e liderar.", TextInputStyle.Paragraph),
      textInput("captain_effort", "Vai dar o maximo como Capitao?", "Responda com sinceridade.", TextInputStyle.Short),
      textInput("captain_roblox", "Qual seu nome no Roblox?", "Ex.: SeuNickRoblox", TextInputStyle.Short),
    );
}

function recruitModal(targetChannelId = "default", approvedRoleId = "none", categoryId = "none") {
  return new ModalBuilder()
    .setCustomId(`modal_recruit:${targetChannelId || "default"}:${normalizeSnowflake(approvedRoleId) || "none"}:${normalizeSnowflake(categoryId) || "none"}`)
    .setTitle("👑 Recrutamento")
    .addComponents(
      textInput("recruit_roblox", "Nome no Roblox", "Ex.: SeuNickRoblox", TextInputStyle.Short),
      textInput("recruit_bounty", "Seu bounty/honor", "Ex.: 2.5M bounty", TextInputStyle.Short),
      textInput("recruit_device", "Seu dispositivo", "PC, mobile, console...", TextInputStyle.Short),
      textInput("recruit_level", "Level e fruta", "Ex.: level 2550, Dough", TextInputStyle.Short),
      textInput("recruit_reason", "Por que quer entrar?", "Fale seu objetivo na crew.", TextInputStyle.Paragraph),
    );
}

function button(customId, label, style, emojiKey, guild) {
  const builder = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style);

  const value = emojiValue(guild, emojiKey);
  if (value) builder.setEmoji(value);
  return builder;
}

function textInput(customId, label, placeholder, style) {
  return new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId(customId)
      .setLabel(label.slice(0, 45))
      .setPlaceholder(placeholder.slice(0, 100))
      .setStyle(style)
      .setRequired(true)
      .setMaxLength(style === TextInputStyle.Short ? 120 : 900),
  );
}

function baseEmbed(guild) {
  const embed = new EmbedBuilder()
    .setColor(config.color)
    .setAuthor({ name: config.brandName, iconURL: config.logoUrl || guild?.iconURL({ size: 128 }) || undefined })
    .setFooter({ text: `${config.brandName} | Sistema oficial`, iconURL: config.logoUrl || guild?.iconURL({ size: 64 }) || undefined })
    .setTimestamp();

  if (config.logoUrl) {
    embed.setThumbnail(config.logoUrl);
  } else if (guild?.iconURL()) {
    embed.setThumbnail(guild.iconURL({ size: 256 }));
  }
  return embed;
}

function getBannerUrlFromCommand(interaction) {
  return safeImageUrl(interaction.options.getString("banner_url", false));
}

function applyEmbedBanner(embed, url) {
  const clean = safeImageUrl(url);
  if (clean) embed.setImage(clean);
  return embed;
}

function ensureFontconfigConfig(dir, file) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, [
      '<?xml version="1.0"?>',
      '<!DOCTYPE fontconfig SYSTEM "fonts.dtd">',
      "<fontconfig>",
      "  <dir>/usr/share/fonts</dir>",
      "  <dir>/usr/share/fonts/truetype</dir>",
      "  <dir>/usr/share/fonts/truetype/dejavu</dir>",
      "  <dir>/usr/share/fonts/truetype/liberation</dir>",
      "  <dir>/usr/share/fonts/opentype</dir>",
      "  <dir>/usr/local/share/fonts</dir>",
      "  <dir>~/.fonts</dir>",
      "  <alias><family>Arial</family><prefer><family>DejaVu Sans</family><family>Noto Sans</family><family>Liberation Sans</family></prefer></alias>",
      "  <alias><family>Arial Black</family><prefer><family>DejaVu Sans</family><family>Noto Sans</family><family>Liberation Sans</family></prefer></alias>",
      "  <alias><family>sans-serif</family><prefer><family>DejaVu Sans</family><family>Noto Sans</family><family>Liberation Sans</family></prefer></alias>",
      "  <cachedir>/tmp/fontconfig-cache</cachedir>",
      "</fontconfig>",
      "",
    ].join("\n"));
  } catch (error) {
    console.warn(`[WARN] Nao consegui preparar fontconfig: ${error.message}`);
  }
}

function safeImageUrl(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 2048) return "";
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function safeHttpUrl(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 2048) return "";
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

async function registerSlashCommands() {
  if (!config.clientId) {
    console.warn("[WARN] CLIENT_ID nao configurado. Comandos nao registrados.");
    return;
  }

  const configuredGuilds = parseIdList(config.guildId);
  const cachedGuilds = [...client.guilds.cache.keys()];
  const guildIds = [...new Set([...configuredGuilds, ...cachedGuilds])];

  if (!guildIds.length) {
    console.warn("[WARN] Bot ainda nao esta em nenhum servidor no cache para registrar comandos.");
    return;
  }

  let registered = 0;
  for (const guildId of guildIds) {
    await registerSlashCommandsForGuild(guildId)
      .then(() => { registered += 1; })
      .catch((error) => {
        console.warn(`[WARN] Falha ao registrar comandos no servidor ${guildId}: ${error.message}`);
      });
  }
  console.log(`[OK] Comandos registrados em ${registered}/${guildIds.length} servidor(es).`);
}

async function registerSlashCommandsForGuild(guildId) {
  if (!config.clientId || !normalizeSnowflake(guildId)) return;
  const rest = new REST({ version: "10" }).setToken(config.token);
  await rest.put(Routes.applicationGuildCommands(config.clientId, guildId), { body: commands });
  console.log(`[OK] Comandos registrados no servidor ${guildId}.`);
}

function createEmptyData() {
  return {
    guilds: {},
    xp: {},
  };
}

function loadData() {
  const fallback = createEmptyData();
  try {
    if (!fs.existsSync(config.dataFile)) return fallback;
    const parsed = JSON.parse(fs.readFileSync(config.dataFile, "utf8"));
    return {
      guilds: parsed.guilds && typeof parsed.guilds === "object" ? parsed.guilds : {},
      xp: parsed.xp && typeof parsed.xp === "object" ? parsed.xp : {},
    };
  } catch (error) {
    console.warn(`[WARN] Nao consegui ler DATA_FILE: ${error.message}`);
    return fallback;
  }
}

function saveData() {
  try {
    fs.mkdirSync(path.dirname(config.dataFile), { recursive: true });
    fs.writeFileSync(config.dataFile, JSON.stringify(data, null, 2));
  } catch (error) {
    console.warn(`[WARN] Nao consegui salvar DATA_FILE: ${error.message}`);
  }
}

function scheduleDataSave() {
  if (dataSaveTimer) return;
  dataSaveTimer = setTimeout(() => {
    dataSaveTimer = null;
    saveData();
  }, DATA_SAVE_DELAY_MS);
}

function guildData(guildId) {
  data.guilds ||= {};
  data.guilds[guildId] ||= {};
  const store = data.guilds[guildId];
  store.crew ||= null;
  store.crewAccounts ||= {};
  store.memberAccounts ||= {};
  store.members ||= {};
  store.preregisters ||= {};
  store.inviteMembers ||= {};
  store.stockChannelId ||= "";
  store.stockMessageId ||= "";
  store.stockMessageIds ||= {};
  store.auditLogChannelId ||= "";
  store.suggestionChannelId ||= "";
  store.warns ||= {};
  store.strikes ||= {};
  store.welcome ||= {};
  store.verification ||= {};
  store.goals ||= {};
  store.presences ||= {};
  store.shifts ||= {};
  store.blacklist ||= {};
  store.polls ||= {};
  store.pvp ||= {};
  store.pvp.players ||= {};
  store.pvp.history ||= [];
  store.tickets ||= {};
  store.tickets.openByUser ||= {};
  return store;
}

function normalizeKey(value) {
  return stripAccents(String(value || "")).trim().toLowerCase();
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function registerCrewMember(guildId, user, roblox, addedBy) {
  const store = guildData(guildId);
  const record = {
    userId: user.id,
    discordTag: user.tag,
    roblox: roblox.slice(0, 80),
    addedBy,
    addedAt: Date.now(),
  };
  store.members[user.id] = record;
  return record;
}

function crewMemberEmbed(guild, record) {
  return baseEmbed(guild)
    .addFields(
      { name: "Discord", value: `<@${record.userId}> (\`${record.userId}\`)`, inline: false },
      { name: "Roblox", value: record.roblox || "Nao informado", inline: true },
      { name: "Registrado", value: record.addedAt ? `<t:${Math.floor(record.addedAt / 1000)}:R>` : "Nao informado", inline: true },
    );
}

function pvpRecord(store, userId) {
  store.pvp.players[userId] ||= { wins: 0, losses: 0, streak: 0 };
  return store.pvp.players[userId];
}

function goalEmbed(guild, goal) {
  return baseEmbed(guild)
    .setTitle(`Meta: ${goal.name}`)
    .setDescription(goalLine(goal))
    .addFields({ name: "Top contribuintes", value: topContributors(goal.byUser) || "Sem contribuicoes detalhadas." });
}

function goalLine(goal) {
  const percent = Math.floor(((goal.current || 0) / Math.max(1, goal.target || 1)) * 100);
  return `**${goal.name}** - ${goal.current || 0}/${goal.target} (${Math.min(100, percent)}%)`;
}

function topContributors(byUser = {}) {
  return Object.entries(byUser)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([userId, value], index) => `**${index + 1}.** <@${userId}> - ${value}`)
    .join("\n");
}

function presenceEmbed(guild, presence) {
  const members = Object.keys(presence.members || {});
  return baseEmbed(guild)
    .setTitle(`Presenca: ${presence.eventName}`)
    .setDescription(`Data: **${presence.date}**\nConfirmados: **${members.length}**`)
    .addFields({ name: "Lista", value: members.length ? members.map((id) => `<@${id}>`).slice(0, 30).join("\n") : "Ninguem confirmou ainda." })
    .setTimestamp();
}

function pollEmbed(guild, poll) {
  const yes = Object.keys(poll.yes || {}).length;
  const no = Object.keys(poll.no || {}).length;
  return baseEmbed(guild)
    .setTitle(`Votacao: ${poll.title}`)
    .setDescription(poll.description)
    .addFields(
      { name: "Aprovar", value: String(yes), inline: true },
      { name: "Reprovar", value: String(no), inline: true },
      { name: "Total", value: String(yes + no), inline: true },
    )
    .setTimestamp();
}

function normalizeBlacklistKey(value) {
  return normalizeKey(value).replace(/[^a-z0-9]/g, "");
}

function findBlacklistHit(guildId, values) {
  const blacklist = guildData(guildId).blacklist || {};
  for (const value of values) {
    const hit = blacklist[normalizeBlacklistKey(value)];
    if (hit) return hit;
  }
  return null;
}

function xpRecord(guildId, userId) {
  data.xp ||= {};
  data.xp[guildId] ||= {};
  data.xp[guildId][userId] ||= { xp: 0, messages: 0, updatedAt: Date.now() };
  return data.xp[guildId][userId];
}

function xpLevel(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100));
}

function xpForLevel(level) {
  return Math.max(0, level) * Math.max(0, level) * 100;
}

async function guardMessage(message) {
  if (!message.guild || message.author?.bot || !message.content) return;
  const member = message.member;
  if (member?.permissions?.has(PermissionFlagsBits.ManageMessages)) return;

  const content = message.content;
  const badWord = findBadWord(content);
  const hasInvite = /(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)/i.test(content);
  const hasBadLink = /https?:\/\/\S+/i.test(content) && !/roblox\.com|youtube\.com|youtu\.be|discord\.com/i.test(content);
  const now = Date.now();
  const key = `${message.guildId}:${message.author.id}`;
  const bucket = (spamBuckets.get(key) || []).filter((time) => now - time < 7000);
  bucket.push(now);
  spamBuckets.set(key, bucket);

  if (badWord) {
    await punishBadWord(message, badWord);
    return;
  }

  if (hasInvite || hasBadLink || bucket.length >= 6) {
    await message.delete().catch(() => {});
    await sendAuditLog(message.guild, {
      title: "Auditoria: anti-spam/anti-link",
      color: 0xff3b5c,
      fields: [
        ["Usuario", `${message.author} (\`${message.author.id}\`)`],
        ["Canal", `${message.channel}`],
        ["Motivo", bucket.length >= 6 ? "Flood/spam" : "Link bloqueado"],
        ["Conteudo", safeField(content)],
      ],
    });
  }
}

async function punishBadWord(message, badWord) {
  const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
  const botMember = await message.guild.members.fetchMe().catch(() => null);
  const key = `${message.guildId}:${message.author.id}`;
  const now = Date.now();
  if ((automodMuteCooldowns.get(key) || 0) > now) {
    await message.delete().catch(() => {});
    return;
  }
  automodMuteCooldowns.set(key, now + 60 * 1000);
  await message.delete().catch(() => {});
  const canTimeout = member?.moderatable && botMember?.permissions?.has(PermissionFlagsBits.ModerateMembers);
  if (canTimeout) {
    await member.timeout(60 * 1000, `AutoMod: palavra bloqueada (${badWord})`).catch(() => {});
  }
  await sendAuditLog(message.guild, {
    title: "Auditoria: automod mute",
    color: 0xff3b5c,
    fields: [
      ["Usuario", `${message.author} (\`${message.author.id}\`)`],
      ["Canal", `${message.channel}`],
      ["Punicao", canTimeout ? "Timeout de 1 minuto" : "Mensagem apagada; sem permissao para timeout"],
      ["Motivo", "Palavra ofensiva bloqueada"],
      ["Conteudo", safeField(message.content)],
    ],
  });
}

function findBadWord(content) {
  const normalized = stripAccents(String(content || "").toLowerCase())
    .replace(/[@#$%¨&*()_+=|\\{}\[\]:;"'<>,.?/~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  for (const word of config.badWords) {
    const clean = stripAccents(String(word || "").toLowerCase()).trim();
    if (!clean) continue;
    const pattern = new RegExp(`(^|\\s)${escapeRegExp(clean).replace(/\\ /g, "\\s+")}(\\s|$)`, "i");
    if (pattern.test(normalized)) return clean;
  }
  return "";
}

function trackMessageXp(message) {
  if (!message.guildId || message.author?.bot) return;

  const cooldownKey = `${message.guildId}:${message.author.id}`;
  const now = Date.now();
  if ((xpCooldowns.get(cooldownKey) || 0) > now) return;
  xpCooldowns.set(cooldownKey, now + XP_COOLDOWN_MS);

  const record = xpRecord(message.guildId, message.author.id);
  record.messages += 1;
  record.xp += 15;
  record.updatedAt = now;
  scheduleDataSave();
}

async function cacheAllGuildInvites() {
  for (const guild of client.guilds.cache.values()) {
    await updateInviteCache(guild).catch(() => {});
  }
}

async function fetchGuildInvites(guild) {
  return guild.invites.fetch().catch(() => null);
}

async function updateInviteCache(guild) {
  const invites = await fetchGuildInvites(guild);
  if (!invites) return null;

  const cached = {};
  for (const invite of invites.values()) {
    cached[invite.code] = {
      code: invite.code,
      uses: invite.uses || 0,
      inviterId: invite.inviter?.id || "",
      channelId: invite.channelId || "",
    };
  }
  inviteCache.set(guild.id, cached);
  return cached;
}

async function trackMemberInvite(member) {
  const before = inviteCache.get(member.guild.id) || {};
  const after = await updateInviteCache(member.guild);
  if (!after) return;

  const used = Object.values(after).find((invite) => (invite.uses || 0) > (before[invite.code]?.uses || 0));
  if (!used) return;

  const store = guildData(member.guild.id);
  store.inviteMembers[member.id] = {
    code: used.code,
    inviterId: used.inviterId,
    joinedAt: Date.now(),
  };
  scheduleDataSave();
}

function findFruitMeta(name) {
  const key = normalizeFruitName(name);
  if (!key) return null;
  if (FRUIT_META[key]) {
    return { name: FRUIT_META[key].name || cleanFruitName(name), meta: FRUIT_META[key] };
  }

  const entry = Object.entries(FRUIT_META).find(([fruitKey, meta]) =>
    fruitKey.includes(key) || key.includes(fruitKey) || normalizeFruitName(meta.name).includes(key),
  );
  return entry ? { name: entry[1].name || cleanFruitName(name), meta: entry[1] } : null;
}

async function getRobloxProfile(username) {
  const usersResponse = await fetchJson("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
  });

  const user = usersResponse?.data?.[0];
  if (!user?.id) return null;

  const [profile, avatar] = await Promise.all([
    fetchJson(`https://users.roblox.com/v1/users/${user.id}`).catch(() => null),
    fetchJson(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${user.id}&size=420x420&format=Png&isCircular=false`).catch(() => null),
  ]);

  return {
    id: user.id,
    name: user.name,
    displayName: user.displayName,
    description: profile?.description || "",
    created: profile?.created || "",
    avatarUrl: avatar?.data?.[0]?.imageUrl || "",
  };
}

async function fetchStock(options = {}) {
  const force = Boolean(options.force);
  const now = Date.now();
  if (!force && stockCache && now < stockCache.softExpiresAt) {
    return markStockCacheState(stockCache.stock, { cached: true, stale: false });
  }

  const fresh = await fetchFreshStock();
  if (stockHasContent(fresh)) {
    const hydrated = hydrateStock(fresh, false);
    stockCache = {
      stock: hydrated,
      softExpiresAt: stockSoftExpireAt(),
      hardExpiresAt: now + config.stockCacheMaxStaleHours * 60 * 60 * 1000,
    };
    return hydrated;
  }

  if (stockCache && now < stockCache.hardExpiresAt) {
    return markStockCacheState(stockCache.stock, { cached: true, stale: true });
  }

  return hydrateStock({
    description: "Nao consegui sincronizar o stock agora. Tente novamente em alguns minutos.",
    normal: [],
    mirage: [],
    photos: [],
    imageUrl: "",
    rawSummary: "Todas as fontes externas falharam e nao existe cache ativo.",
    source: "",
  }, false);
}

async function fetchFreshStock() {
  const tasks = [
    ...config.stockApiUrls.map((url) => ({
      priority: 150,
      label: `API configurada: ${url}`,
      run: () => fetchConfiguredStock(url),
    })),
    { priority: 130, label: "FruityBlox in-game shop", run: fetchFruityBloxStock },
    { priority: 90, label: "BloxInformer live", run: fetchBloxInformerStock },
    { priority: 80, label: "BloxFruitsCalc structured data", run: fetchBloxFruitsCalcStock },
    { priority: 60, label: "Blox Fruits Wiki via Fandom API", run: fetchFandomStock },
  ];

  const results = await Promise.allSettled(tasks.map(async (task) => {
    const stock = await task.run();
    if (!stockHasContent(stock)) return null;
    return {
      ...stock,
      source: stock.source || task.label,
      priority: task.priority,
    };
  }));

  const candidates = results
    .filter((result) => result.status === "fulfilled" && result.value)
    .map((result) => result.value);

  if (candidates.length) {
    return chooseBestStock(candidates);
  }

  return {
    description: "Nao consegui buscar o stock agora. Tente de novo em alguns minutos ou troque STOCK_API_URL no Railway.",
    normal: [],
    mirage: [],
    photos: [],
    imageUrl: "",
    rawSummary: "A API configurada retornou vazio e o fallback tambem falhou.",
    source: "",
  };
}

async function fetchFruityBloxStock() {
  const actionId = await getFruityBloxActionId();
  const text = await fetchText(FRUITYBLOX_STOCK_URL, {
    method: "POST",
    headers: {
      Accept: "text/x-component",
      "Cache-Control": "no-cache",
      "Content-Type": "text/plain;charset=UTF-8",
      "Next-Action": actionId,
      "Next-Router-State-Tree": FRUITYBLOX_ROUTER_STATE_TREE,
      Origin: "https://fruityblox.com",
      Pragma: "no-cache",
      Referer: FRUITYBLOX_STOCK_URL,
      "User-Agent": "VoidLegionsDiscordBot/1.0",
    },
    body: "[]",
    timeoutMs: 12000,
  });

  const data = parseFruityBloxResponse(text);
  if (!data) {
    throw new Error("FruityBlox nao retornou payload de stock.");
  }

  return normalizeFruityBloxStock(data);
}

async function getFruityBloxActionId() {
  if (fruityBloxActionCache.id && fruityBloxActionCache.expiresAt > Date.now()) {
    return fruityBloxActionCache.id;
  }

  const html = await fetchText(FRUITYBLOX_STOCK_URL, {
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache", "User-Agent": "VoidLegionsDiscordBot/1.0" },
    timeoutMs: 12000,
  }).catch(() => "");

  const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)]
    .map((match) => absoluteUrl(match[1], FRUITYBLOX_STOCK_URL))
    .filter(Boolean);

  for (const scriptUrl of scripts.reverse()) {
    const script = await fetchText(scriptUrl, {
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache", "User-Agent": "VoidLegionsDiscordBot/1.0" },
      timeoutMs: 8000,
    }).catch(() => "");
    const match = script.match(/"([a-f0-9]{32,})"[\s\S]{0,240}getStock/);
    if (match?.[1]) {
      fruityBloxActionCache = { id: match[1], expiresAt: Date.now() + 60 * 60 * 1000 };
      return match[1];
    }
  }

  fruityBloxActionCache = { id: FRUITYBLOX_ACTION_ID_FALLBACK, expiresAt: Date.now() + 10 * 60 * 1000 };
  return FRUITYBLOX_ACTION_ID_FALLBACK;
}

function parseFruityBloxResponse(text) {
  for (const line of String(text || "").split("\n")) {
    if (!line.includes("\"normal\"") || !line.includes("\"mirage\"")) continue;
    const json = line.replace(/^\d+:/, "");
    const parsed = tryParseJson(json);
    if (parsed?.normal || parsed?.mirage) return parsed;
  }
  return null;
}

function normalizeFruityBloxStock(data) {
  const normalItems = Array.isArray(data.normal) ? data.normal : [];
  const mirageItems = Array.isArray(data.mirage) ? data.mirage : [];

  return {
    description: "Stock live do FruityBlox, puxado do shop in-game.",
    normal: normalItems.map((item) => stockFruitLine(item.name, fruityBloxItemExtra(item))).filter(Boolean),
    mirage: mirageItems.map((item) => stockFruitLine(item.name, fruityBloxItemExtra(item))).filter(Boolean),
    photos: dedupePhotos([
      ...normalItems.map((item) => fruityBloxStockPhoto(item, "Normal")).filter(Boolean),
      ...mirageItems.map((item) => fruityBloxStockPhoto(item, "Mirage")).filter(Boolean),
    ]),
    imageUrl: "",
    rawSummary: "",
    source: "FruityBlox",
  };
}

function fruityBloxItemExtra(item) {
  return {
    beli: formatBeli(item.price),
    robux: formatRobux(item.robuxPrice),
    type: item.type || "",
  };
}

function fruityBloxStockPhoto(item, kind) {
  if (!item?.name) return null;
  return stockPhoto(item.name, kind, {
    ...fruityBloxItemExtra(item),
    imageUrl: absoluteUrl(item.image || "", FRUITYBLOX_STOCK_URL),
  });
}

function formatBeli(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `$${number.toLocaleString("en-US")}` : "";
}

function formatRobux(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `R$${number.toLocaleString("en-US")}` : "";
}

async function fetchConfiguredStock(url) {
  const data = await fetchJson(url, { timeoutMs: 10000 });
  const normalized = normalizeStock(data);
  normalized.source = `API configurada: ${url}`;
  return normalized;
}

function chooseBestStock(candidates) {
  return candidates
    .map((stock) => ({
      stock,
      score:
        (stock.priority || 0)
        + (stock.normal?.length || 0) * 5
        + (stock.mirage?.length || 0) * 4
        + (stock.photos?.length || 0) * 2
        + (stock.imageUrl ? 3 : 0),
    }))
    .sort((a, b) => b.score - a.score)[0].stock;
}

async function getApiStatus() {
  const stock = await fetchStock({ force: true }).catch((error) => ({
    error: error.message,
    normal: [],
    mirage: [],
    source: "",
  }));

  const roblox = await getRobloxProfile("Roblox").catch((error) => ({ error: error.message }));

  return {
    stock: stock.error
      ? `Falhou: \`${stock.error}\``
      : `OK - normal: **${stock.normal?.length || 0}**, mirage: **${stock.mirage?.length || 0}**`,
    roblox: roblox?.id ? `OK - usuario teste: **${roblox.name}** (\`${roblox.id}\`)` : `Falhou: \`${roblox?.error || "sem resposta"}\``,
    source: stock.source || "",
  };
}

async function fetchBloxInformerStock() {
  const html = await fetchText("https://bloxinformer.com/blox-fruits-stock/", {
    headers: { "User-Agent": "VoidLegionsDiscordBot/1.0" },
    timeoutMs: 10000,
  });

  const photos = [];
  const normal = parseBloxInformerSection(html, "Normal Stock", photos, "Normal");
  const mirage = parseBloxInformerSection(html, "Mirage Stock", photos, "Mirage");

  return {
    description: "Stock ao vivo com fallback externo. Normal gira a cada 4h e Mirage a cada 2h.",
    normal,
    mirage,
    photos,
    imageUrl: "",
    rawSummary: "",
    source: "BloxInformer",
  };
}

async function fetchBloxFruitsCalcStock() {
  const html = await fetchText("https://bloxfruitscalc.com/stock", {
    headers: { "User-Agent": "VoidLegionsDiscordBot/1.0" },
    timeoutMs: 10000,
  });

  const itemList = [...html.matchAll(/"name":"([^"]+) \((Normal Dealer|Mirage Dealer)\)"/g)];
  const normal = [];
  const mirage = [];
  const photos = [];

  for (const match of itemList) {
    const fruit = cleanHtml(match[1]);
    const line = stockFruitLine(fruit);
    const kind = match[2] === "Normal Dealer" ? "Normal" : "Mirage";
    const photo = stockPhoto(fruit, kind);
    if (photo) photos.push(photo);
    if (kind === "Normal") normal.push(line);
    if (kind === "Mirage") mirage.push(line);
  }

  return {
    description: "Stock sincronizado por dados estruturados. Normal gira a cada 4h e Mirage a cada 2h.",
    normal: [...new Set(normal)].slice(0, 20),
    mirage: [...new Set(mirage)].slice(0, 20),
    photos: dedupePhotos(photos),
    imageUrl: "",
    rawSummary: "",
    source: "BloxFruitsCalc structured data",
  };
}

function parseBloxInformerSection(html, heading, photos = [], kind = "Stock") {
  const start = html.indexOf(heading);
  if (start === -1) return [];

  const nextSection = html.indexOf("</section>", start);
  const section = html.slice(start, nextSection === -1 ? html.length : nextSection);
  const items = [];
  const regex = /<img[^>]+src="([^"]+)"[^>]+alt="([^"]+)"[\s\S]*?<h3[^>]*>([^<]+)<\/h3>[\s\S]*?<span[^>]*>\s*([^<]+?)\s*<\/span>[\s\S]*?Beli:<\/span>\s*<span[^>]*>([^<]+)<\/span>[\s\S]*?Robux:<\/span>\s*<span[^>]*>([^<]+)<\/span>/g;

  for (const match of section.matchAll(regex)) {
    const name = cleanHtml(match[3] || match[2]);
    const type = cleanHtml(match[4]);
    const beli = cleanHtml(match[5]);
    const robux = cleanHtml(match[6]);
    const imageUrl = absoluteUrl(match[1], "https://bloxinformer.com/");
    if (!name) continue;
    photos.push(stockPhoto(name, kind, { imageUrl, beli, robux, type }));
    items.push(stockFruitLine(name, { beli, robux, type }));
  }

  return items.slice(0, 20);
}

function stockFruitLine(name, extra = {}) {
  const key = normalizeFruitName(name);
  const meta = FRUIT_META[key] || {};
  const beli = extra.beli || meta.beli || "";
  const robux = extra.robux || meta.robux || "";
  const type = extra.type || meta.type || "";
  const parts = [];
  if (beli || robux) parts.push([beli, robux].filter(Boolean).join(" / "));
  if (type) parts.push(type);
  return `• **${cleanFruitName(name)}**${parts.length ? ` - ${parts.join(" - ")}` : ""}`;
}

function stockPhoto(name, kind, extra = {}) {
  const clean = cleanFruitName(name);
  const key = normalizeFruitName(clean);
  const meta = FRUIT_META[key] || {};
  const imageUrl = extra.imageUrl || meta.imageUrl || fruitImageUrl(clean);
  if (!imageUrl) return null;

  const beli = extra.beli || meta.beli || "";
  const robux = extra.robux || meta.robux || "";
  const type = extra.type || meta.type || "";
  const details = [beli || robux ? [beli, robux].filter(Boolean).join(" / ") : "", type]
    .filter(Boolean)
    .join(" - ");

  return { name: clean, kind, imageUrl, details };
}

function dedupePhotos(photos) {
  const seen = new Set();
  const result = [];
  for (const photo of photos) {
    if (!photo?.imageUrl) continue;
    const key = `${photo.kind}:${normalizeFruitName(photo.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(photo);
  }
  return result.slice(0, 18);
}

function fruitImageUrl(name) {
  const slug = cleanFruitName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug ? `https://bloxinformer.com/wp-content/themes/bloxinformer-theme/template-parts/tools/blox-fruits-stock/images/${slug}.webp` : "";
}

function absoluteUrl(value, base) {
  try {
    return new URL(value, base).href;
  } catch {
    return "";
  }
}

function cleanFruitName(name) {
  return String(name || "")
    .replace(/ Fruit$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripAccents(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeFruitName(name) {
  return cleanFruitName(name).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hydrateStock(stock, stale) {
  const now = Date.now();
  const hydrated = {
    description: stock.description || "Stock atual de Blox Fruits.",
    normal: (stock.normal || []).filter(Boolean),
    mirage: (stock.mirage || []).filter(Boolean),
    photos: dedupePhotos(stock.photos || []),
    imageUrl: stock.imageUrl || "",
    rawSummary: stock.rawSummary || "",
    source: stock.source || "",
    last: stock.last || [],
    before: stock.before || [],
    fetchedAt: stock.fetchedAt || now,
    expiresAt: stock.expiresAt || stockSoftExpireAt(),
    cached: Boolean(stock.cached),
    stale: Boolean(stale || stock.stale),
  };

  if (!hydrated.normal.length && stock.rawNormal?.length) hydrated.normal = stock.rawNormal.map((name) => stockFruitLine(name));
  if (!hydrated.mirage.length && stock.rawMirage?.length) hydrated.mirage = stock.rawMirage.map((name) => stockFruitLine(name));
  hydrated.photos = dedupePhotos([
    ...hydrated.photos,
    ...stockNamesFromLines(hydrated.normal, "Normal").map((name) => stockPhoto(name, "Normal")).filter(Boolean),
    ...stockNamesFromLines(hydrated.mirage, "Mirage").map((name) => stockPhoto(name, "Mirage")).filter(Boolean),
    ...(stock.rawNormal || []).map((name) => stockPhoto(name, "Normal")).filter(Boolean),
    ...(stock.rawMirage || []).map((name) => stockPhoto(name, "Mirage")).filter(Boolean),
  ]);

  return hydrated;
}

function markStockCacheState(stock, state) {
  return {
    ...stock,
    cached: Boolean(state.cached),
    stale: Boolean(state.stale),
    description: state.stale
      ? "Fonte live indisponivel agora. Mostrando o ultimo stock salvo em memoria."
      : stock.description,
  };
}

function stockNamesFromLines(lines, kind) {
  return (lines || [])
    .map((line) => {
      const bold = String(line).match(/\*\*([^*]+)\*\*/);
      const text = bold?.[1] || String(line).replace(/^[-â€¢•\s]+/, "").split(" - ")[0].split(":")[0];
      return cleanFruitName(text);
    })
    .filter(Boolean)
    .map((name) => ({ name, kind }))
    .map((item) => item.name);
}

function stockHash(stock) {
  return JSON.stringify({
    normal: stock.normal || [],
    mirage: stock.mirage || [],
    stale: Boolean(stock.stale),
  });
}

function stockKindHash(stock, kind) {
  return JSON.stringify({
    items: kind === "mirage" ? (stock.mirage || []) : (stock.normal || []),
    stale: Boolean(stock.stale),
  });
}

function updateLastStockHashes(stock, kinds = ["normal", "mirage"]) {
  for (const kind of normalizeStockKinds(kinds)) {
    lastStockHashes[kind] = stockKindHash(stock, kind);
  }
}

function normalizeStockKinds(kinds = "") {
  if (Array.isArray(kinds)) return kinds.filter((kind) => ["normal", "mirage"].includes(kind));
  if (["normal", "mirage"].includes(kinds)) return [kinds];
  return ["normal", "mirage"];
}

function stockSoftExpireAt() {
  if (config.stockCacheMinutes <= 0) return Date.now();
  return Math.min(nextStockRotationDate().getTime() + 60 * 1000, Date.now() + config.stockCacheMinutes * 60 * 1000);
}

function ensureStockSchedulerStarted(immediate = true) {
  if (stockSchedulerStarted || !hasStockTargets()) return;
  stockSchedulerStarted = true;
  if (immediate) postStockIfChanged(true).catch((error) => console.error("[STOCK]", error.message));
  setInterval(() => postStockIfChanged(false, currentStockRotationKinds()), config.stockIntervalMinutes * 60 * 1000);
  scheduleNextStockRotationPost();
}

function scheduleNextStockRotationPost() {
  if (stockRotationTimer) clearTimeout(stockRotationTimer);
  const next = nextStockRotationInfo();
  const delay = Math.max(1000, next.date.getTime() - Date.now() + 8000);
  stockRotationTimer = setTimeout(async () => {
    await pollStockAfterRotation(next.kinds);
    scheduleNextStockRotationPost();
  }, delay);
  console.log(`[STOCK] Proxima checagem de rotacao ${next.kind} agendada para ${next.date.toISOString()}`);
}

async function pollStockAfterRotation(kinds, attempt = 0, previousHashes = null) {
  const list = normalizeStockKinds(kinds);
  const before = previousHashes || Object.fromEntries(list.map((kind) => [kind, lastStockHashes[kind] || ""]));

  await postStockIfChanged(attempt === 0, list);
  const changed = list.some((kind) => lastStockHashes[kind] && lastStockHashes[kind] !== before[kind]);
  if (changed || attempt >= 12) return;

  setTimeout(() => {
    pollStockAfterRotation(list, attempt + 1, before).catch((error) => {
      console.error("[STOCK]", error.message);
    });
  }, 30 * 1000);
}

function nextStockRotationDate() {
  return nextStockRotationInfo().date;
}

function nextStockRotationInfo() {
  const normal = nextStockKindDate("normal");
  const mirage = nextStockKindDate("mirage");
  const date = new Date(Math.min(normal.getTime(), mirage.getTime()));
  const kinds = [];
  if (normal.getTime() === date.getTime()) kinds.push("normal");
  if (mirage.getTime() === date.getTime()) kinds.push("mirage");
  return { kind: kinds.join("+"), kinds, date };
}

function currentStockRotationKinds() {
  return nextStockRotationInfo().kinds.includes("normal") ? ["mirage"] : ["normal", "mirage"];
}

function hasStockTargets() {
  if (normalizeSnowflake(config.stockChannelId)) return true;
  return Object.values(data.guilds || {}).some((store) => normalizeSnowflake(store?.stockChannelId));
}

function stockTargetChannelIds() {
  const ids = new Set();
  if (normalizeSnowflake(config.stockChannelId)) ids.add(config.stockChannelId);
  for (const store of Object.values(data.guilds || {})) {
    if (normalizeSnowflake(store?.stockChannelId)) ids.add(store.stockChannelId);
  }
  return [...ids];
}

async function postStockIfChanged(firstRun, kinds = "") {
  try {
    const channelIds = stockTargetChannelIds();
    if (!channelIds.length) return;

    const stock = await fetchStock({ force: true });
    const checkKinds = normalizeStockKinds(kinds);
    const changedKinds = checkKinds.filter((item) => firstRun || stockKindHash(stock, item) !== lastStockHashes[item]);
    if (!changedKinds.length) return;

    updateLastStockHashes(stock, changedKinds);
    for (const channelId of channelIds) {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel?.isTextBased?.()) continue;
      const store = guildData(channel.guild.id);
      if (!store.stockChannelId) store.stockChannelId = channel.id;
      await upsertStockMessages(channel, store, stock, changedKinds).catch((error) => {
        console.error(`[STOCK] Nao consegui atualizar em ${channelId}: ${error.message}`);
      });
    }
    scheduleDataSave();
  } catch (error) {
    console.error("[STOCK]", error.message);
  }
}

async function upsertStockMessages(channel, store, stock, kinds = ["normal", "mirage"]) {
  const result = {};
  store.stockMessageIds ||= {};
  for (const kind of kinds) {
    if (!stockHasKind(stock, kind)) continue;
    result[kind] = await upsertStockMessage(channel, store, stock, kind);
  }
  return result;
}

async function upsertStockMessage(channel, store, stock, kind) {
  const payload = await stockMessagePayload(stock, channel.guild, kind);
  store.stockMessageIds ||= {};
  const message = await channel.send(payload);
  store.stockMessageIds[kind] = message.id;
  return message;
}

function stockHasKind(stock, kind) {
  return kind === "mirage" ? Boolean(stock.mirage?.length) : Boolean(stock.normal?.length);
}

function normalizeStock(data) {
  const parsed = typeof data === "string" ? tryParseJson(data) || data : data;
  const stock = {
    description: "",
    normal: [],
    mirage: [],
    photos: [],
    imageUrl: "",
    rawSummary: "",
    source: "",
  };

  if (!parsed || typeof parsed !== "object") {
    stock.rawSummary = String(parsed || "API sem resposta.");
    return stock;
  }

  stock.imageUrl = findImageUrl(parsed);
  stock.description = parsed.message || parsed.description || parsed.title || "";

  const normalCandidates = [
    parsed.normal,
    parsed.stock,
    parsed.regular,
    parsed.dealer,
    parsed.fruits,
    parsed.currentStock,
    parsed?.data?.normal,
    parsed?.data?.stock,
    parsed?.data?.fruits,
  ];

  const mirageCandidates = [
    parsed.mirage,
    parsed.mirageStock,
    parsed.advanced,
    parsed?.data?.mirage,
    parsed?.data?.mirageStock,
  ];

  stock.normal = flattenStock(normalCandidates);
  stock.mirage = flattenStock(mirageCandidates);
  stock.photos = dedupePhotos([
    ...extractStockPhotos(normalCandidates, "Normal"),
    ...extractStockPhotos(mirageCandidates, "Mirage"),
  ]);

  if (!stock.normal.length && !stock.mirage.length) {
    stock.rawSummary = summarizeObject(parsed);
  }

  return stock;
}

async function fetchFandomStock() {
  const data = await fetchJson("https://blox-fruits.fandom.com/api.php?action=parse&page=Blox_Fruits_%22Stock%22&prop=wikitext&format=json", {
    headers: { "User-Agent": "VoidLegionsDiscordBot/1.0" },
  });
  const text = data?.parse?.wikitext?.["*"] || "";
  const current = extractWikiStock(text, "Current");
  const last = extractWikiStock(text, "Last");
  const before = extractWikiStock(text, "Before");

  return {
    description: "A API principal veio vazia, entao usei o fallback da wiki. Mirage stock depende de API externa ou atualizacao manual.",
    normal: current.map((fruit) => `• **${fruit}**`),
    mirage: [],
    imageUrl: "",
    rawSummary: current.length ? "" : "Fallback respondeu, mas nao encontrei Current Stock.",
    source: "Blox Fruits Wiki via Fandom API",
    last,
    before,
  };
}

function extractWikiStock(text, key) {
  const regex = new RegExp(`\\|${key}\\s*=([^\\n]+)`, "i");
  const match = text.match(regex);
  if (!match) return [];

  return match[1]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function stockHasContent(stock) {
  if (!stock) return false;
  return Boolean(stock.normal.length || stock.mirage.length || stock.imageUrl);
}

function flattenStock(values) {
  const result = [];
  for (const value of values) {
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        const line = stockItemToLine(item);
        if (line) result.push(line);
      }
      continue;
    }
    if (typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        const line = stockItemToLine(item, key);
        if (line) result.push(line);
      }
      continue;
    }
    const line = stockItemToLine(value);
    if (line) result.push(line);
  }
  return [...new Set(result)].slice(0, 15);
}

function extractStockPhotos(values, kind) {
  const result = [];
  for (const value of values) {
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        const photo = stockItemToPhoto(item, "", kind);
        if (photo) result.push(photo);
      }
      continue;
    }
    if (typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        const photo = stockItemToPhoto(item, key, kind);
        if (photo) result.push(photo);
      }
    }
  }
  return result;
}

function stockItemToLine(item, key = "") {
  if (!item) return "";
  if (typeof item === "string") return `• ${item}`;
  if (typeof item === "number") return `• ${key}: ${item}`;

  const name = item.name || item.fruit || item.displayName || item.title || key;
  const price = item.price || item.value || item.cost || item.beli || item.money || "";
  const rarity = item.rarity || item.type || "";
  if (!name) return "";

  const details = [price, rarity].filter(Boolean).join(" - ");
  return `• **${name}**${details ? ` - ${details}` : ""}`;
}

function stockItemToPhoto(item, key = "", kind = "Stock") {
  if (!item || typeof item !== "object") return null;
  const name = item.name || item.fruit || item.displayName || item.title || key;
  if (!name) return null;
  return stockPhoto(name, kind, {
    imageUrl: findImageUrl(item),
    beli: item.price || item.value || item.cost || item.beli || item.money || "",
    robux: item.robux || item.robuxPrice || "",
    type: item.rarity || item.type || "",
  });
}

function findImageUrl(value) {
  if (!value || typeof value !== "object") return "";
  for (const [key, item] of Object.entries(value)) {
    if (/image|img|thumbnail|url/i.test(key) && typeof item === "string" && /^https?:\/\//.test(item)) {
      return item;
    }
    if (item && typeof item === "object") {
      const nested = findImageUrl(item);
      if (nested) return nested;
    }
  }
  return "";
}

function summarizeObject(value) {
  const text = JSON.stringify(value, null, 2);
  return text.length > 1000 ? `${text.slice(0, 1000)}...` : text;
}

async function fetchJson(url, options = {}) {
  const { timeoutMs = 15000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    return tryParseJson(text) ?? text;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url, options = {}) {
  const { timeoutMs = 15000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveChannel(guild, channelId) {
  if (!channelId) return null;
  return guild.channels.fetch(channelId).catch(() => null);
}

function safeField(value) {
  const clean = String(value || "").trim();
  return clean.length ? clean.slice(0, 1000) : "Nao informado";
}

function cleanHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function hidden(payload) {
  return { ...payload, flags: EPHEMERAL };
}

async function sendInteractionError(interaction, error) {
  const message = friendlyInteractionError(error);
  const payload = hidden({ content: message });

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload).catch(() => {});
    return;
  }

  await interaction.reply(payload).catch(() => {});
}

function friendlyInteractionError(error) {
  const code = error?.code ? ` \`${error.code}\`` : "";
  const raw = String(error?.message || "");

  if (error?.code === 50013 || /Missing Permissions/i.test(raw)) {
    return `Nao consegui executar: falta permissao para o bot.${code}\nConfira se o cargo do bot fica acima dos cargos que ele vai aplicar e se ele pode enviar mensagem no canal escolhido.`;
  }

  if (error?.code === 50001 || /Missing Access/i.test(raw)) {
    return `Nao consegui acessar esse canal/cargo.${code}\nVeja se o bot tem acesso ao canal de aplicacoes e ao cargo selecionado.`;
  }

  if (error?.code === 50035 || /Invalid Form Body/i.test(raw)) {
    return `O Discord recusou algum dado do comando.${code}\nRegistre os comandos de novo com \`REGISTER_COMMANDS=true\` e recrie o painel.`;
  }

  if (error?.code === 10062 || /Unknown interaction/i.test(raw)) {
    return `Essa interacao expirou antes do bot responder.${code}\nTente de novo. Se continuar, o Railway pode estar demorando para responder.`;
  }

  return `Deu erro ao executar isso.${code}\nDetalhe: \`${safeField(raw || error?.name || "erro desconhecido").slice(0, 250)}\``;
}

async function safeDeferReply(interaction, payload = {}) {
  try {
    if (interaction.deferred || interaction.replied) return true;
    await interaction.deferReply(payload);
    return true;
  } catch (error) {
    if (isUnknownInteractionError(error)) {
      console.warn("[INTERACTION] Nao consegui dar defer: interacao expirou antes da resposta.");
      return false;
    }
    throw error;
  }
}

async function safeDeferUpdate(interaction) {
  try {
    if (interaction.deferred || interaction.replied) return true;
    await interaction.deferUpdate();
    return true;
  } catch (error) {
    if (isUnknownInteractionError(error)) {
      console.warn("[INTERACTION] Nao consegui atualizar botao: interacao expirou antes da resposta.");
      return false;
    }
    throw error;
  }
}

function isUnknownInteractionError(error) {
  return error?.code === 10062 || error?.rawError?.code === 10062;
}

async function safeEditReply(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(payload);
    }
    return await interaction.reply(payload);
  } catch (error) {
    if (error?.code === 10008 || error?.code === 10062 || error?.code === 40060) {
      return interaction.followUp(payload).catch(() => null);
    }
    throw error;
  }
}

function parseColor(value) {
  const clean = String(value).replace("#", "").trim();
  const parsed = Number.parseInt(clean, 16);
  return Number.isFinite(parsed) ? parsed : 0x7b2cff;
}

function parseServices(raw) {
  const fallback = [
    { name: "Raid", price: "A combinar", description: "Ajuda para organizar e completar raid." },
    { name: "Trial", price: "A combinar", description: "Organizacao de trial e ajuda com grupo." },
    { name: "Ajuda em Boss", price: "A combinar", description: "Suporte para boss, ilha e farm." },
    { name: "Trade / Middleman", price: "Gratuito ou definido pela staff", description: "Canal seguro para negociar com acompanhamento." },
  ];

  if (!raw) return fallback;
  const parsed = tryParseJson(raw);
  if (!Array.isArray(parsed)) return fallback;
  return parsed
    .filter((item) => item && item.name)
    .slice(0, 10)
    .map((item) => ({
      name: String(item.name).slice(0, 80),
      price: String(item.price || "A combinar").slice(0, 80),
      description: String(item.description || "Sem descricao").slice(0, 200),
    }));
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function startPresenceRotation() {
  const activities = config.activities.length
    ? config.activities
    : [
      `${config.brandName} | /setup-recrutamento`,
      "aplicacoes e stock ao vivo",
      "Roblox, tickets e moderacao",
    ];
  let index = 0;

  const update = () => {
    const name = activities[index % activities.length];
    client.user.setActivity(name, { type: ActivityType.Watching });
    index += 1;
  };

  update();
  setInterval(update, 20000);
}

function nextRotationText(hours) {
  const next = nextRotationDate(hours);
  return `<t:${Math.floor(next.getTime() / 1000)}:R>`;
}

function nextStockRotationText(kind) {
  const next = nextStockKindDate(kind);
  return `<t:${Math.floor(next.getTime() / 1000)}:R>`;
}

function nextRotationClock(hours) {
  const next = nextRotationDate(hours);
  return formatStockRotationClock(next);
}

function nextStockRotationClock(kind) {
  return formatStockRotationClock(nextStockKindDate(kind));
}

function formatStockRotationClock(next) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: config.timezone,
    }).format(next);
  } catch {
    return `${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`;
  }
}

function nextStockKindDate(kind) {
  const offset = kind === "mirage" ? config.stockMirageOffsetHour : config.stockNormalOffsetHour;
  return nextRotationDate(4, offset);
}

function nextRotationDate(hours, offsetOverride = null) {
  const offset = offsetOverride ?? (hours === 4 ? config.stockNormalOffsetHour : config.stockMirageOffsetHour);
  const now = new Date();
  const parts = timeZoneParts(now);
  const baseHour = Math.floor((parts.hour - offset) / hours) * hours + offset;
  let nextHour = baseHour + hours;
  let year = parts.year;
  let month = parts.month;
  let day = parts.day;

  if (nextHour >= 24) {
    nextHour -= 24;
    const nextDay = addUtcDays({ year, month, day }, 1);
    year = nextDay.year;
    month = nextDay.month;
    day = nextDay.day;
  }

  return dateFromTimeZoneParts({ year, month, day, hour: nextHour, minute: 0 });
}

function timeZoneParts(date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? 0 : parts.hour),
    minute: Number(parts.minute),
  };
}

function dateFromTimeZoneParts(target) {
  let utc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, 0, 0);
  for (let index = 0; index < 3; index += 1) {
    const current = timeZoneParts(new Date(utc));
    const currentWall = Date.UTC(current.year, current.month - 1, current.day, current.hour, current.minute, 0, 0);
    const targetWall = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, 0, 0);
    utc -= currentWall - targetWall;
  }
  return new Date(utc);
}

function addUtcDays(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 0, 0, 0, 0));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function getApplicationTargetFromCommand(interaction) {
  const channel = interaction.options.getChannel("canal_aplicacoes", false);
  return channel?.id || config.applicationReviewChannelId || config.applicationLogChannelId || "";
}

function getRecruitmentCategoryFromCommand(interaction) {
  const category = interaction.options.getChannel("categoria_recrutamento", false);
  return category?.id || config.recruitmentCategoryId || "";
}

async function ensurePanelTarget(interaction, channel) {
  if (!channel?.isTextBased?.()) {
    await interaction.reply(hidden({ content: "Escolha um canal de texto valido para enviar o painel/embed." }));
    return false;
  }

  const botMember = await interaction.guild.members.fetchMe().catch(() => null);
  const permissions = botMember ? channel.permissionsFor(botMember) : null;
  const missing = [
    [PermissionFlagsBits.ViewChannel, "Ver canal"],
    [PermissionFlagsBits.SendMessages, "Enviar mensagens"],
    [PermissionFlagsBits.EmbedLinks, "Inserir embeds"],
  ]
    .filter(([permission]) => !permissions?.has(permission))
    .map(([, label]) => label);

  if (missing.length) {
    await interaction.reply(hidden({
      content: `Nao consigo enviar em ${channel}. Falta permissao: **${missing.join(", ")}**.`,
    }));
    return false;
  }

  return true;
}

async function ensureRecruitmentCategory(interaction, category) {
  if (!category || category.type !== ChannelType.GuildCategory) {
    await interaction.reply(hidden({ content: "Escolha uma categoria valida para os canais de recrutamento." }));
    return false;
  }

  const botMember = await interaction.guild.members.fetchMe().catch(() => null);
  const permissions = botMember ? category.permissionsFor(botMember) : null;
  const missing = [
    [PermissionFlagsBits.ViewChannel, "Ver categoria"],
    [PermissionFlagsBits.ManageChannels, "Gerenciar canais"],
  ]
    .filter(([permission]) => !permissions?.has(permission))
    .map(([, label]) => label);

  if (missing.length) {
    await interaction.reply(hidden({
      content: `Nao consigo criar canais em **${category.name}**. Falta permissao: **${missing.join(", ")}**.`,
    }));
    return false;
  }

  return true;
}

async function ensureApplicationTarget(interaction, targetChannelId) {
  if (!normalizeSnowflake(targetChannelId)) {
    await interaction.reply(hidden({
      content: "Escolha `canal_aplicacoes` no comando para definir onde a equipe vai analisar as aplicacoes.",
    }));
    return false;
  }

  const channel = await resolveChannel(interaction.guild, targetChannelId);
  if (!channel?.isTextBased?.()) {
    await interaction.reply(hidden({
      content: "Nao achei o canal de aplicacoes ou ele nao aceita mensagens.",
    }));
    return false;
  }

  const botMember = await interaction.guild.members.fetchMe().catch(() => null);
  const permissions = botMember ? channel.permissionsFor(botMember) : null;
  const missing = [
    [PermissionFlagsBits.ViewChannel, "Ver canal"],
    [PermissionFlagsBits.SendMessages, "Enviar mensagens"],
    [PermissionFlagsBits.EmbedLinks, "Inserir embeds"],
  ]
    .filter(([permission]) => !permissions?.has(permission))
    .map(([, label]) => label);

  if (missing.length) {
    await interaction.reply(hidden({
      content: `Nao consigo usar ${channel}. Falta permissao: **${missing.join(", ")}**.`,
    }));
    return false;
  }

  return true;
}

async function ensureStockTarget(interaction, channel) {
  if (!channel?.isTextBased?.()) {
    await safeEditReply(interaction, "Nao achei o canal de stock ou ele nao aceita mensagens.");
    return false;
  }

  const botMember = await interaction.guild.members.fetchMe().catch(() => null);
  const permissions = botMember ? channel.permissionsFor(botMember) : null;
  const missing = [
    [PermissionFlagsBits.ViewChannel, "Ver canal"],
    [PermissionFlagsBits.SendMessages, "Enviar mensagens"],
    [PermissionFlagsBits.EmbedLinks, "Inserir embeds"],
    [PermissionFlagsBits.AttachFiles, "Anexar arquivos"],
  ]
    .filter(([permission]) => !permissions?.has(permission))
    .map(([, label]) => label);

  if (missing.length) {
    await safeEditReply(interaction, `Nao consigo postar stock em ${channel}. Falta permissao: **${missing.join(", ")}**.`);
    return false;
  }

  return true;
}

function getApprovedRoleFromCommand(interaction, fallbackRoleId = "") {
  const role = interaction.options.getRole("cargo_aprovado", false);
  return role?.id || fallbackRoleId || "";
}

function getApplicationRolesFromCommand(interaction) {
  return {
    staffRoleId: interaction.options.getRole("cargo_staff", false)?.id || config.staffRoleId || "",
    captainRoleId: interaction.options.getRole("cargo_capitao", false)?.id || config.captainRoleId || "",
    memberRoleId: interaction.options.getRole("cargo_membro", false)?.id || config.memberRoleId || "",
  };
}

function buildApplyCustomId(prefix, targetChannelId = "default", roleId = "", categoryId = "") {
  return `${prefix}:${targetChannelId || "default"}:${normalizeSnowflake(roleId) || "none"}:${normalizeSnowflake(categoryId) || "none"}`;
}

function getCustomIdTarget(customId) {
  const parts = String(customId).split(":");
  const target = parts[1];
  return target && target !== "default" && /^\d{10,25}$/.test(target) ? target : "";
}

function getCustomIdRole(customId) {
  const parts = String(customId).split(":");
  return normalizeSnowflake(parts[2]);
}

function getCustomIdCategory(customId) {
  const parts = String(customId).split(":");
  return normalizeSnowflake(parts[3]);
}

function slugChannelName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function parseOptionalColor(value) {
  if (!value) return null;
  const clean = String(value).replace("#", "").trim();
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null;
  return Number.parseInt(clean, 16);
}

function normalizeSnowflake(value) {
  const text = String(value || "").trim();
  return /^\d{10,25}$/.test(text) ? text : "";
}

function roleMention(roleId) {
  const clean = normalizeSnowflake(roleId);
  return clean ? `<@&${clean}>` : "Nenhum cargo configurado";
}

function parseUrlList(raw) {
  return String(raw || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
}

function parseIdList(raw) {
  return String(raw || "")
    .split(",")
    .map((value) => normalizeSnowflake(value))
    .filter(Boolean);
}

function parseActivityList(raw) {
  return String(raw || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function parseBadWords(raw) {
  const defaults = [
    "fdp",
    "porra",
    "caralho",
    "merda",
    "vai se fuder",
    "arrombado",
    "desgracado",
    "desgraçado",
    "lixo",
  ];
  const custom = String(raw || "")
    .split(/[|,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set([...(custom.length ? custom : defaults)].map((item) => item.toLowerCase()))].slice(0, 80);
}

function parseEmojiConfig(raw) {
  const parsed = tryParseJson(raw || "{}");
  return parsed && typeof parsed === "object" ? parsed : {};
}

function emo(guild, key) {
  const value = emojiValue(guild, key);
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.animated ? `<a:${value.name}:${value.id}>` : `<:${value.name}:${value.id}>`;
}

function emojiText(guild, key) {
  const value = emojiValue(guild, key);
  return typeof value === "string" ? value : (DEFAULT_EMOJIS[key] || "");
}

function emojiValue(guild, key) {
  if (!key) return "";

  const envValue = process.env[`EMOJI_${String(key).toUpperCase()}`] || config.emoji[key];
  const parsedEnv = parseEmoji(envValue, guild, key);
  if (parsedEnv) return parsedEnv;

  const custom = findGuildEmoji(guild, key);
  if (custom) return { id: custom.id, name: custom.name, animated: custom.animated };

  return DEFAULT_EMOJIS[key] || "";
}

function parseEmoji(value, guild, key) {
  if (!value) return null;
  const text = String(value).trim();
  const custom = text.match(/^<(?<animated>a?):(?<name>[a-zA-Z0-9_]+):(?<id>\d+)>$/);
  if (custom?.groups) {
    return {
      id: custom.groups.id,
      name: custom.groups.name,
      animated: custom.groups.animated === "a",
    };
  }
  if (/^\d{10,25}$/.test(text)) {
    const guildEmoji = guild?.emojis?.cache?.get(text);
    return {
      id: text,
      name: guildEmoji?.name || emojiNameForKey(key),
      animated: Boolean(guildEmoji?.animated),
    };
  }
  return text;
}

function findGuildEmoji(guild, key) {
  if (!guild?.emojis?.cache) return null;
  const names = EMOJI_NAMES[key] || [key];
  return guild.emojis.cache.find((emoji) => names.includes(emoji.name));
}

function emojiNameForKey(key) {
  return (EMOJI_NAMES[key] || [key, "emoji"]).find(Boolean);
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

const DEFAULT_EMOJIS = {
  add: "➕",
  api: "🔌",
  approve: "✅",
  boost: "💎",
  brain: "🧠",
  call: "📨",
  captain: "🏴‍☠️",
  deny: "❌",
  form: "📝",
  claim: "🙋",
  close: "🔒",
  clock: "🕒",
  leave: "🚪",
  logs: "📚",
  member: "👤",
  mirage: "🌌",
  money: "💰",
  normal: "🛒",
  ping: "🛰️",
  pin: "📌",
  pirate: "🏴‍☠️",
  recruit: "👑",
  refresh: "🔄",
  rocket: "🚀",
  server: "🏰",
  spark: "✨",
  staff: "🛡️",
  stock: "🌙",
  support: "🛠️",
  sword: "⚔️",
  ticket: "🎫",
  warn: "⚠️",
};

Object.assign(DEFAULT_EMOJIS, {
  add: "➕",
  api: "🔌",
  approve: "✅",
  boost: "💎",
  brain: "🧠",
  call: "📨",
  captain: "🏴‍☠️",
  deny: "❌",
  form: "📝",
  claim: "🙋",
  close: "🔒",
  clock: "⏳",
  leave: "🚪",
  logs: "📚",
  member: "👤",
  mirage: "🌌",
  money: "💰",
  normal: "📦",
  ping: "🛰️",
  pin: "📌",
  pirate: "🏴‍☠️",
  recruit: "👑",
  refresh: "🔄",
  rocket: "🚀",
  server: "🏰",
  spark: "✨",
  staff: "🛡️",
  stock: "🌙",
  support: "🛠️",
  sword: "⚔️",
  ticket: "🎫",
  warn: "⚠️",
});

const EMOJI_NAMES = {
  add: ["vl_add", "void_add", "add", "adicionar"],
  api: ["vl_api", "void_api", "api"],
  approve: ["vl_aprovar", "void_aprovar", "aprovar", "approve"],
  boost: ["vl_boost", "void_boost", "boost"],
  brain: ["vl_cerebro", "void_cerebro", "brain"],
  call: ["vl_dm", "void_dm", "dm", "call"],
  captain: ["vl_capitao", "void_capitao", "capitao", "captain"],
  deny: ["vl_reprovar", "void_reprovar", "reprovar", "deny"],
  form: ["vl_form", "void_form", "form"],
  claim: ["vl_assumir", "void_assumir", "assumir", "claim"],
  close: ["vl_fechar", "void_fechar", "fechar", "close"],
  clock: ["vl_clock", "void_clock", "clock", "relogio"],
  leave: ["vl_sair", "void_sair", "sair", "leave"],
  logs: ["vl_logs", "void_logs", "logs"],
  member: ["vl_membro", "void_membro", "membro", "member"],
  mirage: ["vl_mirage", "void_mirage", "mirage"],
  money: ["vl_money", "void_money", "money"],
  normal: ["vl_normal", "void_normal", "normal"],
  ping: ["vl_ping", "void_ping", "ping"],
  pin: ["vl_pin", "void_pin", "pin"],
  pirate: ["vl_pirata", "void_pirata", "pirata", "pirate"],
  recruit: ["vl_rec", "void_rec", "rec", "recruit"],
  refresh: ["vl_refresh", "void_refresh", "refresh"],
  rocket: ["vl_rocket", "void_rocket", "rocket"],
  server: ["vl_server", "void_server", "server"],
  spark: ["vl_spark", "void_spark", "spark"],
  staff: ["vl_staff", "void_staff", "staff"],
  stock: ["vl_stock", "void_stock", "stock"],
  support: ["vl_suporte", "void_suporte", "suporte", "support"],
  sword: ["vl_sword", "void_sword", "sword"],
  ticket: ["vl_ticket", "void_ticket", "ticket"],
  warn: ["vl_warn", "void_warn", "warn"],
};

const PIXEL_FONT = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  ",": ["00000", "00000", "00000", "00000", "00000", "00100", "01000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
};

const FRUIT_META = Object.fromEntries([
  ["Rocket", "$5,000", "R$50", "Natural"],
  ["Spin", "$7,500", "R$75", "Natural"],
  ["Blade", "$30,000", "R$100", "Natural"],
  ["Spring", "$60,000", "R$180", "Natural"],
  ["Bomb", "$80,000", "R$220", "Natural"],
  ["Smoke", "$100,000", "R$250", "Elemental"],
  ["Spike", "$180,000", "R$380", "Natural"],
  ["Flame", "$250,000", "R$550", "Elemental"],
  ["Falcon", "$300,000", "R$650", "Beast"],
  ["Ice", "$350,000", "R$750", "Elemental"],
  ["Sand", "$420,000", "R$850", "Elemental"],
  ["Dark", "$500,000", "R$950", "Elemental"],
  ["Diamond", "$600,000", "R$1,000", "Natural"],
  ["Light", "$650,000", "R$1,100", "Elemental"],
  ["Rubber", "$750,000", "R$1,200", "Natural"],
  ["Barrier", "$800,000", "R$1,250", "Natural"],
  ["Ghost", "$940,000", "R$1,275", "Natural"],
  ["Magma", "$960,000", "R$1,300", "Elemental"],
  ["Quake", "$1,000,000", "R$1,500", "Natural"],
  ["Buddha", "$1,200,000", "R$1,650", "Beast"],
  ["Love", "$1,300,000", "R$1,700", "Natural"],
  ["Creation", "$1,400,000", "R$1,750", "Natural"],
  ["Spider", "$1,500,000", "R$1,800", "Natural"],
  ["Sound", "$1,700,000", "R$1,900", "Natural"],
  ["Phoenix", "$1,800,000", "R$2,000", "Beast"],
  ["Portal", "$1,900,000", "R$2,000", "Natural"],
  ["Rumble", "$2,100,000", "R$2,100", "Elemental"],
  ["Pain", "$2,300,000", "R$2,200", "Natural"],
  ["Blizzard", "$2,400,000", "R$2,250", "Elemental"],
  ["Gravity", "$2,500,000", "R$2,300", "Natural"],
  ["Mammoth", "$2,700,000", "R$2,350", "Beast"],
  ["T-Rex", "$2,700,000", "R$2,350", "Beast"],
  ["Dough", "$2,800,000", "R$2,400", "Elemental"],
  ["Shadow", "$2,900,000", "R$2,425", "Natural"],
  ["Venom", "$3,000,000", "R$2,450", "Natural"],
  ["Control", "$3,200,000", "R$2,500", "Natural"],
  ["Gas", "$3,200,000", "R$2,500", "Elemental"],
  ["Spirit", "$3,400,000", "R$2,550", "Natural"],
  ["Leopard", "$5,000,000", "R$3,000", "Beast"],
  ["Yeti", "$5,000,000", "R$3,000", "Beast"],
  ["Kitsune", "$8,000,000", "R$4,000", "Beast"],
  ["Dragon", "$15,000,000", "R$5,000", "Beast"],
].map(([name, beli, robux, type]) => [
  normalizeFruitName(name),
  { name, beli, robux, type, imageUrl: fruitImageUrl(name) },
]));

if (!config.token) {
  console.error("DISCORD_TOKEN nao configurado.");
  process.exit(1);
}

client.login(config.token);
