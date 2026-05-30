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
- Mirage Stock: a cada 2 horas.

Os offsets podem ser ajustados pelas variaveis `STOCK_NORMAL_OFFSET_HOUR` e `STOCK_MIRAGE_OFFSET_HOUR`.

## Variaveis opcionais

- `APPLICATION_LOG_CHANNEL_ID`
- `APPLICATION_REVIEW_CHANNEL_ID`
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
