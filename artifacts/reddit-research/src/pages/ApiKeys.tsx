import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  useListApiKeys, 
  useCreateApiKey, 
  useDeleteApiKey,
  useValidateApiKey,
  getListApiKeysQueryKey
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, KeyRound, Plus, Trash2, CheckCircle2, ShieldAlert } from "lucide-react";
import { format } from "date-fns";

const providerOptions = [
  { id: "openai", name: "OpenAI" },
  { id: "anthropic", name: "Anthropic" },
  { id: "gemini", name: "Google Gemini" },
  { id: "deepseek", name: "DeepSeek" },
  { id: "groq", name: "Groq" },
  { id: "perplexity", name: "Perplexity" },
  { id: "openrouter", name: "OpenRouter" },
  { id: "mistral", name: "Mistral" },
  { id: "cohere", name: "Cohere" },
  { id: "xai", name: "xAI (Grok)" },
];

const apiKeySchema = z.object({
  provider: z.string().min(1, "Provider is required"),
  name: z.string().min(1, "Name is required").max(50),
  key: z.string().min(5, "API Key is required"),
});

type ApiKeyFormValues = z.infer<typeof apiKeySchema>;

export default function ApiKeys() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  
  const { data: apiKeys, isLoading } = useListApiKeys();
  const createApiKey = useCreateApiKey();
  const deleteApiKey = useDeleteApiKey();
  const validateApiKey = useValidateApiKey();

  const form = useForm<ApiKeyFormValues>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: {
      provider: "openai",
      name: "",
      key: "",
    },
  });

  const onSubmit = async (data: ApiKeyFormValues) => {
    setIsValidating(true);
    
    try {
      // 1. Validate key first
      const validation = await validateApiKey.mutateAsync({
        data: {
          provider: data.provider as any,
          key: data.key
        }
      });
      
      if (!validation.valid) {
        toast({ 
          title: "Invalid API Key", 
          description: validation.message || "Provider rejected this key.",
          variant: "destructive"
        });
        setIsValidating(false);
        return;
      }
      
      // 2. Save key
      await createApiKey.mutateAsync({
        data: {
          provider: data.provider as any,
          name: data.name,
          key: data.key
        }
      });
      
      toast({ title: "API Key saved successfully" });
      queryClient.invalidateQueries({ queryKey: getListApiKeysQueryKey() });
      setIsAdding(false);
      form.reset();
    } catch (err: any) {
      toast({ 
        title: "Error saving key", 
        description: (err as any)?.error || "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleDelete = (id: number) => {
    deleteApiKey.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "API Key deleted" });
        queryClient.invalidateQueries({ queryKey: getListApiKeysQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Failed to delete", description: (err as any)?.error || "Unknown error", variant: "destructive" });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tight flex items-center gap-2">
            <KeyRound className="h-7 w-7 text-primary" />
            API_KEYS
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your LLM provider keys for BYOK inference.</p>
        </div>
        
        {!isAdding && (
          <Button 
            onClick={() => setIsAdding(true)} 
            className="rounded-none bg-primary text-primary-foreground shadow-[0_0_10px_rgba(0,180,255,0.2)]"
          >
            <Plus className="mr-2 h-4 w-4" /> Add New Key
          </Button>
        )}
      </div>

      {isAdding && (
        <Card className="rounded-none border-primary/50 bg-primary/5 shadow-none animate-in slide-in-from-top-4">
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="font-mono text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-primary" />
              SECURE KEY REGISTRATION
            </CardTitle>
            <CardDescription>Keys are encrypted at rest and only decrypted during active inference runs.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="provider"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-mono text-muted-foreground">PROVIDER</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="rounded-none bg-background">
                              <SelectValue placeholder="Select provider" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="rounded-none">
                            {providerOptions.map(p => (
                              <SelectItem key={p.id} value={p.id} className="rounded-none">{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-mono text-muted-foreground">KEY ALIAS</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Prod GPT-4" className="rounded-none bg-background" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormField
                  control={form.control}
                  name="key"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-mono text-muted-foreground">SECRET KEY</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="sk-..." className="rounded-none bg-background font-mono text-sm" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="flex justify-end gap-2 pt-4 border-t border-border">
                  <Button type="button" variant="outline" onClick={() => setIsAdding(false)} className="rounded-none">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isValidating} className="rounded-none bg-primary text-primary-foreground">
                    {isValidating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> VALIDATING...</> : "Verify & Save"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full py-12 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : apiKeys?.length === 0 ? (
          <div className="col-span-full py-12 border border-dashed border-border bg-card/30 text-center flex flex-col items-center">
            <KeyRound className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <h3 className="text-lg font-mono font-bold mb-1">NO KEYS CONFIGURED</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-4">You need at least one API key to generate reports. We do not charge for AI inference.</p>
            <Button onClick={() => setIsAdding(true)} variant="outline" className="rounded-none border-primary/50 text-primary">
              Configure First Key
            </Button>
          </div>
        ) : (
          apiKeys?.map(key => (
            <Card key={key.id} className="rounded-none border-border bg-card/50 hover:border-primary/30 transition-colors group">
              <CardHeader className="pb-3 border-b border-border/50">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="rounded-none border-primary/30 bg-primary/5 text-primary text-xs uppercase font-mono">
                      {key.provider}
                    </Badge>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity rounded-none"
                    onClick={() => handleDelete(key.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <CardTitle className="text-lg mt-2">{key.name}</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-mono text-muted-foreground bg-background px-2 py-1 border border-border">
                    •••• {key.keyPreview}
                  </span>
                  {key.isActive ? (
                    <span className="flex items-center gap-1 text-green-500 text-xs font-mono">
                      <CheckCircle2 className="h-3 w-3" /> ACTIVE
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs font-mono">INACTIVE</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-4 font-mono">
                  Added: {format(new Date(key.createdAt), 'MMM d, yyyy')}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
