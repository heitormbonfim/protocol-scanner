# Usando o Leitor de Protocolos no iPhone

O app pode funcionar na rede local, sem publicar nada na internet. A câmera
precisa de HTTPS com um certificado confiável. Instale a CA local e ative a
confiança nela **uma vez por aparelho**. Não dependa de ignorar avisos de
certificado, nem no Android.

## Antes de começar

Peça a quem cuida do computador:

- que o servidor esteja rodando (`npm run server`);
- que o download temporário esteja rodando em outro terminal (`npm run cert:serve`);
- **o endereço**, que tem esta cara: `https://192.168.2.54:4173`.

O iPhone e o computador precisam estar **na mesma rede Wi-Fi**. Não funciona
pelos dados móveis (4G/5G): esse endereço só existe dentro da rede local.

> **Para quem cuida do computador:** antes de mandar alguém seguir este guia,
> confirme que o servidor está no ar:
>
> ```bash
> curl -k https://localhost:4173/api/health
> # {"ok":true,"upstream":"https://..."}
> ```
>
> Se isso não responder, o problema não é o certificado de ninguém.

---

## Passo 1 — Baixar o certificado

1. No iPhone, abra o **Safari**. Precisa ser o Safari — Chrome ou Firefox no
   iPhone não conseguem instalar certificados.
2. Use **HTTP na porta 8080 somente para baixar a CA**:

   ```
   http://192.168.2.54:8080/dev-ca.crt
   ```

   (Troque `192.168.2.54` pelo endereço que te passaram.)

3. O Safari vai perguntar se deseja permitir o download de um perfil de
   configuração. Toque em **Permitir**.
4. Aparece "Perfil Baixado". Pode fechar.

> Use o link fornecido pelo responsável, na rede da empresa. O servidor mostra
> a impressão digital SHA-256 da CA para conferência. Se o download não abrir,
> confira a porta 8080 no firewall. Como alternativa, o responsável pode enviar
> **somente `certs/dev-ca.crt`** por AirDrop a partir de um Mac.

---

## Passo 2 — Instalar o perfil

1. Abra os **Ajustes** do iPhone.
2. Logo no topo, aparece **Perfil Baixado**. Toque nele.

   Se não aparecer: **Ajustes → Geral → VPN e Gerenciamento de Dispositivo**, e
   toque no perfil "Leitor de Protocolos Dev CA".

3. Toque em **Instalar** (canto superior direito).
4. Digite a senha do iPhone.
5. Toque em **Instalar** de novo, e depois em **Concluído**.

---

## Passo 3 — Confiar no certificado ⚠️

**Este é o passo que quase todo mundo esquece.** Sem ele, nada dos passos
anteriores tem efeito: o iPhone guarda o certificado, mas continua sem confiar
nele.

1. **Ajustes → Geral → Sobre**
2. Role até o final: **Ajustes de Confiança de Certificado**
3. Ative a chave ao lado de **Leitor de Protocolos Dev CA**
4. Confirme em **Continuar**

---

## Passo 4 — Abrir o app

1. No Safari, abra o endereço do computador:

   ```
   https://192.168.2.54:4173
   ```

2. Não deve aparecer nenhum aviso. Se aparecer, confira o Passo 3, o IP e a validade do certificado.
3. Faça login com seu usuário e senha do Mais Cidadão.
4. Ao iniciar a câmera, permita o acesso quando o Safari perguntar.

### Instalar na tela de início (recomendado)

Assim ele abre como um app, sem a barra do navegador, e sobra mais tela para a
câmera:

1. Toque no botão **Compartilhar** (o quadrado com a seta para cima).
2. Role e toque em **Adicionar à Tela de Início**.
3. Toque em **Adicionar**.

---

## Se algo der errado

### "Não é possível verificar a identidade do servidor"

O Passo 3 não foi feito, ou foi feito para outro certificado. Volte em
**Ajustes → Geral → Sobre → Ajustes de Confiança de Certificado** e confirme que
a chave está ligada.

### O aviso continua mesmo com a chave ligada

Quase sempre é o **endereço que mudou**. O certificado é emitido para o endereço
que o computador tinha no dia em que foi gerado; se ele trocou de rede Wi-Fi ou
recebeu outro número do roteador, o certificado deixa de servir.

Quem cuida do computador resolve com:

```bash
npm run cert
npm run server   # reinicie o processo para carregar o novo certificado
```

O comando substitui o certificado do servidor e preserva a CA. **Guarde tanto
`dev-ca.crt` quanto `dev-ca.key`**: o primeiro é instalado nos aparelhos e o
segundo assina as renovações. Não distribua nenhuma chave `.key`.

### A página não abre de jeito nenhum

- O iPhone está na mesma rede Wi-Fi do computador? (Não vale 4G/5G.)
- O servidor está rodando? Quem cuida do computador confere com o `curl` do
  início deste guia.
- O endereço está com `https://` e com `:4173` no final?

### A câmera não abre

Confirme que o endereço começa com **`https://`**. Em `http://` o iPhone bloqueia
a câmera pela rede local. Se o HTTPS já está confiável, confira a permissão de
câmera nas configurações do site no Safari e feche outros apps que a utilizem.

### Preciso refazer isso quando trocar de celular?

Sim — o certificado fica guardado em cada aparelho. Em um iPhone que já passou
por este guia, nada precisa ser refeito, nem quando o app é atualizado.

---

## Para quem cuida do computador

Na máquina que serve o app, já conectada à rede de trabalho:

```bash
npm run cert
npm start
```

Em outro terminal, na mesma pasta:

```bash
npm run cert:serve
# Se 8080 estiver ocupada: npm run cert:serve -- 8081
```

Libere a porta TCP do app (4173 por padrão) e a porta temporária (8080 por
padrão) no firewall **somente para a rede local**. Não configure encaminhamento
de portas no roteador nem túneis públicos. Ao terminar as instalações, encerre
`cert:serve` com Ctrl+C; o app HTTPS continua funcionando.

O servidor temporário responde apenas por `/dev-ca.crt`, em formato DER e com
`Content-Type: application/x-x509-ca-cert`. Não serve a aplicação, API, pastas
nem chaves privadas. A rota HTTPS existente continua disponível para aparelhos
que já confiam na CA. Não é necessário copiar certificados para `public/`.

O certificado do servidor usa RSA 2048, SHA-256, IPs no `subjectAltName` e
`extendedKeyUsage=serverAuth`, com validade de 397 dias. O limite Apple de
398 dias citado para certificados públicos **não se aplica às raízes instaladas
manualmente**; mantemos 397 dias como prazo conservador de renovação.

Reserve o IP da máquina no DHCP do roteador, se possível. Se o IP mudar ou o
certificado vencer, rode `npm run cert` e reinicie o servidor. Se faltar um dos
arquivos da CA, restaure-o do backup. O script recusa substituir uma CA parcial
silenciosamente, pois trocar a CA exige instalar e confiar novamente em todos
os aparelhos. Guarde a chave da CA em local protegido.

Para conferir o certificado:

```bash
openssl x509 -in certs/dev-server.crt -noout -ext subjectAltName -dates
openssl verify -CAfile certs/dev-ca.crt -purpose sslserver certs/dev-server.crt
```

Referências Apple: [confiança manual no iOS](https://support.apple.com/en-us/102390),
[certificados para servidores de teste](https://developer.apple.com/library/archive/qa/qa1948/_index.html),
[escopo do limite de validade](https://support.apple.com/en-us/102028).
