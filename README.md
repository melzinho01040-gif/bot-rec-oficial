# Void Legions Rec Bot

Bot de Discord em `index.js` com paineis modernos, embeds, recrutamento, Roblox, tickets, moderacao e stock de Blox Fruits.

## Principais recursos

- Paineis de Staff, Capitao e Recrutamento com botoes e modais.
- `/recrutamento setup` cria um painel em qualquer canal e abre um canal individual por candidato dentro da categoria escolhida.
- `/central embed` cria embeds personalizadas direto pelo Discord.
- Aplicacoes chegam em embed com botoes de Aprovar, Recusar e Enviar DM.
- Consulta Roblox, avatar, serverinfo, limpeza, lock/unlock, ban, mute/unmute.
- Tickets, precos, stock automatico, ranking/XP e ferramentas extras da crew.
- Stock visual mostra nome da fruta, valor em Beli limpo e proxima atualizacao no horario da rotacao do Blox Fruits.
- Auditoria em embed para recrutamento, aprovacoes, recusas, torneios, eventos e PVP.
- Sistemas `/torneio participante`, `/evento confirmar` e `/pvp duelo`.

## Railway

1. Crie um projeto no Railway e envie estes arquivos.
2. Em `Variables`, configure pelo menos:
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
   - `GUILD_ID`
   - `REGISTER_COMMANDS=true`
3. Faca o deploy.
4. Depois que os comandos aparecerem no servidor, troque `REGISTER_COMMANDS` para `false`.

Nao precisa criar `.env`; o bot le tudo pelas variaveis do Railway.

## Comandos novos

### `/recrutamento setup`

Use este comando para criar o painel de recrutamento impecavel:

- `categoria`: categoria onde cada formulario vai criar um canal privado.
- `canal_painel`: canal onde o painel sera enviado. Se vazio, usa o canal atual.
- `canal_aplicacoes`: canal opcional para fallback/logs.
- `cargo_membro`: cargo aplicado quando o candidato for aprovado.
- `banner_url`: imagem grande opcional do painel.

Quando alguem clicar em Recrutamento e enviar o formulario, o bot cria um canal `rec-nome-da-pessoa` dentro da categoria e envia as respostas em embed.

### `/central embed`

Cria uma embed personalizada:

- `canal`
- `titulo`
- `descricao`
- `cor`
- `imagem_url`
- `thumbnail_url`
- `rodape`

### `/setup-stock`

Envia o painel de stock no canal escolhido e ativa atualizacao automatica. O bot faz uma checagem rapida de seguranca e tambem agenda postagem nos horarios de rotacao:

- Normal Stock: a cada 4 horas.
- Mirage Stock: a cada 4 horas, alternando com o Normal.

O ciclo padrao fica igual ao Blox Fruits:

- Normal: 01:00, 05:00, 09:00, 13:00, 17:00, 21:00.
- Mirage: 03:00, 07:00, 11:00, 15:00, 19:00, 23:00.

Os offsets podem ser ajustados pelas variaveis `STOCK_NORMAL_OFFSET_HOUR` e `STOCK_MIRAGE_OFFSET_HOUR`.

### `/auditoria setup`

Define o canal onde o bot registra logs bonitos em embed.

### `/torneio participante`

Confirma participante do torneio PVP com bounty e plataforma.

### `/evento confirmar`

Confirma evento e pontuacao de um jogador.

### `/pvp duelo`

Marca duelo PVP com dois jogadores, data, hora e imagem opcional.

## Variaveis opcionais

- `APPLICATION_LOG_CHANNEL_ID`
- `APPLICATION_REVIEW_CHANNEL_ID`
- `AUDIT_LOG_CHANNEL_ID`
- `PART_CREW_ROLE_ID`
- `RECRUITMENT_CATEGORY_ID`
- `STOCK_CHANNEL_ID`
- `BOOST_CHANNEL_ID`
- `TICKET_CATEGORY_ID`
- `STAFF_ROLE_ID`
- `CAPTAIN_ROLE_ID`
- `MEMBER_ROLE_ID`
- `STOCK_API_URL`
- `STOCK_INTERVAL_MINUTES`
- `BRAND_NAME`
- `BRAND_COLOR`
- `BANNER_URL`
- `LOGO_URL`
- `SERVICES_JSON`

## Permissoes do Bot

Convide o bot com `applications.commands`, `bot` e permissoes de:

- Manage Channels
- Manage Roles
- Moderate Members
- Ban Members
- Send Messages
- Embed Links
- Attach Files
- Read Message History

O cargo do bot precisa ficar acima dos cargos que ele vai aplicar ou moderar.

Para a troca automatica na aprovacao, o padrao deste bot remove o cargo temporario `1508588131975299073` e aplica o cargo da crew `1508588125365207120`. Voce ainda pode mudar isso pelo Railway usando `PART_CREW_ROLE_ID` e `MEMBER_ROLE_ID`.

O stock automatico usa mensagens separadas para Normal e Mirage. Depois de atualizar para esta versao, rode `/setup-stock` uma vez de novo para criar/registrar as duas mensagens separadas.
