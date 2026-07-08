import { useState } from "react";
import { useLocation } from "wouter";
import { 
  useListReports, 
  useDeleteReport,
  getListReportsQueryKey
} from "@workspace/api-client-react";
import { getGetDashboardQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, MoreVertical, Eye, Trash2, RefreshCw, FileText, CheckCircle2, XCircle, Clock } from "lucide-react";
import { format } from "date-fns";

export default function Reports() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: reports, isLoading } = useListReports();
  const deleteReport = useDeleteReport();

  const [searchQuery, setSearchQuery] = useState("");
  const [reportToDelete, setReportToDelete] = useState<number | null>(null);

  const filteredReports = reports?.filter(report => 
    report.keyword.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (report.subreddit && report.subreddit.toLowerCase().includes(searchQuery.toLowerCase()))
  ) || [];

  const handleDelete = () => {
    if (!reportToDelete) return;

    deleteReport.mutate({ id: reportToDelete }, {
      onSuccess: () => {
        toast({ title: "Report deleted successfully" });
        queryClient.invalidateQueries({ queryKey: getListReportsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        setReportToDelete(null);
      },
      onError: (err) => {
        toast({ title: "Failed to delete", description: (err as any)?.error || "Unknown error", variant: "destructive" });
        setReportToDelete(null);
      }
    });
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case "completed": 
        return <Badge variant="outline" className="rounded-none border-green-500/50 text-green-500 bg-green-500/10 gap-1"><CheckCircle2 className="w-3 h-3"/> Completed</Badge>;
      case "running": 
        return <Badge variant="outline" className="rounded-none border-primary/50 text-primary bg-primary/10 gap-1"><Loader2 className="w-3 h-3 animate-spin"/> Running</Badge>;
      case "pending": 
        return <Badge variant="outline" className="rounded-none border-muted-foreground/50 text-muted-foreground bg-muted-foreground/10 gap-1"><Clock className="w-3 h-3"/> Pending</Badge>;
      case "failed": 
        return <Badge variant="outline" className="rounded-none border-destructive/50 text-destructive bg-destructive/10 gap-1"><XCircle className="w-3 h-3"/> Failed</Badge>;
      default: 
        return <Badge variant="outline" className="rounded-none">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tight flex items-center gap-2">
            <FileText className="h-7 w-7 text-primary" />
            REPORTS
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage and view your generated research reports.</p>
        </div>
        
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search keyword or subreddit..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 rounded-none bg-card/50"
          />
        </div>
      </div>

      <Card className="rounded-none border-border bg-card/30 shadow-none">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="w-[300px] font-mono text-xs">KEYWORD</TableHead>
                <TableHead className="font-mono text-xs">SUBREDDIT</TableHead>
                <TableHead className="font-mono text-xs">STATUS</TableHead>
                <TableHead className="font-mono text-xs">DATA POINTS</TableHead>
                <TableHead className="font-mono text-xs">DATE</TableHead>
                <TableHead className="text-right font-mono text-xs w-[80px]">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filteredReports.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground font-mono">
                    No reports found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredReports.map((report) => (
                  <TableRow key={report.id} className="border-border hover:bg-muted/20 group cursor-pointer" onClick={() => setLocation(`/reports/${report.id}`)}>
                    <TableCell className="font-medium">
                      {report.keyword}
                    </TableCell>
                    <TableCell>
                      {report.subreddit ? (
                        <span className="text-primary/80 font-mono text-xs bg-primary/5 px-2 py-1 border border-primary/20">r/{report.subreddit}</span>
                      ) : (
                        <span className="text-muted-foreground text-xs italic">All Reddit</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(report.status)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm font-mono">
                      {report.postsAnalyzed !== null ? (
                        <span>{report.postsAnalyzed}P / {report.commentsAnalyzed}C</span>
                      ) : (
                        <span>-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm font-mono">
                      {format(new Date(report.createdAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0 rounded-none opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="sr-only">Open menu</span>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-none border-border bg-card">
                          <DropdownMenuItem onClick={() => setLocation(`/reports/${report.id}`)} className="rounded-none cursor-pointer">
                            <Eye className="mr-2 h-4 w-4" />
                            View Full Report
                          </DropdownMenuItem>
                          {report.status === "failed" && (
                            <DropdownMenuItem className="rounded-none cursor-pointer">
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Retry (Soon)
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator className="bg-border" />
                          <DropdownMenuItem 
                            onClick={() => setReportToDelete(report.id)} 
                            className="rounded-none cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={reportToDelete !== null} onOpenChange={(open) => !open && setReportToDelete(null)}>
        <AlertDialogContent className="rounded-none border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono">DELETE_REPORT?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the report and all generated insights.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              className="rounded-none bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteReport.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
