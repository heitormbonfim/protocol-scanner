# Executáveis para Windows e Linux

## Para quem vai usar

Receba a pasta `release/windows-x64` ou `release/linux-x64` gerada pelo responsável técnico. Não é necessário instalar Node.js, npm ou baixar o código-fonte.

1. Copie a pasta para um local do computador onde possa editar arquivos.
2. Edite o `.env` ao lado do executável. O empacotamento distribui apenas valores de exemplo; nunca copia o `.env` privado do desenvolvedor. No Windows, ative a exibição de extensões para não salvar como `.env.txt`.
3. No Windows, abra `iniciar.cmd` com dois cliques. No Linux, abra um terminal na pasta e execute `sh iniciar.sh`. Os iniciadores mantêm mensagens de erro visíveis; o binário também pode ser aberto diretamente.
4. O programa inicia o servidor e abre o navegador. Se não abrir, copie a URL exibida na janela.
5. Mantenha a janela do servidor aberta durante o uso. Feche-a ou pressione Ctrl+C para encerrar. Isso não instala um serviço de inicialização do sistema.

Configurações são lidas ao lado do executável mesmo se ele for aberto por atalho ou a partir de outra pasta. Alterar o `.env` exige reiniciar. Para não abrir o navegador automaticamente, execute com `--no-open`. Se a porta estiver ocupada, encerre a outra instância ou altere `PORT`.

Os binários são **x64**. Windows ARM e Linux ARM não estão incluídos. Os executáveis não têm assinatura digital; no Windows isso pode gerar aviso de reputação/SmartScreen. Linux requer glibc compatível com o Node 22 usado pelo empacotador; Alpine/musl não é alvo deste comando. A validação de execução foi feita no Linux; o `.exe` precisa ser homologado em Windows.

No protocolar, configure `UPSTREAM_URL` no `.env`. O modo padrão usa HTTPS quando existem `certs/dev-server.key` e `certs/dev-server.crt` ao lado do executável. Para câmera em celulares pela rede, o certificado precisa cobrir o IP da máquina e ser confiável no celular. O responsável técnico pode gerar os arquivos com `npm run cert` nessa máquina e copiar **apenas** `dev-server.key`, `dev-server.crt` e `dev-ca.crt` para a pasta `certs/` do executável. Não distribua `dev-ca.key`. O empacotamento não inclui certificados nem altera essa exigência de HTTPS. Para uso no próprio computador, `--http` permite acesso por localhost.

## Para quem desenvolve

Com Node.js e npm instalados, na raiz do projeto:

```bash
npm ci
npm run package          # build + Linux x64 + Windows x64
npm run package:linux    # somente Linux x64
npm run package:windows  # somente Windows x64
```

O comando gera o frontend, reúne o servidor em CommonJS com esbuild e usa [@yao-pkg/pkg](https://yao-pkg.github.io/pkg/guide/getting-started) para embutir o runtime Node 22 e os arquivos do frontend. A primeira execução precisa de internet para baixar os runtimes de cada plataforma. O binário Linux e o `.exe` são gerados no mesmo computador; gerar um `.exe` não comprova que ele roda em Windows.

Saídas:

```text
release/
  linux-x64/protocol-scanner
  windows-x64/protocol-scanner.exe
  # Cada pasta também contém .env, .env.example e LEIA-ME.txt
```

O `.env` já existente em `release/` é preservado ao reempacotar. Para uma distribuição limpa, confira esse arquivo antes de compartilhar a pasta. `.package/` é uma área intermediária descartável; `release/` e `.package/` são ignoradas pelo Git. As fontes `.ts` continuam sendo a única implementação a manter.

O empacotador pode informar `Cannot resolve mod` (mecanismo de views do Express, que não utilizamos). O Mais Cidadão também pode informar módulos opcionais de WebSocket, microserviços e validação do Nest ausentes; o aplicativo usa HTTP e Zod, sem esses módulos. Esses avisos não substituem a verificação de execução do binário.

## Verificação e rede local

O empacotamento testa automaticamente o binário da plataforma em que está sendo executado, em uma pasta isolada e com upstream local de teste. Valida HTML, JavaScript e API local. A outra plataforma exige teste em seu próprio sistema. Windows e Linux x64 são os alvos disponíveis.

Use o endereço de rede exibido no terminal nos demais computadores da mesma rede. No Windows, permita a porta do servidor no firewall para redes privadas. Mantenha o servidor aberto. O endereço localhost funciona apenas no próprio computador.

## Encerrar o servidor no Linux

Execute `iniciar.sh` pela opção **Executar como programa** do gerenciador de arquivos. Ele abre um terminal quando iniciado sem um. Se o gerenciador abrir o arquivo em um editor, abra um terminal nessa pasta e execute `sh iniciar.sh`.

Mantenha essa janela aberta durante o uso. Para encerrar o servidor, pressione **Ctrl+C nessa janela**. Fechar a página do navegador não encerra o servidor. Abrir o binário diretamente pelo gerenciador de arquivos pode deixá-lo sem terminal; use o iniciador para ter controle visível do processo.

O iniciador procura x-terminal-emulator, GNOME Terminal, Konsole, XFCE Terminal ou xterm. Em ambientes sem um deles, inicie pelo seu terminal com `sh iniciar.sh`.

Para instalar a CA no iPhone sem depender de HTTPS ainda não confiável, use
`npm run cert:serve` na cópia do projeto que gerou **essa mesma CA**, acessível
na rede local. Abra no Safari o link HTTP impresso, instale o perfil e ative
a confiança conforme [IPHONE.md](IPHONE.md). Alternativamente, transfira
`dev-ca.crt` por AirDrop a partir de um Mac. O executável continua em HTTPS;
encerre o helper após configurar os aparelhos.
