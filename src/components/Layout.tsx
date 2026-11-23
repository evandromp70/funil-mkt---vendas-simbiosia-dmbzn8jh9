import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  BadgeCheck,
  BarChart3,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MessagesSquare,
  Package,
  Undo2,
  Upload,
  UserCog,
  UserPlus,
  Users,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'

// marcador de build visível no rodapé — acaba a dúvida de qual bundle o navegador rodou
// (atualizado manualmente a cada versão publicada)
const VERSAO_BUILD = 'v0.0.200'

const ITENS = [
  { para: '/', rotulo: 'Leads', Icone: Users, fim: true },
  { para: '/painel', rotulo: 'Painel', Icone: LayoutDashboard },
  { para: '/metricas', rotulo: 'Métricas', Icone: BarChart3, teste: 'menu-metricas' },
  { para: '/cadastro', rotulo: 'Cadastro', Icone: UserPlus },
  { para: '/importar', rotulo: 'Importar', Icone: Upload },
  { para: '/listas', rotulo: 'Listas', Icone: ListChecks },
  { para: '/produtos', rotulo: 'Produtos', Icone: Package },
  { para: '/passagens', rotulo: 'Conversas', Icone: MessagesSquare, teste: 'menu-passagens' },
  {
    para: '/comercial-retorno',
    rotulo: 'Retorno à Fábrica',
    Icone: Undo2,
    teste: 'menu-comercial-retorno',
  },
  { para: '/aprovacoes', rotulo: 'Aprovações', Icone: BadgeCheck },
  { para: '/usuarios', rotulo: 'Usuários', Icone: UserCog },
]

function Marca() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-base font-bold text-white ring-1 ring-white/20">
        S
      </span>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-white">Simbiosia</p>
        <p className="text-xs text-white/60">Funil de MKT &amp; Vendas</p>
      </div>
    </div>
  )
}

export default function Layout() {
  const { isAuthenticated, signOut } = useAuth()
  const navigate = useNavigate()

  const sair = () => {
    signOut()
    navigate('/login')
  }

  if (!isAuthenticated) {
    return (
      <div className="stage flex min-h-screen flex-col items-center justify-center gap-6 p-4">
        <Marca />
        <main className="w-full max-w-md rounded-[1.75rem] bg-white p-4 shadow-float sm:p-6">
          <Outlet />
        </main>
      </div>
    )
  }

  return (
    <div className="stage min-h-screen p-2 sm:p-4">
      <div className="mx-auto flex min-h-[calc(100vh-1rem)] max-w-[1680px] flex-col overflow-clip rounded-[1.75rem] border border-white/10 shadow-float sm:min-h-[calc(100vh-2rem)] lg:flex-row lg:rounded-[2rem]">
        <aside className="glass-side relative flex shrink-0 flex-col gap-3 p-4 lg:w-64 lg:p-5">
          <div className="flex flex-col gap-3 lg:sticky lg:top-5 lg:h-[calc(100vh-4rem)] lg:gap-6">
            <Marca />
            <nav
              aria-label="Menu principal"
              className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-1 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
            >
              {ITENS.map(({ para, rotulo, Icone, fim, teste }) => (
                <NavLink
                  key={para}
                  to={para}
                  end={fim}
                  data-testid={teste}
                  className={({ isActive }) =>
                    cn(
                      'flex shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-white/10 text-white ring-1 ring-white/20'
                        : 'text-white/70 hover:bg-white/5 hover:text-white',
                    )
                  }
                >
                  <Icone className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                  {rotulo}
                </NavLink>
              ))}
            </nav>
            <button
              type="button"
              onClick={sair}
              className="absolute right-4 top-4 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white lg:static lg:py-2.5"
            >
              <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
              Sair
            </button>
          </div>
        </aside>
        <div className="m-1.5 flex min-w-0 flex-1 flex-col overflow-clip rounded-[1.4rem] bg-white shadow-card sm:m-2.5 lg:rounded-[1.6rem]">
          <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
            <div className="mx-auto w-full max-w-6xl">
              <Outlet />
            </div>
          </main>
          <footer className="border-t px-6 py-2">
            <p className="text-right text-[10px] text-muted-foreground">build {VERSAO_BUILD}</p>
          </footer>
        </div>
      </div>
    </div>
  )
}
