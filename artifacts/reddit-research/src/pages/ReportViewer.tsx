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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
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
            <div className="space-y-4 max-w-lg mx-auto">
              <div className="flex flex-col gap-4 bg-card/60 p-4 border border-border/50 font-mono text-xs text-left">
                <div className="text-primary whitespace-pre-wrap leading-relaxed">{msg}</div>
                <div className="text-right text-muted-foreground">{progress}%</div>
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

  const EvidenceBadge = ({ 
    platforms, 
    supportingDiscussionsCount, 
    confidenceScore 
  }: { 
    platforms?: string[], 
    supportingDiscussionsCount?: number, 
    confidenceScore?: number 
  }) => {
    return (
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {supportingDiscussionsCount !== undefined && (
          <span className="text-[10px] font-mono text-muted-foreground bg-muted/40 px-2 py-0.5 border border-border/50">
            {supportingDiscussionsCount} {supportingDiscussionsCount === 1 ? "discussion" : "discussions"}
          </span>
        )}
        {confidenceScore !== undefined && (
          <span className="text-[10px] font-mono text-muted-foreground bg-muted/40 px-2 py-0.5 border border-border/50">
            Confidence: {confidenceScore}/10
          </span>
        )}
        {platforms && platforms.length > 0 && (
          <div className="flex gap-1">
            {platforms.map((p) => (
              <span key={p} className="text-[9px] font-mono uppercase border border-primary/20 text-primary/70 bg-primary/5 px-1.5 py-0.5">
                {p}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderProductAnalysis = (res: any) => {
    return (
      <div className="space-y-8">
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
              {res.executiveSummary}
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
                      {sentimentData.map((entry: any, index: number) => (
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
                    {Math.round((res.overallSentiment?.score || 0) * 100)}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">INDEX</span>
                </div>
              </div>
              
              <div className="flex-1 space-y-4">
                <div className="font-mono text-sm border-b border-border pb-2">
                  OVERALL RATING: <span className={`font-bold ml-2 ${
                    res.overallSentiment?.score > 0.2 ? 'text-green-500' :
                    res.overallSentiment?.score < -0.2 ? 'text-destructive' : 'text-yellow-500'
                  }`}>{res.overallSentiment?.label?.toUpperCase()}</span>
                </div>
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-green-500">POSITIVE</span>
                    <span>{res.overallSentiment?.breakdown?.positive}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">NEUTRAL</span>
                    <span>{res.overallSentiment?.breakdown?.neutral}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-destructive">NEGATIVE</span>
                    <span>{res.overallSentiment?.breakdown?.negative}%</span>
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
                {res.buyingObjections?.slice(0, 5).map((obj: any, i: number) => (
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
                      <EvidenceBadge platforms={obj.platforms} supportingDiscussionsCount={obj.supportingDiscussionsCount} confidenceScore={obj.confidenceScore} />
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
                {res.topPainPoints?.map((pp: any, i: number) => (
                  <div key={i} className="border-l-2 border-primary pl-4 py-1">
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-bold text-sm text-foreground">{pp.title}</h4>
                      <Badge variant="outline" className="rounded-none font-mono text-[10px] bg-background">
                        IMPACT: {pp.frequency}%
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{pp.description}</p>
                    <EvidenceBadge platforms={pp.platforms} supportingDiscussionsCount={pp.supportingDiscussionsCount} confidenceScore={pp.confidenceScore} />
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
                {res.mostRequestedFeatures?.map((feat: any, i: number) => (
                  <div key={i} className="p-3 border border-border bg-background hover:border-primary/50 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-bold text-sm text-foreground">{feat.title}</h4>
                      <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 border border-primary/20">
                        {feat.votes} MENTIONS
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{feat.description}</p>
                    <EvidenceBadge platforms={feat.platforms} supportingDiscussionsCount={feat.supportingDiscussionsCount} confidenceScore={feat.confidenceScore} />
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
                {res.opportunityGaps?.map((gap: any, i: number) => (
                  <div key={i} className="p-4 border border-border bg-primary/5 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                    <h4 className="font-bold text-sm text-foreground mb-2">{gap.gap}</h4>
                    <p className="text-sm text-muted-foreground">{gap.description}</p>
                    <EvidenceBadge platforms={gap.platforms} supportingDiscussionsCount={gap.supportingDiscussionsCount} confidenceScore={gap.confidenceScore} />
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
              {res.actionableRecommendations?.map((rec: any, i: number) => (
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
                    <p className="text-xs text-muted-foreground border-l border-border pl-3 mt-auto mb-2">
                      <span className="font-mono text-[10px] uppercase block mb-1 text-foreground">Rationale:</span>
                      {rec.rationale}
                    </p>
                    <EvidenceBadge platforms={rec.platforms} supportingDiscussionsCount={rec.supportingDiscussionsCount} confidenceScore={rec.confidenceScore} />
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
                {res.competitorsMentioned?.map((comp: any, i: number) => (
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
                      <EvidenceBadge platforms={comp.platforms} supportingDiscussionsCount={comp.supportingDiscussionsCount} confidenceScore={comp.confidenceScore} />
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
                {res.mostLovedFeatures?.map((feat: any, i: number) => (
                  <div key={i} className="flex gap-3">
                    <div className="mt-0.5 text-green-500"><CheckCircle2 className="h-4 w-4" /></div>
                    <div>
                      <h4 className="font-bold text-sm text-foreground">{feat.title}</h4>
                      <p className="text-sm text-muted-foreground mt-1">{feat.description}</p>
                      <EvidenceBadge platforms={feat.platforms} supportingDiscussionsCount={feat.supportingDiscussionsCount} confidenceScore={feat.confidenceScore} />
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
              {res.customerPersonas?.map((persona: any, i: number) => (
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
                  <EvidenceBadge platforms={persona.platforms} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderFeatureResearch = (res: any) => {
    return (
      <div className="space-y-8">
        <Card className="rounded-none border-border shadow-none bg-card/30">
          <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
            <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
              <Zap className="h-4 w-4" />
              FEATURE OVERVIEW
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <p className="text-foreground leading-relaxed text-sm">{res.featureOverview}</p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="rounded-none border-border shadow-none bg-card/30">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
                <MessageSquare className="h-4 w-4" />
                USER FEEDBACK & SENTIMENT
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {res.userFeedback?.map((fb: any, i: number) => (
                  <div key={i} className="p-3 border border-border bg-background">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">{fb.feedback}</span>
                      <Badge variant="outline" className={`rounded-none font-mono text-[9px] uppercase ${
                        fb.sentiment === "positive" ? "border-green-500/50 text-green-500 bg-green-500/10" :
                        fb.sentiment === "negative" ? "border-destructive/50 text-destructive bg-destructive/10" :
                        "border-muted-foreground/50 text-muted-foreground bg-muted/10"
                      }`}>
                        {fb.sentiment}
                      </Badge>
                    </div>
                    <EvidenceBadge platforms={fb.platforms} supportingDiscussionsCount={fb.supportingDiscussionsCount} confidenceScore={fb.confidenceScore} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-none border-border shadow-none bg-card/30 flex flex-col justify-between">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
                <Target className="h-4 w-4" />
                OPPORTUNITY SCORE
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-8 flex-1 flex flex-col items-center justify-center text-center space-y-4">
              <div className="h-32 w-32 rounded-full border-4 border-primary/30 flex flex-col items-center justify-center relative bg-[#0a0a0c] shadow-[0_0_20px_rgba(0,180,255,0.05)]">
                <span className="text-4xl font-bold font-mono text-primary">{res.opportunityScore?.score}</span>
                <span className="text-[10px] text-muted-foreground font-mono">OUT OF 10</span>
              </div>
              <p className="text-sm text-muted-foreground max-w-sm mt-4">{res.opportunityScore?.explanation}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="rounded-none border-border shadow-none bg-card/30">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-green-500">
                <CheckCircle2 className="h-4 w-4" />
                KEY ADVANTAGES (PROS)
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {res.advantages?.map((adv: any, i: number) => (
                  <div key={i} className="border-l-2 border-green-500 pl-4 py-1">
                    <h4 className="font-bold text-sm text-foreground">{adv.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1">{adv.description}</p>
                    <EvidenceBadge platforms={adv.platforms} supportingDiscussionsCount={adv.supportingDiscussionsCount} confidenceScore={adv.confidenceScore} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-none border-border shadow-none bg-card/30">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-destructive">
                <ShieldAlert className="h-4 w-4" />
                LIMITATIONS & PAIN POINTS (CONS)
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {res.limitations?.map((lim: any, i: number) => (
                  <div key={i} className="border-l-2 border-destructive pl-4 py-1">
                    <h4 className="font-bold text-sm text-foreground">{lim.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1">{lim.description}</p>
                    <EvidenceBadge platforms={lim.platforms} supportingDiscussionsCount={lim.supportingDiscussionsCount} confidenceScore={lim.confidenceScore} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="rounded-none border-border shadow-none bg-card/30">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
                <Users className="h-4 w-4" />
                COMMON USE CASES
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {res.commonUseCases?.map((uc: any, i: number) => (
                  <div key={i} className="p-4 border border-border bg-background hover:border-primary/30 transition-colors">
                    <h4 className="font-bold text-sm text-foreground mb-2">{uc.useCase}</h4>
                    <p className="text-sm text-muted-foreground">{uc.description}</p>
                    <EvidenceBadge platforms={uc.platforms} supportingDiscussionsCount={uc.supportingDiscussionsCount} confidenceScore={uc.confidenceScore} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-none border-border shadow-none bg-card/30">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
                <Lightbulb className="h-4 w-4" />
                REQUESTED IMPROVEMENTS
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {res.requestedImprovements?.map((imp: any, i: number) => (
                  <div key={i} className="p-3 border border-border bg-background">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-bold text-sm text-foreground">{imp.improvement}</h4>
                      <Badge variant="outline" className={`rounded-none font-mono text-[9px] uppercase ${
                        imp.urgency === "high" ? "border-destructive/50 text-destructive bg-destructive/10" :
                        imp.urgency === "medium" ? "border-yellow-500/50 text-yellow-500 bg-yellow-500/10" :
                        "border-muted-foreground/50 text-muted-foreground bg-muted/10"
                      }`}>
                        {imp.urgency} URGENCY
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{imp.description}</p>
                    <EvidenceBadge platforms={imp.platforms} supportingDiscussionsCount={imp.supportingDiscussionsCount} confidenceScore={imp.confidenceScore} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  const renderComparison = (res: any) => {
    return (
      <div className="space-y-8">
        <Card className="rounded-none border-border shadow-none bg-card/30">
          <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
            <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
              <Activity className="h-4 w-4" />
              FEATURE COMPARISON MATRIX
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent border-border">
                    <TableHead className="w-[180px] font-mono text-xs">FEATURE</TableHead>
                    <TableHead className="font-mono text-xs">PRODUCT A</TableHead>
                    <TableHead className="font-mono text-xs">PRODUCT B</TableHead>
                    <TableHead className="font-mono text-xs">COMPARATIVE INSIGHT</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {res.featureComparison?.map((fc: any, i: number) => (
                    <TableRow key={i} className="border-border hover:bg-muted/10 font-mono text-sm">
                      <TableCell className="font-bold text-foreground">{fc.feature}</TableCell>
                      <TableCell className="text-muted-foreground">{fc.productA}</TableCell>
                      <TableCell className="text-muted-foreground">{fc.productB}</TableCell>
                      <TableCell className="text-xs text-foreground font-sans max-w-xs">{fc.comparison}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="rounded-none border-border shadow-none bg-card/30">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
                <Zap className="h-4 w-4" />
                PRICING & VALUES
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <p className="text-sm text-foreground leading-relaxed">{res.pricing?.comparison}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {res.pricing?.details?.map((pr: any, i: number) => (
                  <div key={i} className="border border-border bg-background p-3">
                    <div className="text-xs font-mono text-muted-foreground uppercase">PRODUCT</div>
                    <div className="text-sm font-bold mt-0.5">{pr.product}</div>
                    <div className="text-xs font-mono text-primary uppercase mt-2">MODEL</div>
                    <div className="text-xs font-bold font-mono mt-0.5">{pr.priceModel}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-none border-border shadow-none bg-card/30 flex flex-col justify-between">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
                <Users className="h-4 w-4" />
                COMMUNITY PREFERENCE
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 flex-1 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="text-sm font-mono uppercase text-muted-foreground">
                  PREFERRED CHOICE: <span className="text-primary font-bold ml-1">{res.userPreference?.preferredProduct?.toUpperCase()}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{res.userPreference?.details}</p>
              </div>
              <div className="space-y-3 mt-6">
                {res.userPreference?.breakdownPercent?.map((bp: any, i: number) => (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-xs font-mono">
                      <span>{bp.product}</span>
                      <span>{bp.percent}%</span>
                    </div>
                    <Progress value={bp.percent} className="h-1 rounded-none bg-secondary" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="rounded-none border-border shadow-none bg-card/30">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-green-500">
                <CheckCircle2 className="h-4 w-4" />
                STRENGTHS DETECTED
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {res.strengths?.map((str: any, i: number) => (
                  <div key={i} className="border-l-2 border-green-500 pl-4 py-1">
                    <span className="text-[10px] font-mono uppercase bg-green-500/10 text-green-500 px-1.5 py-0.5 border border-green-500/20 inline-block mb-1">{str.product}</span>
                    <h4 className="font-bold text-sm text-foreground">{str.strength}</h4>
                    <p className="text-xs text-muted-foreground mt-1">{str.details}</p>
                    <EvidenceBadge platforms={str.platforms} supportingDiscussionsCount={str.supportingDiscussionsCount} confidenceScore={str.confidenceScore} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-none border-border shadow-none bg-card/30">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-destructive">
                <ShieldAlert className="h-4 w-4" />
                WEAKNESSES / DISADVANTAGES
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {res.weaknesses?.map((wk: any, i: number) => (
                  <div key={i} className="border-l-2 border-destructive pl-4 py-1">
                    <span className="text-[10px] font-mono uppercase bg-destructive/10 text-destructive px-1.5 py-0.5 border border-destructive/20 inline-block mb-1">{wk.product}</span>
                    <h4 className="font-bold text-sm text-foreground">{wk.weakness}</h4>
                    <p className="text-xs text-muted-foreground mt-1">{wk.details}</p>
                    <EvidenceBadge platforms={wk.platforms} supportingDiscussionsCount={wk.supportingDiscussionsCount} confidenceScore={wk.confidenceScore} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="rounded-none border-border shadow-none bg-card/30">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
                <RefreshCw className="h-4 w-4" />
                MIGRATION / SWITCHING MOTIVATIONS
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {res.switchingReasons?.map((sw: any, i: number) => (
                  <div key={i} className="p-3 border border-border bg-background">
                    <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-muted-foreground mb-1">
                      <span>{sw.fromProduct}</span>
                      <span>→</span>
                      <span className="text-primary font-bold">{sw.toProduct}</span>
                    </div>
                    <h4 className="font-bold text-sm text-foreground">{sw.reason}</h4>
                    <p className="text-xs text-muted-foreground mt-1 mb-2">{sw.details}</p>
                    <EvidenceBadge platforms={sw.platforms} supportingDiscussionsCount={sw.supportingDiscussionsCount} confidenceScore={sw.confidenceScore} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-none border-border shadow-none bg-card/30">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
                <Target className="h-4 w-4" />
                IDEAL USE CASES
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {res.bestFor?.map((bf: any, i: number) => (
                  <div key={i} className="p-3 border border-border bg-background">
                    <div className="text-xs font-mono text-primary font-bold uppercase mb-1">{bf.product}</div>
                    <p className="text-sm font-medium text-foreground">{bf.scenario}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-none border-primary/40 shadow-none bg-card/30 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-cyan-300" />
          <CardHeader className="border-b border-border/50 bg-primary/5 pb-4">
            <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
              <BarChart className="h-4 w-4" />
              FINAL VERDICT
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <p className="text-foreground leading-relaxed text-sm md:text-base border-l border-border pl-4">{res.finalVerdict}</p>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderRecommendation = (res: any) => {
    return (
      <div className="space-y-8">
        <div className="space-y-4">
          <h3 className="font-mono text-sm text-muted-foreground uppercase tracking-widest pl-1">RANKED OPTIONS</h3>
          <div className="space-y-4">
            {res.rankedList?.map((item: any, i: number) => (
              <Card key={i} className="rounded-none border-border shadow-none bg-card/30 relative overflow-hidden">
                <div className="absolute top-0 left-0 h-full w-1.5 bg-primary/50" />
                <CardContent className="pt-6 pl-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xl font-black text-primary bg-primary/10 h-8 w-8 flex items-center justify-center border border-primary/20">
                        {item.rank}
                      </span>
                      <h4 className="text-base font-bold text-foreground">{item.name}</h4>
                      <Badge variant="outline" className="rounded-none font-mono text-[9px] border-primary/30 text-primary/80 uppercase">
                        BEST FOR: {item.bestFor}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                    <div className="text-xs font-mono text-muted-foreground pt-1">
                      <span className="uppercase text-[10px] mr-2">PRICING:</span> {item.pricing}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-center bg-background border border-border/80 p-4 min-w-[120px]">
                    <div className="text-[10px] font-mono text-muted-foreground uppercase">SCORE</div>
                    <div className="text-3xl font-extrabold font-mono text-primary mt-1">{item.score}</div>
                    <div className="text-[9px] font-mono text-muted-foreground">OUT OF 10</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="rounded-none border-border shadow-none bg-card/30">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
                <Zap className="h-4 w-4" />
                PROS & CONS SUMMARY
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 divide-y divide-border/50">
              {res.prosAndCons?.map((pc: any, i: number) => (
                <div key={i} className="py-4 first:pt-0 last:pb-0 space-y-3">
                  <h4 className="font-bold text-sm text-primary uppercase">{pc.product}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <div className="text-[9px] font-mono text-green-500 uppercase">PROS</div>
                      <ul className="list-disc pl-4 space-y-1 text-xs text-muted-foreground">
                        {pc.pros?.map((pro: string, j: number) => <li key={j}>{pro}</li>)}
                      </ul>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[9px] font-mono text-destructive uppercase">CONS</div>
                      <ul className="list-disc pl-4 space-y-1 text-xs text-muted-foreground">
                        {pc.cons?.map((con: string, j: number) => <li key={j}>{con}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-none border-border shadow-none bg-card/30">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
                <Target className="h-4 w-4" />
                SCENARIO MATCHMAKER
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {res.bestFor?.map((bf: any, i: number) => (
                  <div key={i} className="p-3 border border-border bg-background">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-mono text-primary font-bold uppercase">{bf.recommendedProduct}</span>
                      <span className="text-[9px] font-mono text-muted-foreground uppercase">SCENARIO</span>
                    </div>
                    <h4 className="font-bold text-sm text-foreground mb-2">{bf.scenario}</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">{bf.rationale}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="rounded-none border-border shadow-none bg-card/30">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
                <Zap className="h-4 w-4" />
                PRICING OVERVIEW
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <p className="text-sm text-foreground leading-relaxed">{res.pricing?.summary}</p>
              <div className="space-y-3">
                {res.pricing?.comparison?.map((pr: any, i: number) => (
                  <div key={i} className="flex justify-between items-start gap-4 p-2 border-b border-border last:border-b-0 text-sm">
                    <span className="font-bold font-mono text-xs">{pr.product}</span>
                    <span className="text-muted-foreground text-xs text-right">{pr.details}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-none border-border shadow-none bg-card/30">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
                <Users className="h-4 w-4" />
                COMMUNITY CONSENSUS
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-primary pl-3 italic">"{res.communityConsensus?.generalOpinion}"</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="space-y-2">
                  <span className="text-[10px] font-mono text-green-500 uppercase block font-bold">COMMON AGREEMENTS</span>
                  <ul className="list-disc pl-4 space-y-1 text-xs text-muted-foreground">
                    {res.communityConsensus?.majorAgreements?.map((ag: string, j: number) => <li key={j}>{ag}</li>)}
                  </ul>
                </div>
                <div className="space-y-2">
                  <span className="text-[10px] font-mono text-destructive uppercase block font-bold">DEBATED/CONTROVERSIAL POINTS</span>
                  <ul className="list-disc pl-4 space-y-1 text-xs text-muted-foreground">
                    {res.communityConsensus?.majorDisagreements?.map((da: string, j: number) => <li key={j}>{da}</li>)}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-none border-primary/40 shadow-none bg-card/30 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-cyan-300" />
          <CardHeader className="border-b border-border/50 bg-primary/5 pb-4">
            <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
              <Lightbulb className="h-4 w-4" />
              FINAL RECOMMENDATION
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <p className="text-foreground leading-relaxed text-sm md:text-base border-l border-border pl-4">{res.finalRecommendation}</p>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderProblemDiscovery = (res: any) => {
    const severities = res.severityBreakdown || { critical: 0, major: 0, minor: 0 };
    const severityData = [
      { name: 'Critical', value: severities.critical || 0, color: '#ef4444' },
      { name: 'Major', value: severities.major || 0, color: '#f59e0b' },
      { name: 'Minor', value: severities.minor || 0, color: '#888888' },
    ].filter(d => d.value > 0);

    return (
      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="rounded-none border-border shadow-none bg-card/30">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
                <ShieldAlert className="h-4 w-4" />
                COMPLAINTS SEVERITY BREAKDOWN
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-8">
              <div className="w-40 h-40 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={severityData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={65}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {severityData.map((entry: any, index: number) => (
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
                  <span className="text-xs text-muted-foreground font-mono">TREND</span>
                  <span className="text-sm font-bold font-mono text-primary uppercase">{res.frequencyTrend}</span>
                </div>
              </div>
              
              <div className="flex-1 space-y-3 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-red-500">CRITICAL</span>
                  <span>{severities.critical}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-yellow-500">MAJOR</span>
                  <span>{severities.major}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">MINOR</span>
                  <span>{severities.minor}%</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-none border-border shadow-none bg-card/30 flex flex-col justify-center">
            <CardContent className="p-6 space-y-4">
              <h4 className="font-mono text-sm text-primary uppercase">PROBLEM DISCOVERY METRICS</h4>
              <div className="space-y-2 border-l border-border pl-4 py-1 text-sm text-muted-foreground leading-relaxed">
                Based on the analyzed user feedback, discussions have been classified and ranked by issue severity. Crucial complaints centered around technical friction, usability blocks, or limitations, with a trend indicators pointing to a <span className="text-primary font-mono font-bold uppercase">{res.frequencyTrend}</span> momentum of comments.
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-none border-border shadow-none bg-card/30">
          <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
            <CardTitle className="font-mono text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              BIGGEST COMPLAINTS & BUGS
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {res.biggestComplaints?.map((comp: any, i: number) => (
                <div key={i} className="flex items-start gap-4 p-4 border border-border bg-background">
                  <div className="font-mono text-lg font-bold text-muted-foreground/30 mt-0.5">
                    0{i+1}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap justify-between items-start gap-2">
                      <h4 className="font-bold text-sm text-foreground">{comp.complaint}</h4>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`rounded-none font-mono text-[9px] uppercase ${
                          comp.severity === "critical" ? "border-red-500/50 text-red-500 bg-red-500/10" :
                          comp.severity === "major" ? "border-yellow-500/50 text-yellow-500 bg-yellow-500/10" :
                          "border-muted-foreground/50 text-muted-foreground bg-muted/10"
                        }`}>
                          {comp.severity} severity
                        </Badge>
                        <span className="text-[10px] font-mono text-muted-foreground bg-secondary/50 px-2 py-0.5 border">
                          Freq: {comp.frequency}/10
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{comp.description}</p>
                    <EvidenceBadge platforms={comp.platforms} supportingDiscussionsCount={comp.supportingDiscussionsCount} confidenceScore={comp.confidenceScore} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="rounded-none border-border shadow-none bg-card/30">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
                <Zap className="h-4 w-4" />
                ROOT CAUSES ANALYSIS
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {res.rootCauses?.map((rc: any, i: number) => (
                  <div key={i} className="p-3 border border-border bg-background">
                    <div className="text-xs font-mono text-destructive uppercase mb-1">COMPLAINT: {rc.complaint}</div>
                    <h4 className="font-bold text-sm text-foreground">{rc.cause}</h4>
                    <p className="text-xs text-muted-foreground mt-1 mb-2 leading-relaxed">{rc.explanation}</p>
                    <EvidenceBadge platforms={rc.platforms} supportingDiscussionsCount={rc.supportingDiscussionsCount} confidenceScore={rc.confidenceScore} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-none border-border shadow-none bg-card/30">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
                <Lightbulb className="h-4 w-4" />
                SUGGESTED RESOLUTIONS
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {res.suggestedImprovements?.map((imp: any, i: number) => (
                  <div key={i} className="p-3 border border-border bg-background">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-bold text-sm text-foreground">{imp.improvement}</h4>
                      <Badge variant="outline" className={`rounded-none font-mono text-[9px] uppercase ${
                        imp.priority === "high" ? "border-red-500/50 text-red-500 bg-red-500/10" :
                        imp.priority === "medium" ? "border-yellow-500/50 text-yellow-500 bg-yellow-500/10" :
                        "border-muted-foreground/50 text-muted-foreground bg-muted/10"
                      }`}>
                        {imp.priority} priority
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{imp.description}</p>
                    <EvidenceBadge platforms={imp.platforms} supportingDiscussionsCount={imp.supportingDiscussionsCount} confidenceScore={imp.confidenceScore} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  const renderTrend = (res: any) => {
    return (
      <div className="space-y-8">
        <Card className="rounded-none border-border shadow-none bg-card/30">
          <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
            <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
              <Activity className="h-4 w-4" />
              DETECTED GROWTH TRENDS
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {res.growthTrends?.map((trend: any, i: number) => (
                <div key={i} className="p-4 border border-border bg-background hover:border-primary/30 transition-colors">
                  <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
                    <h4 className="font-bold text-sm text-foreground">{trend.trend}</h4>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`rounded-none font-mono text-[9px] uppercase ${
                        trend.direction === "up" ? "border-green-500/50 text-green-500 bg-green-500/10" :
                        trend.direction === "down" ? "border-red-500/50 text-red-500 bg-red-500/10" :
                        "border-muted-foreground/50 text-muted-foreground bg-muted/10"
                      }`}>
                        DIRECTION: {trend.direction}
                      </Badge>
                      <Badge variant="outline" className="rounded-none font-mono text-[9px] border-primary/30 text-primary/80 uppercase">
                        MOMENTUM: {trend.momentum}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-2">{trend.description}</p>
                  <EvidenceBadge platforms={trend.platforms} supportingDiscussionsCount={trend.supportingDiscussionsCount} confidenceScore={trend.confidenceScore} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="rounded-none border-border shadow-none bg-card/30">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
                <Users className="h-4 w-4" />
                POPULAR PRODUCTS & ENTITIES
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {res.popularProducts?.map((prod: any, i: number) => (
                  <div key={i} className="p-3 border border-border bg-background">
                    <h4 className="font-bold text-sm text-foreground mb-1">{prod.name}</h4>
                    <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{prod.description}</p>
                    <div className="text-[10px] font-mono text-primary mb-2">Growth Indicator: {prod.growthIndicator}</div>
                    <EvidenceBadge platforms={prod.platforms} supportingDiscussionsCount={prod.supportingDiscussionsCount} confidenceScore={prod.confidenceScore} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-none border-border shadow-none bg-card/30">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
                <Target className="h-4 w-4" />
                EMERGING TOPICS
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {res.emergingTopics?.map((top: any, i: number) => (
                  <div key={i} className="p-3 border border-border bg-background">
                    <h4 className="font-bold text-sm text-foreground mb-1">{top.topic}</h4>
                    <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{top.relevance}</p>
                    <EvidenceBadge platforms={top.platforms} supportingDiscussionsCount={top.supportingDiscussionsCount} confidenceScore={top.confidenceScore} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="rounded-none border-border shadow-none bg-card/30">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
                <MessageSquare className="h-4 w-4" />
                COMMUNITY THEMES & DISCUSSION
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {res.communityDiscussions?.map((theme: any, i: number) => (
                  <div key={i} className="p-3 border border-border bg-background">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-bold text-foreground">{theme.theme}</span>
                      <Badge variant="outline" className={`rounded-none font-mono text-[9px] uppercase ${
                        theme.generalSentiment === "positive" ? "border-green-500/50 text-green-500 bg-green-500/10" :
                        theme.generalSentiment === "negative" ? "border-destructive/50 text-destructive bg-destructive/10" :
                        "border-muted-foreground/50 text-muted-foreground bg-muted/10"
                      }`}>
                        SENTIMENT: {theme.generalSentiment}
                      </Badge>
                    </div>
                    <ul className="list-disc pl-4 space-y-1 text-xs text-muted-foreground">
                      {theme.keyQuotesOrOpinions?.map((quote: string, j: number) => <li key={j}>"{quote}"</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-none border-border shadow-none bg-card/30">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
                <Lightbulb className="h-4 w-4" />
                OPPORTUNITIES DETECTED
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {res.opportunities?.map((opp: any, i: number) => (
                  <div key={i} className="p-3 border border-border bg-primary/5 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                    <h4 className="font-bold text-sm text-foreground mb-1">{opp.opportunity}</h4>
                    <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{opp.description}</p>
                    <EvidenceBadge platforms={opp.platforms} supportingDiscussionsCount={opp.supportingDiscussionsCount} confidenceScore={opp.confidenceScore} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  const renderMarketValidation = (res: any) => {
    return (
      <div className="space-y-8">
        <Card className="rounded-none border-primary shadow-none bg-primary/5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-cyan-300" />
          <CardHeader className="border-b border-border/50 bg-primary/10 pb-4">
            <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
              <BarChart className="h-4 w-4" />
              BUILD RECOMMENDATION & MVPS
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 flex flex-col md:flex-row gap-6">
            <div className="flex-shrink-0 flex flex-col items-center justify-center p-6 bg-background border border-border min-w-[200px] text-center">
              <span className="text-[10px] font-mono text-muted-foreground uppercase">VERDICT</span>
              <Badge variant="outline" className={`rounded-none font-mono text-lg uppercase py-1 px-3 mt-2 tracking-widest ${
                res.buildRecommendation?.verdict === "build" ? "border-green-500 text-green-500 bg-green-500/10" :
                res.buildRecommendation?.verdict === "pivot" ? "border-yellow-500 text-yellow-500 bg-yellow-500/10" :
                "border-destructive text-destructive bg-destructive/10"
              }`}>
                {res.buildRecommendation?.verdict?.replace("_", " ")}
              </Badge>
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <span className="text-[10px] font-mono text-muted-foreground uppercase block mb-1">RATIONALE</span>
                <p className="text-sm leading-relaxed text-foreground">{res.buildRecommendation?.reasoning}</p>
              </div>
              <div>
                <span className="text-[10px] font-mono text-muted-foreground uppercase block mb-1">RECOMMENDED MVP FEATURES</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {res.buildRecommendation?.recommendedMVPFeatures?.map((feat: string, i: number) => (
                    <span key={i} className="text-xs font-mono border bg-background px-2.5 py-1 border-border/80">
                      {feat}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="rounded-none border-border shadow-none bg-card/30">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
                <Activity className="h-4 w-4" />
                DEMAND SIGNALS
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {res.demandSignals?.map((sig: any, i: number) => (
                  <div key={i} className="p-3 border border-border bg-background">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-bold text-sm text-foreground">{sig.signal}</h4>
                      <Badge variant="outline" className={`rounded-none font-mono text-[9px] uppercase ${
                        sig.strength === "strong" ? "border-green-500/50 text-green-500 bg-green-500/10" :
                        sig.strength === "moderate" ? "border-yellow-500/50 text-yellow-500 bg-yellow-500/10" :
                        "border-red-500/50 text-red-500 bg-red-500/10"
                      }`}>
                        {sig.strength} strength
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{sig.description}</p>
                    <EvidenceBadge platforms={sig.platforms} supportingDiscussionsCount={sig.supportingDiscussionsCount} confidenceScore={sig.confidenceScore} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-none border-border shadow-none bg-card/30 flex flex-col justify-between">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
                <Target className="h-4 w-4" />
                MARKET OPPORTUNITY
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-8 flex-1 flex flex-col items-center justify-center text-center space-y-4">
              <div className="h-32 w-32 rounded-full border-4 border-primary/30 flex flex-col items-center justify-center relative bg-[#0a0a0c] shadow-[0_0_20px_rgba(0,180,255,0.05)]">
                <span className="text-4xl font-bold font-mono text-primary">{res.opportunityScore?.score}</span>
                <span className="text-[10px] text-muted-foreground font-mono">OPPORTUNITY</span>
              </div>
              <p className="text-xs text-muted-foreground max-w-sm mt-4">{res.opportunityScore?.rationale}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="rounded-none border-border shadow-none bg-card/30">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                USER PAIN POINTS & FRICTIONS
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {res.painPoints?.map((pp: any, i: number) => (
                  <div key={i} className="border-l-2 border-destructive pl-4 py-1">
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <h4 className="font-bold text-sm text-foreground">{pp.painPoint}</h4>
                      <Badge variant="outline" className={`rounded-none font-mono text-[9px] uppercase ${
                        pp.severity === "high" ? "border-red-500/50 text-red-500 bg-red-500/10" :
                        pp.severity === "medium" ? "border-yellow-500/50 text-yellow-500 bg-yellow-500/10" :
                        "border-muted-foreground/50 text-muted-foreground bg-muted/10"
                      }`}>
                        {pp.severity} severity
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-2">{pp.description}</p>
                    <EvidenceBadge platforms={pp.platforms} supportingDiscussionsCount={pp.supportingDiscussionsCount} confidenceScore={pp.confidenceScore} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-none border-border shadow-none bg-card/30">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
                <Users className="h-4 w-4" />
                EXISTING COMPETITORS
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {res.existingCompetitors?.map((comp: any, i: number) => (
                  <div key={i} className="p-3 border border-border bg-background">
                    <h4 className="font-bold text-sm text-foreground mb-1">{comp.name}</h4>
                    <div className="text-xs font-mono text-muted-foreground mb-2">Positioning: {comp.positioning}</div>
                    <div className="text-xs text-destructive border-l border-destructive/30 pl-2 leading-relaxed mb-2">
                      <span className="font-mono font-bold text-[10px] block text-foreground uppercase">Gap to exploit:</span>
                      {comp.weaknessesToExploit}
                    </div>
                    {comp.platforms && comp.platforms.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {comp.platforms.map((p: string) => (
                          <span key={p} className="text-[9px] font-mono uppercase border border-border px-1.5 py-0.5">{p}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="rounded-none border-border shadow-none bg-card/30">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
                <Target className="h-4 w-4" />
                IDENTIFIED MARKET GAPS
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {res.marketGaps?.map((gap: any, i: number) => (
                  <div key={i} className="p-3 border border-border bg-background">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-bold text-sm text-foreground">{gap.gap}</h4>
                      <Badge variant="outline" className={`rounded-none font-mono text-[9px] uppercase ${
                        gap.sizeEstimate === "large" ? "border-green-500/50 text-green-500 bg-green-500/10" :
                        gap.sizeEstimate === "medium" ? "border-yellow-500/50 text-yellow-500 bg-yellow-500/10" :
                        "border-muted-foreground/50 text-muted-foreground bg-muted/10"
                      }`}>
                        {gap.sizeEstimate} GAP SIZE
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{gap.description}</p>
                    <EvidenceBadge platforms={gap.platforms} supportingDiscussionsCount={gap.supportingDiscussionsCount} confidenceScore={gap.confidenceScore} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-none border-border shadow-none bg-card/30">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-mono text-base flex items-center gap-2 text-primary">
                <Users className="h-4 w-4" />
                TARGET PERSONAS
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {res.customerPersonas?.map((pers: any, i: number) => (
                  <div key={i} className="p-4 border border-border bg-background">
                    <h4 className="font-bold font-mono text-sm text-primary mb-2 uppercase">{pers.persona}</h4>
                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="font-mono text-[10px] text-muted-foreground uppercase block mb-1">CHARACTERISTICS</span>
                        <div className="flex flex-wrap gap-1.5">
                          {pers.characteristics?.map((char: string, j: number) => (
                            <span key={j} className="border px-1.5 py-0.5 text-muted-foreground font-mono text-[10px] bg-secondary/20">{char}</span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="font-mono text-[10px] text-muted-foreground uppercase block mb-1">NEEDS / JOBS TO BE DONE</span>
                        <ul className="list-disc pl-4 space-y-1 text-muted-foreground leading-relaxed">
                          {pers.needs?.map((need: string, j: number) => <li key={j}>{need}</li>)}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

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

      {/* Soft Preference Notice if applicable */}
      {result.searchQueries && (
        <Card className="rounded-none border-yellow-500/20 bg-yellow-500/5 shadow-none text-yellow-500">
          <CardContent className="py-3 px-4 font-mono text-xs flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span>Notice: Search results fetched using soft recency preference for "{result.searchQueries.join(", ")}". Data may include discussions from mixed periods.</span>
          </CardContent>
        </Card>
      )}

      {(() => {
        const reportType = result.reportType || "product_analysis";
        switch (reportType) {
          case "feature_research":
            return renderFeatureResearch(result);
          case "comparison":
            return renderComparison(result);
          case "recommendation":
            return renderRecommendation(result);
          case "problem_discovery":
            return renderProblemDiscovery(result);
          case "trend":
            return renderTrend(result);
          case "market_validation":
            return renderMarketValidation(result);
          default:
            return renderProductAnalysis(result);
        }
      })()}

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
