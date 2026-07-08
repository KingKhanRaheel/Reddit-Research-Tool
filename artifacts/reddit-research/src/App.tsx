import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { useEffect, useRef } from 'react';
import { queryClient } from '@/lib/queryClient';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import LandingPage from '@/pages/LandingPage';
import Dashboard from '@/pages/Dashboard';
import Reports from '@/pages/Reports';
import ReportViewer from '@/pages/ReportViewer';
import ApiKeys from '@/pages/ApiKeys';
import Settings from '@/pages/Settings';
import Layout from '@/components/Layout';

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(199, 89%, 48%)", // cyan
    colorForeground: "hsl(210, 20%, 98%)",
    colorMutedForeground: "hsl(240, 5%, 65%)",
    colorDanger: "hsl(0, 84%, 60%)",
    colorBackground: "hsl(240, 10%, 6%)",
    colorInput: "hsl(240, 5%, 15%)",
    colorInputForeground: "hsl(210, 20%, 98%)",
    colorNeutral: "hsl(240, 5%, 15%)",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#0f0f12] rounded-none w-[440px] max-w-full overflow-hidden border border-[#24242e]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-foreground font-bold text-2xl tracking-tight",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground font-medium",
    formFieldLabel: "text-foreground font-medium",
    footerActionLink: "text-primary hover:text-primary/80 font-medium",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground",
    identityPreviewEditButton: "text-primary hover:text-primary/80",
    formFieldSuccessText: "text-green-500",
    alertText: "text-destructive-foreground",
    logoBox: "flex justify-center mb-4",
    logoImage: "h-12 w-auto object-contain",
    socialButtonsBlockButton: "border border-border bg-transparent hover:bg-white/5 rounded-none",
    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90 rounded-none shadow-sm shadow-[0_0_10px_rgba(0,180,255,0.3)]",
    formFieldInput: "bg-input text-foreground border-border rounded-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground",
    footerAction: "mt-4",
    dividerLine: "bg-border",
    alert: "bg-destructive/20 border border-destructive text-destructive-foreground rounded-none",
    otpCodeFieldInput: "bg-input text-foreground border-border rounded-none",
    formFieldRow: "mb-4",
    main: "w-full",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

// Registers Clerk's session token as the Bearer token for every API call.
// Must live inside <ClerkProvider> so useAuth() is available.
function ClerkAuthSync() {
  const { getToken } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => { setAuthTokenGetter(null); };
  }, [getToken]);

  return null;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  return (
    <>
      <Show when="signed-in">
        <Layout>
          <Component />
        </Layout>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      
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

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ClerkAuthSync />
          <ClerkQueryClientCacheInvalidator />
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
