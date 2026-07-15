import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { 
  useGetDashboard, 
  useListApiKeys, 
  useCreateReport, 
  useGetReportStatus,
  getGetDashboardQueryKey,
  getListReportsQueryKey,
  getGetReportStatusQueryKey
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { FileText, Loader2, Play, Plus, Search, CheckCircle2, XCircle, Clock, AlertTriangle, AlertCircle, Radio } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: dashboard, isLoading: isLoadingDashboard } = useGetDashboard();
  const { data: apiKeys, isLoading: isLoadingKeys } = useListApiKeys();
  const createReport = useCreateReport();

  // Form State
  const [keyword, setKeyword] = useState("");
  const [subreddit, setSubreddit] = useState("");
  const [timeRange, setTimeRange] = useState<string>("month");
  const [maxPosts, setMaxPosts] = useState([50]);
  const [maxComments, setMaxComments] = useState([200]);
  const [apiKeyId, setApiKeyId] = useState<string>("");
  const [advancedMode, setAdvancedMode] = useState(false);

  // Active generation tracking
  const [activeReportId, setActiveReportId] = useState<number | null>(null);
  
  // Use the hook conditionally if we have an active report
  const { data: reportStatus } = useGetReportStatus(activeReportId as number, {
    query: {
      enabled: activeReportId !== null,
      queryKey: getGetReportStatusQueryKey(activeReportId as number),
      refetchInterval: (data) => {
        // Stop polling if completed or failed
        if (data?.state?.data?.status === "completed" || data?.state?.data?.status === "failed") {
          return false;
        }
        return 2000; // Poll every 2 seconds
      }
    }
  });

  // Watch for completion
  useEffect(() => {
    if (reportStatus?.status === "completed") {
      toast({
        title: "Report completed!",
        description: "Your research report is ready to view.",
      });
      queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListReportsQueryKey() });
      setLocation(`/reports/${activeReportId}`);
      setActiveReportId(null);
    } else if (reportStatus?.status === "failed") {
      toast({
        title: "Report failed",
        description: reportStatus.errorMessage || "An error occurred during generation.",
        variant: "destructive"
      });
      setActiveReportId(null);
      queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    }
  }, [reportStatus, activeReportId, setLocation, toast, queryClient]);

  // Set default API key if available
  useEffect(() => {
    if (Array.isArray(apiKeys) && apiKeys.length > 0 && !apiKeyId) {
      const activeKey = apiKeys.find(k => k.isActive) || apiKeys[0];
      setApiKeyId(activeKey.id.toString());
    }
  }, [apiKeys, apiKeyId]);

  const handleCreateReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) {
      toast({ title: "Keyword required", variant: "destructive" });
      return;
    }
    if (!apiKeyId) {
      toast({ title: "API Key required", description: "Please select or add an API key.", variant: "destructive" });
      return;
    }

    createReport.mutate({
      data: {
        keyword,
        apiKeyId: parseInt(apiKeyId, 10),
        ...(advancedMode && subreddit.trim() ? { subreddit: subreddit.trim() } : {}),
        ...(advancedMode ? { timeRange: timeRange as any } : {}),
        ...(advancedMode ? { maxPosts: maxPosts[0] } : {}),
        ...(advancedMode ? { maxComments: maxComments[0] } : {}),
      }
    }, {
      onSuccess: (report) => {
        toast({ title: "Research started", description: "Gathering data across Reddit, YouTube, GitHub, and Hacker News..." });
        setActiveReportId(report.id);
        setKeyword("");
      },
      onError: (err) => {
        toast({ title: "Failed to start report", description: (err as any)?.error || "Unknown error", variant: "destructive" });
      }
    });
  };

  const getStatusIcon = (status: string) => {
    switch(status) {
      case "completed": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "running": return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case "pending": return <Clock className="h-4 w-4 text-muted-foreground" />;
      case "failed": return <XCircle className="h-4 w-4 text-destructive" />;
      default: return <AlertCircle className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold font-mono tracking-tight">DASHBOARD</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Stats Row */}
        <Card className="rounded-none border-border bg-card/50 shadow-none">
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Research Runs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{isLoadingDashboard ? "-" : dashboard?.totalReports || 0}</div>
          </CardContent>
        </Card>
        <Card className="rounded-none border-border bg-card/50 shadow-none">
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">{isLoadingDashboard ? "-" : dashboard?.completedReports || 0}</div>
          </CardContent>
        </Card>
        <Card className="rounded-none border-border bg-card/50 shadow-none">
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{isLoadingDashboard ? "-" : dashboard?.pendingReports || 0}</div>
          </CardContent>
        </Card>
        <Card className="rounded-none border-border bg-card/50 shadow-none">
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">{isLoadingDashboard ? "-" : dashboard?.failedReports || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Sources Card */}
      <Card className="rounded-none border-border shadow-none">
        <CardHeader className="border-b border-border/50 bg-muted/20">
          <CardTitle className="text-base font-mono flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary" />
            SOURCES
          </CardTitle>
          <CardDescription>Connected data sources for customer intelligence research.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoadingDashboard ? (
            <div className="p-6 text-center text-muted-foreground text-sm flex items-center justify-center">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading...
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 divide-y sm:divide-y-0 divide-border sm:divide-x">
              {dashboard?.sources?.map((source) => (
                <div key={source.platform} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm font-bold uppercase">{source.label}</span>
                    <Badge
                      variant="outline"
                      className={`rounded-none font-mono text-[10px] ${
                        source.status === "available"
                          ? "border-green-500/50 text-green-500 bg-green-500/10"
                          : "border-muted-foreground/50 text-muted-foreground"
                      }`}
                    >
                      {source.status === "available" ? "ONLINE" : "OFFLINE"}
                    </Badge>
                  </div>
                  <div className="text-2xl font-bold font-mono">{source.discussionsAnalyzed}</div>
                  <div className="text-xs text-muted-foreground">discussions analyzed</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* New Report Form */}
        <Card className="lg:col-span-2 rounded-none border-border shadow-none">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle className="flex items-center gap-2 font-mono">
              <Plus className="h-5 w-5 text-primary" />
              NEW RESEARCH RUN
            </CardTitle>
            <CardDescription>Enter a topic to analyze real customer conversations across Reddit, YouTube, GitHub, and Hacker News.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {activeReportId ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center space-y-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <h3 className="text-xl font-bold">Researching Across Sources...</h3>
                <p className="text-muted-foreground text-sm max-w-sm">
                  {reportStatus?.progressMessage || "Gathering initial posts..."}
                </p>
                <div className="w-full max-w-md mt-4">
                  <Progress value={reportStatus?.progress || 0} className="h-2 rounded-none bg-secondary">
                    <div className="h-full bg-primary transition-all duration-500" style={{ width: `${reportStatus?.progress || 0}%` }} />
                  </Progress>
                  <p className="text-xs font-mono text-right mt-2 text-muted-foreground">{reportStatus?.progress || 0}%</p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateReport} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="keyword" className="font-mono text-xs text-muted-foreground">TARGET KEYWORD / PRODUCT / TOPIC</Label>
                  <Input
                    id="keyword"
                    placeholder="e.g. Notion alternative, cold email tools, mechanical keyboards"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    className="rounded-none font-mono text-base h-12"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="apiKey" className="font-mono text-xs text-muted-foreground">INFERENCE ENGINE (API KEY)</Label>
                  {isLoadingKeys ? (
                    <div className="h-10 border border-border flex items-center px-3 text-sm text-muted-foreground bg-secondary/50">Loading keys...</div>
                  ) : Array.isArray(apiKeys) && apiKeys.length > 0 ? (
                    <Select value={apiKeyId} onValueChange={setApiKeyId} required>
                      <SelectTrigger className="rounded-none h-10">
                        <SelectValue placeholder="Select an API key" />
                      </SelectTrigger>
                      <SelectContent className="rounded-none">
                        {apiKeys.map((key) => (
                          <SelectItem key={key.id} value={key.id.toString()} className="rounded-none">
                            <span className="font-medium">{key.name}</span> <span className="text-muted-foreground text-xs ml-2">({key.provider})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div className="h-10 border border-destructive flex items-center px-3 text-sm text-destructive bg-destructive/10">No API keys found.</div>
                      <Button variant="outline" size="sm" className="rounded-none w-fit" onClick={() => setLocation("/api-keys")} type="button">
                        Add API Key
                      </Button>
                    </div>
                  )}
                </div>

                <div className="border-t border-border pt-4">
                  <div className="flex items-center justify-between mb-4">
                    <Label className="font-mono text-xs cursor-pointer" onClick={() => setAdvancedMode(!advancedMode)}>
                      ADVANCED PARAMETERS
                    </Label>
                    <Switch checked={advancedMode} onCheckedChange={setAdvancedMode} />
                  </div>

                  {advancedMode && (
                    <div className="space-y-6 animate-in slide-in-from-top-2">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="subreddit" className="text-xs">SPECIFIC SUBREDDIT (OPTIONAL)</Label>
                          <Input
                            id="subreddit"
                            placeholder="e.g. SaaS, entrepreneur"
                            value={subreddit}
                            onChange={(e) => setSubreddit(e.target.value)}
                            className="rounded-none"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">TIME RANGE</Label>
                          <Select value={timeRange} onValueChange={setTimeRange}>
                            <SelectTrigger className="rounded-none">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-none">
                              <SelectItem value="day">Past 24 Hours</SelectItem>
                              <SelectItem value="week">Past Week</SelectItem>
                              <SelectItem value="month">Past Month</SelectItem>
                              <SelectItem value="year">Past Year</SelectItem>
                              <SelectItem value="all">All Time</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <Label className="text-xs">MAX POSTS TO ANALYZE</Label>
                            <span className="text-xs font-mono">{maxPosts[0]}</span>
                          </div>
                          <Slider value={maxPosts} onValueChange={setMaxPosts} max={100} min={1} step={1} className="py-2" />
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <Label className="text-xs">MAX COMMENTS TO ANALYZE</Label>
                            <span className="text-xs font-mono">{maxComments[0]}</span>
                          </div>
                          <Slider value={maxComments} onValueChange={setMaxComments} max={500} min={10} step={10} className="py-2" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <Button 
                  type="submit" 
                  disabled={createReport.isPending || !apiKeys?.length}
                  className="w-full rounded-none h-12 text-md tracking-widest font-mono bg-primary hover:bg-primary/90 text-primary-foreground mt-4 shadow-[0_0_10px_rgba(0,180,255,0.2)]"
                >
                  {createReport.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> INITIATING...</>
                  ) : (
                    <><Play className="mr-2 h-4 w-4 fill-current" /> RUN REPORT</>
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Recent Reports */}
        <Card className="rounded-none border-border shadow-none">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle className="text-base font-mono flex items-center gap-2">
              <FileText className="h-4 w-4" />
              RECENT RESEARCH
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingDashboard ? (
              <div className="p-6 text-center text-muted-foreground text-sm flex items-center justify-center">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading...
              </div>
            ) : dashboard?.recentReports?.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm font-mono">
                No reports generated yet.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {dashboard?.recentReports?.slice(0, 5).map((report) => (
                  <div 
                    key={report.id} 
                    className="p-4 hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => setLocation(`/reports/${report.id}`)}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <div className="font-medium truncate pr-2 text-sm">{report.keyword}</div>
                      <div className="flex-shrink-0 mt-0.5">
                        {getStatusIcon(report.status)}
                      </div>
                    </div>
                    <div className="flex items-center text-xs text-muted-foreground gap-2 font-mono mt-2">
                      <span>{new Date(report.createdAt).toLocaleDateString()}</span>
                      {report.subreddit && (
                        <>
                          <span>•</span>
                          <span className="text-primary/80">r/{report.subreddit}</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          {dashboard && dashboard.recentReports?.length > 0 && (
            <CardFooter className="p-0 border-t border-border">
              <Button 
                variant="ghost" 
                className="w-full rounded-none border-0 text-xs font-mono text-muted-foreground hover:text-foreground h-10"
                onClick={() => setLocation("/reports")}
              >
                VIEW ALL RESEARCH
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
