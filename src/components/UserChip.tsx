import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Usuario } from '@/lib/session'

/**
 * Who is logged in, and the way out.
 *
 * Shown on every screen rather than tucked into a menu, because the phone is
 * shared: whoever picks it up needs to see at a glance that they are about to
 * file a stack of protocols as somebody else. The permission level rides along
 * for the same reason — "Atendente" answers "why is the Protocolar button
 * greyed out" before anyone has to ask.
 *
 * Both views render it, which is why it lives here rather than being inlined
 * into either header.
 */

type UserChipProps = {
  usuario: Usuario
  onLogout: () => void
}

export function UserChip({ usuario, onLogout }: UserChipProps) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <div className="min-w-0 text-right">
        <p className="truncate text-xs font-medium">Usuário: {usuario.nome}</p>
        {usuario.nivel_permissao && (
          <p className="truncate text-[0.6875rem] leading-tight text-muted-foreground">
            {usuario.nivel_permissao}
          </p>
        )}
      </div>
      <Button size="icon" variant="ghost" onClick={onLogout} aria-label="Sair">
        <LogOut />
      </Button>
    </div>
  )
}
