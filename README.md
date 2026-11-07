# VEYRATH — MMORPG Online de Fantasia, Aventura e Economia Viva

Versão 0.1 — primeira fatia vertical jogável.

## O que é

VEYRATH é um MMORPG para navegador: fantasia medieval, combate em tempo real, sobrevivência leve, exploração, economia dinâmica entre jogadores e NPCs, homúnculos, grupos, chat e masmorras cooperativas.

O mundo continua evoluindo mesmo quando você está offline: NPCs produzem, comerciam e consomem; monstros reaparecem; preços variam com estoque e demanda.

## Estrutura do repositório

- `shared/` — tipos, protocolo de rede e conteúdo do jogo (itens, monstros, raças, classes, missões), compartilhado entre cliente e servidor.
- `server/` — servidor Node.js + TypeScript (WebSocket autoritativo), persistência (SQLite em desenvolvimento local / PostgreSQL via `DATABASE_URL`), simulação de mundo, combate, economia e autenticação.
- `client/` — cliente Phaser 3 + TypeScript + Vite: renderização 2D pixel art, interface, áudio procedural e rede.
- `server/migrations/` — migrações de banco de dados.
- `ASSET_CREDITS.md` — créditos e licenças de recursos utilizados.

## Tecnologias

Cliente: TypeScript, Phaser 3, Vite, HTML5/CSS.
Servidor: Node.js, TypeScript, WebSocket (`ws`), Express (health check), `better-sqlite3` (dev local), `pg` (PostgreSQL em produção).
Banco: SQLite em modo local; PostgreSQL quando `VEYRATH_MODE=producao` e `DATABASE_URL` estão configurados.

## Começando (desenvolvimento local)

```bash
# 1. Instale dependências de todos os pacotes
npm install

# 2. Copie o exemplo de ambiente
cp .env.example .env   # VEYRATH_MODE=local já vem por padrão

# 3. Rode as migrações e seed (banco local em server/data/veyrath.db)
npm run db:migrate
npm run db:seed

# 4. Inicie o servidor (terminal A)
npm run dev:server   # escuta em http://0.0.0.0:4000 + WebSocket /ws

# 5. Inicie o cliente (terminal B)
npm run dev:client   # escuta em http://localhost:5173

# 6. Abra http://localhost:5173 em dois navegadores para testar multijogador real
```

### Modo de desenvolvimento local (identificado)

Quando `VEYRATH_MODE=local` (padrão), o servidor usa SQLite em arquivo local e exibe um aviso no console:

```
[VEYRATH] MODO DE DESENVOLVIMENTO LOCAL — Banco SQLite, sem PostgreSQL configurado.
```

Não finja que o jogo está online globalmente. Para publicar online, configure `VEYRATH_MODE=producao`, `DATABASE_URL` (PostgreSQL) e rode as migrações no banco remoto.

## Testes

```bash
npm test
```

## Próximos passos (critérios de aceitação da v0.1)

- [x] Tela inicial e criação de conta / modo local
- [x] Criação de personagem (5 raças × 4 classes)
- [x] Cidade de Lumenfall com regiões internas
- [x] Pradarias de Brumaflor e Bosque dos Sussurros
- [x] Seis monstros iniciais com IA própria
- [x] Combate em tempo real autoritativo no servidor
- [x] Inventário, equipamentos e alimentação
- [x] Pelo menos uma missão solo e uma cooperativa
- [x] Masmorra Raízes Afundadas com chefe (3 fases)
- [x] NPCs econômicos com produção simulada
- [x] Mercado básico entre jogadores e NPCs
- [x] Criação inicial de homúnculos
- [x] Grupos e chat multijogador
- [x] Salvamento persistente
- [x] Efeitos sonoros e música (procedurais/originais)
- [x] Interface completa para os sistemas incluídos

## Publicação online

Consulte `docs/PUBLICACAO.md` para requisitos de servidor, banco PostgreSQL, variáveis de ambiente e proxy reverso.
