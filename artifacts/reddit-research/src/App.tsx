import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { useEffect, useRef } from 'react';
import { queryClient } from '@/lib/queryClient';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { SupabaseAuthProvider, useSupabaseAuth, supabase } from '@/lib/supabase';
import LandingPage from '@/pages/LandingPage';
import Dashboard from '@/pages/Dashboard';
import Reports from '@/pages/Reports';
import ReportViewer from '@/pages/ReportViewer';
import ApiKeys from '@/pages/ApiKeys';
import Settings from '@/pages/Settings';
import SignInPage from '@/pages/SignInPage';
import SignUpPage from '@/pages/SignUpPage';
import Layout from '@/components/Layout';
import { Loader2 } from 'lucide-react';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

// ---------------------------------------------------------------------------
// Registers Supabase's access token as the Bearer token for every API call.
// Must live inside <SupabaseAuthProvider> so the session is available.
// ---------------------------------------------------------------------------
function SupabaseAuthSync() {
  useEffect(() => {
    setAuthTokenGetter(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token ?? null;
    });
    return () => { setAuthTokenGetter(null); };
  }, []);

  return null;
}

// ---------------------------------------------------------------------------
// Invalidate TanStack Query cache when user changes (sign-in / sign-out).
// ---------------------------------------------------------------------------
function AuthCacheInvalidator() {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const userId = user?.id ?? null;
    if (
      prevUserIdRef.current !== undefined &&
      prevUserIdRef.current !== userId
    ) {
      queryClient.clear();
    }
    prevUserIdRef.current = userId;
  }, [user, queryClient]);

  return null;
}

// ---------------------------------------------------------------------------
// Route guards
// ---------------------------------------------------------------------------
function HomeRedirect() {
  const { user, loading } = useSupabaseAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return user ? <Redirect to="/dashboard" /> : <LandingPage />;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  const { user, loading } = useSupabaseAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return user ? (
    <Layout>
      <Component />
    </Layout>
  ) : (
    <Redirect to="/sign-in" />
  );
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in" component={SignInPage} />
      <Route path="/sign-up" component={SignUpPage} />

      <Route path="/dashboard">
        <ProtectedRoute component={Dashboard} />
      </Route>
      <Route path="/reports">
        <ProtectedRoute component={Reports} />
      </Route>
      <Route path="/reports/:id">
        <ProtectedRoute component={ReportViewer} />
      </Route>
      <Route path="/api-keys">
        <ProtectedRoute component={ApiKeys} />
      </Route>
      <Route path="/settings">
        <ProtectedRoute component={Settings} />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

// ---------------------------------------------------------------------------
// App root
// ---------------------------------------------------------------------------
function AppWithAuth() {
  return (
    <SupabaseAuthProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <SupabaseAuthSync />
          <AuthCacheInvalidator />
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </SupabaseAuthProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <AppWithAuth />
    </WouterRouter>
  );
}

export default App;
