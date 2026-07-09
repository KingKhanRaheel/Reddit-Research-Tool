import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { 
  useGetReport, 
  useGetReportStatus,
  useRerunReport,
  getGetReportQueryKey,
  getGetReportStatusQueryKey
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { 
  ArrowLeft, Loader2, RefreshCw, BarChart, AlertTriangle, 
  Lightbulb, Users, Target, Activity, MessageSquare, Zap, ExternalLink,
  CheckCircle2, ShieldAlert, Radio, Calendar, BrainCircuit
} from "lucide-react";
import { format } from "date-fns";
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, 
  BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';

export default function ReportViewer() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Primary report fetch
  const { data: report, isLoading, error } = useGetReport(id);
  const rerunReport = useRerunReport();

  // If report is running, poll for status
  const isRunning = report?.status === "pending" || report?.status === "running";
  
  const { data: reportStatus } = useGetReportStatus(id, {
    query: {
      enabled: !!id && isRunning,
      queryKey: getGetReportStatusQueryKey(id),
      refetchInterval: (data) => {
        if (data?.state?.data?.status === "completed" || data?.state?.data?.status === "failed") {
          return false;
        }
        return 2000;
      }
    }
  });

  // Force a full refetch when status changes to completed
  useEffect(() => {
    if (reportStatus?.status === "completed" && report?.status !== "completed") {
      queryClient.invalidateQueries({ queryKey: getGetReportQueryKey(id) });
    }
  }, [reportStatus?.status, report?.status, queryClient, id]);

  const handleRerun = () => {
    rerunReport.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Report rerun initiated" });
        queryClient.invalidateQueries({ queryKey: getGetReportQueryKey(id) });
      },
      onError: (err) => {
        toast({ title: "Failed to rerun", description: (err as any)?.error || "Unknown error", variant: "destructive" });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex flex-col h-[80vh] items-center justify-center space-y-4">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-bold font-mono">REPORT NOT FOUND</h2>
        <Button variant="outline" className="rounded-none" onClick={() => setLocation("/reports")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Reports
        </Button>
      </div>
    );
  }

  const isGenerating = isRunning || (reportStatus && (reportStatus.status === "pending" || reportStatus.status === "running"));

  if (isGenerating) {
    const progress = reportStatus?.progress || report.progress || 0;
    const msg = reportStatus?.progressMessage || report.progressMessage || "Warming up engines...";

    return (
      <div className="max-w-3xl mx-auto mt-12">
        <Button variant="ghost" className="rounded-none text-muted-foreground mb-8 hover:bg-transparent pl-0 hover:text-foreground" onClick={() => setLocation("/reports")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> BACK
        </Button>
        
        <Card className="rounded-none border-primary/30 shadow-[0_0_30px_rgba(0,180,255,0.05)] bg-[#0a0a0c]">
          <CardHeader className="border-b border-border/50 text-center pb-8 pt-10">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <CardTitle className="font-mono text-2xl tracking-widest text-primary">RESEARCHING SOURCES</CardTitle>
            <p className="text-muted-foreground mt-2 font-mono text-sm uppercase">TARGET: {report.keyword}</p>
          </CardHeader>
          <CardContent className="py-12 px-8">
            <div className="space-y-4 max-w-md mx-auto">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-primary">{msg}</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-1.5 rounded-none bg-secondary">
                <div className="h-full bg-primary shadow-[0_0_10px_rgba(0,180,255,0.8)] transition-all duration-500" style={{ width: `${progress}%` }} />
              </Progress>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (report.status === "failed") {
    return (
      <div className="max-w-3xl mx-auto mt-12">
        <Button variant="ghost" className="rounded-none text-muted-foreground mb-8 hover:bg-transparent pl-0 hover:text-foreground" onClick={() => setLocation("/reports")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> BACK
        </Button>
        <Card className="rounded-none border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="font-mono text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              GENERATION FAILED
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-4 bg-background border border-destructive/20 text-destructive-foreground font-mono text-sm">
              {report.errorMessage || "An unknown error occurred during generation."}
            </div>
            <Button onClick={handleRerun} disabled={rerunReport.isPending} className="rounded-none bg-primary text-primary-foreground">
              {rerunReport.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Retry Report
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const result = report.result as any;
  if (!result) return null; // Should not happen if completed

  // Colors for charts
  const SENTIMENT_COLORS = {
    positive: '#22c55e',
    neutral: '#888888',
    negative: '#ef4444'
  };

  const sentimentData = [
    { name: 'Positive', value: result.overallSentiment?.breakdown?.positive || 0, color: SENTIMENT_COLORS.positive },
    { name: 'Neutral', value: result.overallSentiment?.breakdown?.neutral || 0, color: SENTIMENT_COLORS.neutral },
    { name: 'Negative', value: result.overallSentiment?.breakdown?.negative || 0, color: SENTIMENT_COLORS.negative },
  ].filter(d => d.value > 0);

  const painPointData = result.topPainPoints?.map((p: any) => ({
    name: p.title.length > 20 ? p.title.substring(0, 20) + '...' : p.title,
    frequency: p.frequency
  })) || [];

  const sourceStats = (report.sourceStats as Array<{ platform: string; label: string; status: string; itemCount: number; commentCount: number; error?: string | null }> | null) || [];

  const PlatformTags = ({ platforms }: { platforms?: string[] }) =>
    platforms && platforms.length > 0 ? (
      <div className="flex flex-wrap gap-1 mt-2">
        {platforms.map((p) => (
          <span key={p} className="text-[9px] font-mono uppercase border border-primary/30 text-primary/80 bg-primary/5 px-1.5 py-0.5">
            {p}
          </span>
        ))}
      </div>
    ) : null;

  return (
    <div className="space-y-8 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border/50 py-4 -mx-6 px-6 md:-mx-8 md:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="rounded-none h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-white/5" onClick={() => setLocation("/reports")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold font-mono tracking-tight uppercase">{report.keyword}</h1>
            <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono mt-1 flex-wrap">
              <span>{format(new Date(report.createdAt), 'MMM d, yyyy HH:mm')}</span>
              <span>• {report.postsAnalyzed} Items, {report.commentsAnalyzed} Comments</span>
              <span>• Engine: {report.aiProvider}</span>
            </div>
          </div>
        </div>
        <Button variant="outline" className="rounded-none border-border h-8 font-mono text-xs" onClick={handleRerun} disabled={rerunReport.isPending}>
          {rerunReport.isPending ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-2" />}
          RERUN
        </Button>
      </div>

      {/* Research Statistics */}
      <Card className="rounded-none border-border shadow-none bg-card/30">
        <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
          <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
            <Radio className="h-4 w-4" />
            RESEARCH STATISTICS
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
            <div>
              <div className="text-xs font-mono text-muted-foreground mb-1 flex items-center gap-1"><Radio className="h-3 w-3" /> PLATFORMS SEARCHED</div>
              <div className="text-lg font-bold">{sourceStats.length}</div>
            </div>
            <div>
              <div className="text-xs font-mono text-muted-foreground mb-1 flex items-center gap-1"><Calendar className="h-3 w-3" /> DATE RANGE</div>
              <div className="text-sm font-bold font-mono">
                {report.dateRangeStart && report.dateRangeEnd
                  ? `${format(new Date(report.dateRangeStart), 'MMM d, yyyy')} – ${format(new Date(report.dateRangeEnd), 'MMM d, yyyy')}`
                  : "N/A"}
              </div>
            </div>
            <div>
              <div className="text-xs font-mono text-muted-foreground mb-1 flex items-center gap-1"><BrainCircuit className="h-3 w-3" /> AI MODEL</div>
              <div className="text-sm font-bold font-mono uppercase">{report.aiProvider}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {sourceStats.map((s) => (
              <div key={s.platform} className="border border-border bg-background p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono font-bold uppercase">{s.label}</span>
                  <Badge
                    variant="outline"
                    className={`rounded-none font-mono text-[9px] ${
                      s.status === "success" ? "border-green-500/50 text-green-500 bg-green-500/10" :
                      s.status === "no_results" ? "border-yellow-500/50 text-yellow-500 bg-yellow-500/10" :
                      "border-destructive/50 text-destructive bg-destructive/10"
                    }`}
                  >
                    {s.status === "success" ? "OK" : s.status === "no_results" ? "EMPTY" : "SKIPPED"}
                  </Badge>
                </div>
                <div className="text-sm font-mono text-muted-foreground">{s.itemCount} items / {s.commentCount} comments</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 1. Executive Summary */}
      <Card className="rounded-none border-border shadow-none bg-card/30">
        <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
          <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
            <Zap className="h-4 w-4" />
            1. EXECUTIVE SUMMARY
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <p className="text-foreground leading-relaxed text-sm md:text-base">
            {result.executiveSummary}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 2. Sentiment Analysis */}
        <Card className="rounded-none border-border shadow-none bg-card/30">
          <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
            <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
              <Activity className="h-4 w-4" />
              2. COMMUNITY SENTIMENT
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-8">
            <div className="w-48 h-48 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sentimentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {sentimentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#0f0f12', borderColor: '#24242e', borderRadius: 0, fontFamily: 'monospace', fontSize: '12px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-3xl font-bold font-mono">
                  {Math.round((result.overallSentiment?.score || 0) * 100)}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">INDEX</span>
              </div>
            </div>
            
            <div className="flex-1 space-y-4">
              <div className="font-mono text-sm border-b border-border pb-2">
                OVERALL RATING: <span className={`font-bold ml-2 ${
                  result.overallSentiment?.score > 0.2 ? 'text-green-500' :
                  result.overallSentiment?.score < -0.2 ? 'text-destructive' : 'text-yellow-500'
                }`}>{result.overallSentiment?.label?.toUpperCase()}</span>
              </div>
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-green-500">POSITIVE</span>
                  <span>{result.overallSentiment?.breakdown?.positive}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">NEUTRAL</span>
                  <span>{result.overallSentiment?.breakdown?.neutral}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-destructive">NEGATIVE</span>
                  <span>{result.overallSentiment?.breakdown?.negative}%</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 3. Buying Objections */}
        <Card className="rounded-none border-border shadow-none bg-card/30">
          <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
            <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
              <ShieldAlert className="h-4 w-4" />
              3. BUYING OBJECTIONS
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {result.buyingObjections?.slice(0, 5).map((obj: any, i: number) => (
                <div key={i} className="flex items-start gap-4 p-3 border border-border bg-background">
                  <div className="font-mono text-xl font-bold text-muted-foreground/30 mt-0.5">
                    0{i+1}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground mb-2">{obj.objection}</p>
                    <div className="flex items-center gap-2">
                      <Progress value={obj.frequency} className="h-1 flex-1 rounded-none bg-secondary" />
                      <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{obj.frequency}%</span>
                    </div>
                    <PlatformTags platforms={obj.platforms} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 4. Top Pain Points */}
      <Card className="rounded-none border-border shadow-none bg-card/30">
        <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
          <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
            <AlertTriangle className="h-4 w-4" />
            4. CRITICAL PAIN POINTS
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 h-64 border border-border bg-background p-4">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsBarChart data={painPointData} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#24242e" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#888', fontFamily: 'monospace' }} width={100} />
                  <RechartsTooltip 
                    cursor={{ fill: '#ffffff0a' }}
                    contentStyle={{ backgroundColor: '#0f0f12', borderColor: '#24242e', borderRadius: 0, fontFamily: 'monospace', fontSize: '12px' }}
                  />
                  <Bar dataKey="frequency" fill="hsl(199, 89%, 48%)" radius={0} barSize={16} />
                </RechartsBarChart>
              </ResponsiveContainer>
            </div>
            
            <div className="lg:col-span-2 space-y-4">
              {result.topPainPoints?.map((pp: any, i: number) => (
                <div key={i} className="border-l-2 border-primary pl-4 py-1">
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-bold text-sm text-foreground">{pp.title}</h4>
                    <Badge variant="outline" className="rounded-none font-mono text-[10px] bg-background">
                      IMPACT: {pp.frequency}%
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{pp.description}</p>
                  <PlatformTags platforms={pp.platforms} />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 5. Most Requested Features */}
        <Card className="rounded-none border-border shadow-none bg-card/30">
          <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
            <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
              <Lightbulb className="h-4 w-4" />
              5. REQUESTED FEATURES
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {result.mostRequestedFeatures?.map((feat: any, i: number) => (
                <div key={i} className="p-3 border border-border bg-background hover:border-primary/50 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold text-sm text-foreground">{feat.title}</h4>
                    <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 border border-primary/20">
                      {feat.votes} MENTIONS
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{feat.description}</p>
                  <PlatformTags platforms={feat.platforms} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 6. Opportunity Gaps */}
        <Card className="rounded-none border-border shadow-none bg-card/30">
          <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
            <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
              <Target className="h-4 w-4" />
              6. OPPORTUNITY GAPS
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {result.opportunityGaps?.map((gap: any, i: number) => (
                <div key={i} className="p-4 border border-border bg-primary/5 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                  <h4 className="font-bold text-sm text-foreground mb-2">{gap.gap}</h4>
                  <p className="text-sm text-muted-foreground">{gap.description}</p>
                  <PlatformTags platforms={gap.platforms} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 7. Actionable Recommendations */}
      <Card className="rounded-none border-primary/50 shadow-none bg-card/30 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-cyan-300" />
        <CardHeader className="border-b border-border/50 bg-primary/5 pb-4">
          <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
            <BarChart className="h-4 w-4" />
            7. TACTICAL RECOMMENDATIONS
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {result.actionableRecommendations?.map((rec: any, i: number) => (
              <div key={i} className="flex flex-col border border-border bg-background">
                <div className={`p-2 text-xs font-mono font-bold text-center border-b border-border uppercase ${
                  rec.priority === 'high' ? 'bg-destructive/10 text-destructive border-b-destructive/20' :
                  rec.priority === 'medium' ? 'bg-yellow-500/10 text-yellow-500 border-b-yellow-500/20' :
                  'bg-muted/50 text-muted-foreground'
                }`}>
                  PRIORITY: {rec.priority}
                </div>
                <div className="p-4 flex-1">
                  <h4 className="font-bold text-sm text-foreground mb-3">{rec.recommendation}</h4>
                  <p className="text-xs text-muted-foreground border-l border-border pl-3 mt-auto">
                    <span className="font-mono text-[10px] uppercase block mb-1 text-foreground">Rationale:</span>
                    {rec.rationale}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 8. Competitors */}
        <Card className="rounded-none border-border shadow-none bg-card/30">
          <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
            <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
              <Users className="h-4 w-4" />
              8. COMPETITOR LANDSCAPE
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 p-0">
            <div className="divide-y divide-border">
              {result.competitorsMentioned?.map((comp: any, i: number) => (
                <div key={i} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                  <div>
                    <h4 className="font-bold text-sm text-foreground">{comp.name}</h4>
                    <span className="text-xs text-muted-foreground font-mono">{comp.mentions} MENTIONS</span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="outline" className={`rounded-none font-mono text-xs uppercase ${
                      comp.sentiment === 'positive' ? 'border-green-500 text-green-500' :
                      comp.sentiment === 'negative' ? 'border-destructive text-destructive' :
                      'border-muted-foreground text-muted-foreground'
                    }`}>
                      {comp.sentiment}
                    </Badge>
                    <PlatformTags platforms={comp.platforms} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 9. Most Loved Features */}
        <Card className="rounded-none border-border shadow-none bg-card/30">
          <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
            <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
              <CheckCircle2 className="h-4 w-4" />
              9. WHAT USERS LOVE
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {result.mostLovedFeatures?.map((feat: any, i: number) => (
                <div key={i} className="flex gap-3">
                  <div className="mt-0.5 text-green-500"><CheckCircle2 className="h-4 w-4" /></div>
                  <div>
                    <h4 className="font-bold text-sm text-foreground">{feat.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1">{feat.description}</p>
                    <PlatformTags platforms={feat.platforms} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 10. Customer Personas */}
      <Card className="rounded-none border-border shadow-none bg-card/30">
        <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
          <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
            <Users className="h-4 w-4" />
            10. CUSTOMER PERSONAS
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {result.customerPersonas?.map((persona: any, i: number) => (
              <div key={i} className="border border-border bg-background p-5">
                <h4 className="font-bold font-mono text-sm text-primary mb-2 uppercase">{persona.name}</h4>
                <p className="text-sm text-foreground mb-4">{persona.description}</p>
                <div className="flex flex-wrap gap-2">
                  {persona.traits?.map((trait: string, j: number) => (
                    <span key={j} className="text-[10px] font-mono border border-border px-2 py-1 text-muted-foreground">
                      {trait}
                    </span>
                  ))}
                </div>
                <PlatformTags platforms={persona.platforms} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 11. Key Threads */}
      <Card className="rounded-none border-border shadow-none bg-card/30">
        <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
          <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
            <MessageSquare className="h-4 w-4" />
            11. SOURCE THREADS
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 p-0">
          <div className="divide-y divide-border">
            {result.keyThreads?.map((thread: any, i: number) => (
              <div key={i} className="p-4 md:p-6 hover:bg-white/5 transition-colors">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1">
                    {thread.platform && (
                      <span className="text-[9px] font-mono uppercase border border-primary/30 text-primary/80 bg-primary/5 px-1.5 py-0.5 mb-2 inline-block">
                        {thread.platform}
                      </span>
                    )}
                    <h4 className="font-medium text-sm text-foreground leading-snug">{thread.title}</h4>
                  </div>
                  <a href={thread.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 flex-shrink-0">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
                <p className="text-sm text-muted-foreground mb-4 pl-3 border-l-2 border-border italic">
                  "{thread.summary}"
                </p>
                <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
                  <span className="flex items-center gap-1"><ArrowLeft className="h-3 w-3 rotate-90" /> {thread.score}</span>
                  <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {thread.commentCount}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
