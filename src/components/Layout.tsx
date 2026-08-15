import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'

export default function Layout() {
  const { isAuthenticated, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#10454f] text-sm font-bold text-white">
              S
            </span>
            <div className="leading-tight">
              <p className="text-sm font-bold text-[#10454f]">Simbiosia</p>
              <p className="text-xs text-muted-foreground">Funil de MKT &amp; Vendas</p>
            </div>
          </div>
          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              <nav className="hidden gap-4 text-sm font-medium text-muted-foreground sm:flex">
                <Link to="/" className="hover:text-[#10454f]">
                  Leads
                </Link>
              </nav>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  signOut()
                  navigate('/login')
                }}
              >
                Sair
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" asChild>
              <Link to="/login">Entrar</Link>
            </Button>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
