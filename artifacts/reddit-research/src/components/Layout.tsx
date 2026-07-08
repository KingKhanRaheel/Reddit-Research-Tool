import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { LayoutDashboard, FileText, KeyRound, Settings, LogOut, Loader2, Radar } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Reports", href: "/reports", icon: FileText },
    { name: "API Keys", href: "/api-keys", icon: KeyRound },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <div className="w-64 flex flex-col border-r border-border bg-card/50">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <Radar className="h-6 w-6 text-primary mr-3" />
          <span className="font-bold text-lg tracking-tight font-mono text-foreground">REDDIT_INTEL</span>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-3">
            {navigation.map((item) => {
              const isActive = location === item.href || (location.startsWith("/reports") && item.href === "/reports" && location !== "/dashboard");
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary border-l-2 border-primary"
                        : "text-muted-foreground hover:bg-white/5 hover:text-foreground border-l-2 border-transparent"
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 border border-border rounded-none">
              <AvatarImage src={user?.imageUrl} />
              <AvatarFallback className="rounded-none bg-secondary text-secondary-foreground">
                {user?.firstName?.charAt(0) || user?.emailAddresses[0]?.emailAddress?.charAt(0) || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-medium truncate text-foreground">
                {user?.fullName || "User"}
              </span>
              <span className="text-xs text-muted-foreground truncate">
                {user?.emailAddresses[0]?.emailAddress}
              </span>
            </div>
            <button
              onClick={() => signOut({ redirectUrl: "/" })}
              className="ml-auto p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
              title="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* subtle grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
        
        <div className="flex-1 overflow-auto relative z-10 p-6 md:p-8">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
