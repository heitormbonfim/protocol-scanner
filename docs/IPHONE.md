# Usando o Leitor de Protocolos no iPhone

No Android o app funciona direto. No iPhone não — e não é um defeito do app.
Este guia resolve, em cerca de dois minutos.

Você só faz isto **uma vez por aparelho**.

---

## Por que o Android funciona e o iPhone não

O app precisa da câmera, e todo navegador só libera a câmera em uma página
**segura** — `https://`. Como ele roda na rede local, e não na internet, o
certificado `https` é emitido pelo próprio computador. Nenhum aparelho conhece
quem emitiu esse certificado, então todos desconfiam dele no primeiro acesso.

A diferença está no que cada navegador faz com essa desconfiança:

| | |
| --- | --- |
| **Android / Chrome** | Mostra um aviso com "Avançado → Continuar assim mesmo". Você clica e usa. |
| **iPhone / Safari** | **Não oferece essa saída.** É preciso ensinar o iPhone a confiar em quem emitiu o certificado. |

O que você vai fazer abaixo é exatamente isso: instalar no iPhone o "carimbo"
do computador, e depois dizer que confia nele. São dois passos separados, e
**pular o segundo é o erro mais comum** — o iPhone ignora um certificado
instalado até você ativá-lo à mão.

---

## Antes de começar

Peça a quem cuida do computador:

- que o servidor esteja rodando (`pnpm server`);
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
2. Digite o endereço do computador acrescentando `/dev-ca.crt` no final:

   ```
   https://192.168.2.54:4173/dev-ca.crt
   ```

   (Troque `192.168.2.54` pelo endereço que te passaram.)

3. O Safari vai perguntar se deseja permitir o download de um perfil de
   configuração. Toque em **Permitir**.
4. Aparece "Perfil Baixado". Pode fechar.

> Se o Safari mostrar um aviso de site não seguro **nesta página**, toque em
> **Mostrar detalhes → Visitar este site**. Só aqui isso é aceitável: você está
> buscando justamente o certificado que resolve o aviso.

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

2. Não deve aparecer nenhum aviso. Se aparecer, o Passo 3 não foi concluído.
3. Faça login com seu usuário e senha do Mais Cidadão.

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
rm certs/dev-server.*   # NÃO apague certs/dev-ca.crt
pnpm cert
pnpm build && pnpm server
```

Apagar só o `dev-server.*` é importante: o `dev-ca.crt` é o que você instalou no
iPhone, e reaproveitá-lo significa que **ninguém precisa refazer este guia**.

### A página não abre de jeito nenhum

- O iPhone está na mesma rede Wi-Fi do computador? (Não vale 4G/5G.)
- O servidor está rodando? Quem cuida do computador confere com o `curl` do
  início deste guia.
- O endereço está com `https://` e com `:4173` no final?

### A câmera não abre

Confirme que o endereço começa com **`https://`**. Em `http://` o iPhone bloqueia
a câmera, e não há como liberar.

### Preciso refazer isso quando trocar de celular?

Sim — o certificado fica guardado em cada aparelho. Em um iPhone que já passou
por este guia, nada precisa ser refeito, nem quando o app é atualizado.

---

## Para quem cuida do computador

O que o `pnpm cert` gera já atende às três exigências do iOS, e vale saber quais
são caso algo mude:

| exigência do iOS | onde é atendida |
| --- | --- |
| validade ≤ 398 dias | `scripts/dev-cert.mjs` emite com 397 |
| `extendedKeyUsage = serverAuth` | idem, obrigatório desde o iOS 13 |
| o IP no `subjectAltName` | idem, inclui todo IPv4 da máquina |

O `/dev-ca.crt` é servido com `Content-Type: application/x-x509-ca-cert` e
**sem** `Content-Disposition` — com esse cabeçalho o iOS manda o arquivo para o
app Arquivos em vez de oferecê-lo como perfil, e a instalação não acontece. Isso
vale tanto em [server/shared/static.ts](../server/shared/static.ts) quanto em
[plugins/dev-cert.ts](../plugins/dev-cert.ts).

Para conferir para quais endereços o certificado atual vale:

```bash
openssl x509 -in certs/dev-server.crt -noout -ext subjectAltName -dates
```
