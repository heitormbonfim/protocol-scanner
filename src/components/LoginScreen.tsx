import { useState, type FormEvent } from 'react'
import { LogIn, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { login } from '@/lib/api'
import type { Session } from '@/lib/session'

/**
 * The login screen, which is now the way into the app.
 *
 * It replaces a token that was compiled into the bundle — the same one for
 * everybody, readable by anyone with the app, and impossible to attribute to a
 * person. Logging in per operator is also what lets the header say who is
 * filing, which is the point on a shared phone.
 *
 * Deliberately plain. It is seen once every eleven days or so, on a phone, by
 * someone holding a stack of paper.
 */

type LoginScreenProps = {
  onSuccess: (session: Session) => void
}

export function LoginScreen({ onSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError(null)

    const result = await login(email.trim(), senha)

    if (result.ok) {
      // No `setBusy(false)`: this component unmounts on success, and setting
      // state afterwards is a warning for no benefit.
      onSuccess(result.session)
      return
    }

    setError(result.reason)
    setBusy(false)
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-5 py-10">
      <header className="space-y-3">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-white">
          <ShieldCheck className="size-6" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Mais Cidadão · Protocolos
        </p>
        <h1 className="text-3xl font-bold tracking-tight">
          Pronto para começar?
        </h1>
        <p className="text-sm text-muted-foreground">
          Entre com seu usuário do Mais Cidadão
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm"
      >
        <div className="space-y-2">
          <Label htmlFor="email">Usuário</Label>
          <Input
            id="email"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            // The field takes a username, not an address — the phone keyboard
            // should not capitalise or autocorrect it.
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            disabled={busy}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="senha">Senha</Label>
          <Input
            id="senha"
            name="senha"
            type="password"
            value={senha}
            onChange={(event) => setSenha(event.target.value)}
            autoComplete="current-password"
            required
            disabled={busy}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" size="lg" disabled={busy}>
          <LogIn /> {busy ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </div>
  )
}
