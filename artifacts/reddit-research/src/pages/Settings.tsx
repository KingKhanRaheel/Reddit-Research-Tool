import { useSupabaseAuth } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Settings as SettingsIcon, LogOut, Shield } from "lucide-react";
import { useLocation } from "wouter";

export default function Settings() {
  const { user, signOut } = useSupabaseAuth();
  const [, setLocation] = useLocation();

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold font-mono tracking-tight flex items-center gap-2">
          <SettingsIcon className="h-7 w-7 text-primary" />
          SETTINGS
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your account and preferences.</p>
      </div>

      <Card className="rounded-none border-border bg-card/50 shadow-none">
        <CardHeader className="border-b border-border/50">
          <CardTitle className="font-mono text-base">PROFILE</CardTitle>
          <CardDescription>Your personal information</CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-mono text-muted-foreground">EMAIL ADDRESS</Label>
            <Input disabled value={user?.email || ""} className="rounded-none bg-muted/50 cursor-not-allowed" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-mono text-muted-foreground">USER ID</Label>
            <Input disabled value={user?.id || ""} className="rounded-none font-mono text-xs bg-muted/50 cursor-not-allowed" />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-none border-border bg-card/50 shadow-none">
        <CardHeader className="border-b border-border/50">
          <CardTitle className="font-mono text-base">SECURITY</CardTitle>
          <CardDescription>Authentication and active sessions</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between p-4 border border-border bg-background">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Authentication Provider</p>
                <p className="text-xs text-muted-foreground">Managed by Supabase</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button 
          variant="destructive" 
          className="rounded-none bg-destructive/10 text-destructive border border-destructive hover:bg-destructive hover:text-destructive-foreground"
          onClick={async () => {
            await signOut();
            setLocation("/");
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out of All Devices
        </Button>
      </div>
    </div>
  );
}
