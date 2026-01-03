import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { useMemo } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PlanExpiredScreen, PlanExpiringBanner, InstallPWA } from './components/ui';

// Auth pages
import { SplashScreen } from './pages/auth/SplashScreen';
import { Login } from './pages/auth/Login';
import { AdminLogin } from './pages/auth/AdminLogin';

// Client pages
import { Home } from './pages/client/Home';
import { Workout } from './pages/client/Workout';
import { Diet } from './pages/client/Diet';
import { Progress } from './pages/client/Progress';
import { Profile } from './pages/client/Profile';
import { OrientacoesGerais } from './pages/client/OrientacoesGerais';

// Admin pages
import { ClientList } from './pages/admin/ClientList';
import { ClientProfile } from './pages/admin/ClientProfile';
import { Anamnesis } from './pages/admin/Anamnesis';
import { DietManagement } from './pages/admin/DietManagement';
import { WorkoutManagement } from './pages/admin/WorkoutManagement';
import { LibraryManagement } from './pages/admin/LibraryManagement';
import { GuidelinesManagement } from './pages/admin/GuidelinesManagement';

// Helper function for Brasilia date
function getBrasiliaDate(): string {
  const now = new Date();
  const brasiliaOffset = -3 * 60;
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const brasiliaTime = new Date(utc + (brasiliaOffset * 60000));
  return brasiliaTime.toISOString().split('T')[0];
}

// Componente para rotas de ALUNO (não-admin)
function ClientRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, isAdmin } = useAuth();
  const location = useLocation();

  // Calculate plan status
  const planStatus = useMemo(() => {
    if (!profile?.plan_end_date) {
      return { isExpired: false, daysRemaining: null, planEndDate: null };
    }

    const today = new Date(getBrasiliaDate());
    const endDate = new Date(profile.plan_end_date);
    const daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    return {
      isExpired: daysRemaining < 0,
      daysRemaining: Math.max(0, daysRemaining),
      planEndDate: profile.plan_end_date
    };
  }, [profile?.plan_end_date]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-main)'
      }}>
        <div style={{ color: 'var(--text-muted)' }}>Carregando...</div>
      </div>
    );
  }

  // Não logado -> login de aluno
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Admin tentando acessar área de aluno -> redireciona para admin
  if (isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  // Check if plan expired (allow access to profile page)
  const isProfilePage = location.pathname === '/app/perfil';
  if (planStatus.isExpired && !isProfilePage) {
    return (
      <PlanExpiredScreen
        planEndDate={planStatus.planEndDate!}
        startingWeight={profile?.starting_weight_kg}
        currentWeight={profile?.current_weight_kg}
        goalWeight={profile?.goal_weight_kg}
      />
    );
  }

  // Show expiring banner if plan ends in 7 days or less
  const showExpiringBanner = planStatus.daysRemaining !== null &&
    planStatus.daysRemaining <= 7 &&
    planStatus.daysRemaining > 0;

  return (
    <>
      {showExpiringBanner && <PlanExpiringBanner daysRemaining={planStatus.daysRemaining!} />}
      {children}
    </>
  );
}

// Componente para rotas de ADMIN
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-main)'
      }}>
        <div style={{ color: 'var(--text-muted)' }}>Carregando...</div>
      </div>
    );
  }

  // Não logado -> login de admin
  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }

  // Não é admin -> redireciona para área de aluno
  if (!isAdmin) {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}

// Wrapper para forcar remontagem quando o ID muda
function KeyedClientProfile() {
  const { id } = useParams<{ id: string }>();
  return <ClientProfile key={id} />;
}

function KeyedAnamnesis() {
  const { id } = useParams<{ id: string }>();
  return <Anamnesis key={id} />;
}

function KeyedDietManagement() {
  const { id } = useParams<{ id: string }>();
  return <DietManagement key={id} />;
}

function KeyedWorkoutManagement() {
  const { id } = useParams<{ id: string }>();
  return <WorkoutManagement key={id} />;
}

function KeyedGuidelinesManagement() {
  const { id } = useParams<{ id: string }>();
  return <GuidelinesManagement key={id} />;
}

function AppRoutes() {
  const { user, isAdmin, loading } = useAuth();

  // Enquanto carrega, mostra splash screen
  if (loading) {
    return <SplashScreen />;
  }

  return (
    <>
    <InstallPWA isAuthenticated={!!user} />
    <Routes>
      {/* Rota raiz - redireciona baseado no estado */}
      <Route
        path="/"
        element={
          !user ? (
            <Navigate to="/login" replace />
          ) : isAdmin ? (
            <Navigate to="/admin" replace />
          ) : (
            <Navigate to="/app" replace />
          )
        }
      />

      {/* ========== ROTAS DE LOGIN ========== */}

      {/* Login de ALUNO */}
      <Route
        path="/login"
        element={
          !user ? (
            <Login />
          ) : isAdmin ? (
            <Navigate to="/admin" replace />
          ) : (
            <Navigate to="/app" replace />
          )
        }
      />

      {/* Login de ADMIN */}
      <Route
        path="/admin/login"
        element={
          !user ? (
            <AdminLogin />
          ) : isAdmin ? (
            <Navigate to="/admin" replace />
          ) : (
            <Navigate to="/app" replace />
          )
        }
      />

      {/* ========== ROTAS DO ALUNO (/app/*) ========== */}
      <Route
        path="/app"
        element={
          <ClientRoute>
            <Home />
          </ClientRoute>
        }
      />
      <Route
        path="/app/orientacoes"
        element={
          <ClientRoute>
            <OrientacoesGerais />
          </ClientRoute>
        }
      />
      <Route
        path="/app/treino"
        element={
          <ClientRoute>
            <Workout />
          </ClientRoute>
        }
      />
      <Route
        path="/app/dieta"
        element={
          <ClientRoute>
            <Diet />
          </ClientRoute>
        }
      />
      <Route
        path="/app/progresso"
        element={
          <ClientRoute>
            <Progress />
          </ClientRoute>
        }
      />
      <Route
        path="/app/perfil"
        element={
          <ClientRoute>
            <Profile />
          </ClientRoute>
        }
      />

      {/* ========== ROTAS DO ADMIN (/admin/*) ========== */}
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <ClientList />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/aluno/:id"
        element={
          <AdminRoute>
            <KeyedClientProfile />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/aluno/:id/anamnese"
        element={
          <AdminRoute>
            <KeyedAnamnesis />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/aluno/:id/dieta"
        element={
          <AdminRoute>
            <KeyedDietManagement />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/aluno/:id/treino"
        element={
          <AdminRoute>
            <KeyedWorkoutManagement />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/aluno/:id/orientacoes"
        element={
          <AdminRoute>
            <KeyedGuidelinesManagement />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/biblioteca"
        element={
          <AdminRoute>
            <LibraryManagement />
          </AdminRoute>
        }
      />

      {/* Rota fallback - redireciona para raiz */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
