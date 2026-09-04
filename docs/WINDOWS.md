# Instalando na máquina do Mais Cidadão (Windows)

Este é o roteiro da instalação física: a máquina Windows que vai ficar rodando o
servidor, e da qual os celulares vão acessar o app.

É a **única máquina autorizada a chamar o serviço real.** Em qualquer outra —
inclusive a de desenvolvimento — o projeto roda em modo simulado e nenhuma
requisição sai. Isso é o padrão e não precisa ser configurado; o que precisa de
um ato deliberado é o contrário (passo 6).

---

## O que instalar antes

| | por quê |
| --- | --- |
| **Node.js 20.19+** ([nodejs.org](https://nodejs.org)) | roda tudo. Marque "Add to PATH" no instalador |
| **Git for Windows** ([git-scm.com](https://git-scm.com/download/win)) | traz o `openssl`, que gera o certificado. O `pnpm cert` procura nas pastas do Git sozinho |

Conferir, no **Prompt de Comando**:

```cmd
node --version
npm --version
```

> Use **npm**, não pnpm. Os dois funcionam, mas o pnpm depende de symlinks no
> `node_modules` e é instável em algumas máquinas Windows. O `package-lock.json`
> está no repositório justamente para isso. Onde este guia diz `npm run X`, o
> equivalente pnpm é `pnpm X`.

---

## 1. Copiar o projeto e instalar

```cmd
cd C:\ProtocolScanner
npm install
```

## 2. Descobrir o endereço da máquina na rede

```cmd
ipconfig
```

Anote o **Endereço IPv4** do adaptador em uso — algo como `192.168.2.183`. É por
ele que os celulares vão acessar.

> Peça ao responsável pela rede para **fixar esse IP** (reserva de DHCP no
> roteador). Se ele mudar, o certificado para de valer e todo celular volta a
> mostrar aviso — veja "Se o IP mudar" no fim.

## 3. Gerar o certificado

```cmd
npm run cert
```

Isso cria a pasta `certs\` com duas coisas:

- **`dev-ca.crt`** — a autoridade. É o que se instala em cada celular, uma vez.
  Vale 10 anos e **nunca deve ser apagada**.
- **`dev-server.crt`** — o certificado do servidor, contendo o IP que você
  anotou no passo 2. Este pode ser regerado à vontade.

Se der `openssl was not found`, o Git for Windows não foi instalado. Instale e
rode de novo.

## 4. Liberar a porta no Firewall do Windows ⚠️

**Este é o passo que faz parecer que nada funciona.** Sem ele o servidor sobe
normalmente, a máquina abre o app em `localhost`, e nenhum celular consegue
conectar — sem mensagem de erro nenhuma, só "não foi possível acessar o site".

Abra o Prompt de Comando **como Administrador**:

```cmd
netsh advfirewall firewall add rule name="Leitor de Protocolos" dir=in action=allow protocol=TCP localport=4173
```

Para conferir depois:

```cmd
netsh advfirewall firewall show rule name="Leitor de Protocolos"
```

> Se a rede estiver classificada como **Pública** no Windows, o firewall é mais
> restritivo. Em **Configurações → Rede e Internet**, marque a conexão como
> **Rede Particular**.

## 5. Testar simulado, antes de ligar no serviço real

```cmd
npm start
```

Isso constrói o app e sobe o servidor. Você deve ver:

```
  Leitor de Protocolos — servidor local
  https://localhost:4173
  https://192.168.2.183:4173   ← no celular

  ✓  MODO SIMULADO — nenhuma requisição sai desta máquina.
```

Com isso no ar, **valide tudo** — login, escanear, protocolar, relatório — sem
tocar no serviço real. Qualquer usuário e senha entram. As respostas seguem a
convenção dos dois últimos dígitos do número (`97` falha na busca, `98` falha ao
protocolar, `99` falha no AS), então dá para exercitar cada caminho de erro.

Instale o certificado nos celulares agora também (veja
[IPHONE.md](IPHONE.md) para iOS) — assim, quando ligar no serviço real, a única
variável nova é o serviço.

## 6. Ligar no serviço real ⚠️

**Só depois que o passo 5 estiver inteiramente limpo.**

Abra o `.env` no Bloco de Notas e deixe assim:

```dotenv
MOCK_UPSTREAM=false
UPSTREAM_URL=https://o-endereco-real-do-servico
```

Pare o servidor (`Ctrl+C`) e suba de novo:

```cmd
npm start
```

O banner tem de mudar:

```
  ⚠  SUBMISSÕES REAIS → https://o-endereco-real-do-servico
     Cada protocolo enviado é definitivo. Não há desfazer.
```

**Se ainda disser MODO SIMULADO, pare.** O `.env` não foi lido, e nada do que
você fizer será real — o que é bem melhor do que o contrário, mas resolva antes
de seguir.

Então: entre com um usuário de verdade e **protocole um único número que você
esteja disposto a enviar para valer.** Não existe desfazer.

## 7. Deixar rodando

O servidor precisa estar no ar sempre que alguém for usar o app.

**Do jeito simples:** deixe a janela do Prompt de Comando aberta. Fechá-la
derruba o servidor.

**Iniciando junto com o Windows:** crie um arquivo `iniciar.cmd` na pasta do
projeto:

```cmd
@echo off
cd /d "%~dp0"
npm start
```

Aperte `Win+R`, digite `shell:startup`, e coloque um atalho para esse arquivo na
pasta que abrir. O servidor sobe sozinho quando alguém fizer login no Windows.

> O servidor encontra o `certs\` e o `dist\` a partir da própria localização do
> arquivo, não do diretório em que foi iniciado — então atalho, tarefa agendada
> ou duplo clique funcionam igual.

---

## Quando você mudar o código

```cmd
npm start
```

`npm start` reconstrói o app antes de subir. Se subir com `npm run server`
(sem o build), os celulares continuam vendo a versão anterior.

---

## Problemas

### O celular não abre a página

Na ordem:

1. Está na mesma rede Wi-Fi? (Dados móveis não alcançam.)
2. O firewall foi liberado? (Passo 4 — é quase sempre isto.)
3. A rede está marcada como **Particular** no Windows?
4. O servidor está rodando? Na própria máquina:
   `curl -k https://localhost:4173/api/health`
5. O IP ainda é o mesmo? Rode `ipconfig` de novo.

### O celular mostra aviso de certificado

O certificado precisa ser instalado **e confiado** em cada aparelho. No iPhone
são dois passos separados e o segundo é o que todo mundo esquece — veja
[IPHONE.md](IPHONE.md).

### Se o IP mudar

O IP fica gravado dentro do certificado no momento em que ele é gerado. Se
mudou, regere **só o do servidor**:

```cmd
del certs\dev-server.key certs\dev-server.crt
npm run cert
npm start
```

**Não apague `certs\dev-ca.crt`.** É ela que os celulares confiam; reaproveitá-la
significa que ninguém precisa reconfigurar nada.

### `openssl was not found`

Instale o [Git for Windows](https://git-scm.com/download/win). O `npm run cert`
procura o openssl nas pastas dele automaticamente.

### `tsx: command not found` / o servidor não sobe

Rode `npm install` de novo. O `tsx` roda o TypeScript do servidor e depende do
`esbuild`, que baixa um binário específico da plataforma na instalação.

### Nada acontece ao abrir a página, ou aparece "o app ainda não foi construído"

Falta o build: `npm start` (que constrói) em vez de `npm run server`.

---

## Um lembrete sobre dados

O servidor desta máquina é a **fronteira**: ele recebe do Mais Cidadão o
registro completo do cidadão — CPF, cartão SUS, celular, endereço — e entrega ao
celular apenas o número do protocolo, o id e a data.

Isso significa que **os dados sensíveis existem nesta máquina** e em nenhuma
outra. Não copie logs do servidor para fora dela sem olhar o que tem dentro. Os
detalhes estão em "The DTO boundary", no README.
