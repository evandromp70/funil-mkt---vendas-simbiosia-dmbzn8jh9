/* Main App Component - Handles routing (using react-router-dom), query client and other providers - use this file to add all routes */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider, useAuth } from './hooks/use-auth'
import Index from './pages/Index'
import Login from './pages/Login'
import LeadDetail from './pages/LeadDetail'
import Usuarios from './pages/Usuarios'
import NotFound from './pages/NotFound'
import Layout from './components/Layout'

// ONLY IMPORT AND RENDER WORKING PAGES, NEVER ADD PLACEHOLDER COMPONENTS OR PAGES IN THIS FILE
// AVOID REMOVING ANY CONTEXT PROVIDERS FROM THIS FILE (e.g. TooltipProvider, Toaster, Sonner)

const Protected = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <div className="p-8 text-center text-muted-foreground">Carregando...</div>
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

const App = () => (
  <BrowserRouter>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <Routes>
          <Route element={<Layout />}>
            <Route
              path="/"
              element={
                <Protected>
                  <Index />
                </Protected>
              }
            />
            <Route path="/login" element={<Login />} />
            <Route
              path="/leads/:id"
              element={
                <Protected>
                  <LeadDetail />
                </Protected>
              }
            />
            <Route
              path="/usuarios"
              element={
                <Protected>
                  <Usuarios />
                </Protected>
              }
            />
            {/* ADD ALL CUSTOM ROUTES MUST BE ADDED HERE */}
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </TooltipProvider>
  </BrowserRouter>
)

export default App
