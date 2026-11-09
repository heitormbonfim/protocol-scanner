# Instalando na máquina do Mais Cidadão (Windows)

Este é o roteiro da instalação física: a máquina Windows que vai ficar rodando o
servidor, e da qual os celulares vão acessar o app.

É a **única máquina autorizada a chamar o serviço real.** Não existe modo
simulado: o que estiver em `UPSTREAM_URL` é para onde os protocolos vão, e um
protocolo enviado não volta atrás. Por isso o passo 6 — preencher esse endereço
— fica por último, depois de todo o resto estar funcionando.

Em qualquer outra máquina, aponte `UPSTREAM_URL` para um host inexistente
(`https://nao-existe.invalid`): o app sobe inteiro e toda chamada falha limpa,
sem chegar perto do serviço.

---

## O que instalar antes

| | por quê |
| --- | --- |
| **Node.js 20.19+** ([nodejs.org](https://nodejs.org)) | roda tudo. Marque "Add to PATH" no instalador |
| **Git for Windows** ([git-scm.com](https://git-scm.com/download/win)) | traz o `openssl`, que gera o certificado. O `npm run cert` procura nas pastas do Git sozinho |

Conferir, no **Prompt de Comando**:

```cmd
node --version
npm --version
```

> Use **Node.js 22.12+ e npm** para desenvolvimento. Para operadores, prefira o executável descrito em [EXECUTABLES.md](EXECUTABLES.md): ele não exige Node ou npm.

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

## 5. Testar antes de ligar no serviço real

Deixe o `.env` assim, com um endereço que não existe:

```dotenv
UPSTREAM_URL=https://nao-existe.invalid
PORT=4173
```

E suba:

```cmd
npm start
```

Isso constrói o app e sobe o servidor. Você deve ver:

```
  Leitor de Protocolos — servidor local
  https://localhost:4173
  https://192.168.2.183:4173   ← no celular

  ⚠  SUBMISSÕES REAIS → https://nao-existe.invalid
```

Com isso no ar, valide tudo que **não** depende do serviço: a página abre no
celular, a câmera funciona, o quadro de mira arrasta, o histórico sobrevive a um
recarregamento. O login vai falhar com "Falha ao contatar o serviço remoto" — e é
isso mesmo, porque o endereço não existe. Nada sai da máquina.

Instale o certificado nos celulares agora também (veja [IPHONE.md](IPHONE.md)
para iOS). Assim, quando ligar no serviço real, a única variável nova é o
serviço.

## 6. Ligar no serviço real ⚠️

**Só depois que o passo 5 estiver inteiramente limpo.**

Abra o `.env` no Bloco de Notas e troque o endereço pelo verdadeiro:

```dotenv
UPSTREAM_URL=https://o-endereco-real-do-servico
PORT=4173
```

Pare o servidor (`Ctrl+C`) e suba de novo:

```cmd
npm start
```

O banner tem de mostrar o endereço real:

```
  ⚠  SUBMISSÕES REAIS → https://o-endereco-real-do-servico
     Cada protocolo enviado é definitivo. Não há desfazer.
```

**Se ainda mostrar o endereço antigo, pare.** O `.env` não foi lido — o servidor
só o relê ao iniciar.

Faça então três conferências, nesta ordem:

```cmd
curl -k https://localhost:4173/api/health
```

Deve devolver o endereço real. Depois entre com um usuário de verdade pelo app,
copie o token do DevTools, e confira que a busca não devolve dado pessoal:

```cmd
curl -k "https://localhost:4173/api/protocolos?protocoloId=SEU_NUMERO" -H "authorization: Bearer SEU_TOKEN"
```

Tem de sair **exatamente três campos** — `id`, `numprotocolo` e `data`. Se
aparecer CPF, nome ou endereço, pare: a fronteira de dados está quebrada.

E por fim:

```cmd
curl -k -i https://localhost:4173/api/nao-existe
```

Tem de ser **404 em JSON**, nunca uma página HTML. É o que impede um endpoint
errado ser reportado como protocolo enviado.

Só então: **protocole um único número que você esteja disposto a enviar para
valer.** Não existe desfazer.

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

## Download inicial da CA no iPhone

Com o app HTTPS rodando, abra outro terminal na pasta do projeto e execute
`npm run cert:serve`. No Safari, baixe `http://<IP>:8080/dev-ca.crt`, instale o
perfil e ative a confiança conforme [IPHONE.md](IPHONE.md).

Se necessário, em um terminal de administrador, permita o download somente
na rede local durante a configuração:

```bat
netsh advfirewall firewall add rule name="Leitor CA temporaria" dir=in action=allow protocol=TCP localport=8080 remoteip=localsubnet
```

Depois de configurar os aparelhos, encerre o helper com Ctrl+C e remova a regra:

```bat
netsh advfirewall firewall delete rule name="Leitor CA temporaria"
```

A aplicação continua usando HTTPS na porta 4173. Não abra portas no roteador.
