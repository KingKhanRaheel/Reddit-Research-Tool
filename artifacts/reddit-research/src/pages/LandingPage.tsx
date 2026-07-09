import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Radio, ArrowRight, Activity, Search, BrainCircuit, ShieldAlert, BarChart3, Zap, Youtube, Github, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden selection:bg-primary/30">
      {/* Grid background */}
      <div className="fixed inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:48px_48px] pointer-events-none" />
      
      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="h-6 w-6 text-primary" />
            <span className="font-bold text-lg tracking-tight font-mono">SIGNAL</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/sign-in" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Sign In
            </Link>
            <Link href="/sign-up">
              <Button className="rounded-none bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_rgba(0,180,255,0.4)]">
                Start Research
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="relative pt-32 pb-24 z-10">
        {/* Hero Section */}
        <section className="container mx-auto px-6 pt-16 md:pt-32 pb-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1 text-sm text-primary border border-primary/30 bg-primary/10 mb-8 rounded-none font-mono uppercase tracking-wider"
          >
            <Activity className="h-4 w-4" />
            <span>Multi-Source Customer Intelligence</span>
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-5xl md:text-7xl font-bold tracking-tighter mb-6 max-w-4xl mx-auto leading-tight"
          >
            Stop reading hundreds of <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-cyan-300">scattered conversations</span>.
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10"
          >
            Signal analyzes real customer conversations across Reddit, YouTube, GitHub, and Hacker News — surfacing pain points, feature requests, and competitor sentiment in minutes, using your own AI key.
          </motion.p>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link href="/sign-up">
              <Button size="lg" className="rounded-none h-14 px-8 text-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_rgba(0,180,255,0.5)] group">
                Start Researching
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <span className="text-sm text-muted-foreground font-mono">Bring Your Own Key (BYOK)</span>
          </motion.div>

          {/* Source strip */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex items-center justify-center gap-8 mt-16 text-muted-foreground"
          >
            <div className="flex items-center gap-2 text-sm font-mono"><MessageSquare className="h-4 w-4" /> Reddit</div>
            <div className="flex items-center gap-2 text-sm font-mono"><Youtube className="h-4 w-4" /> YouTube</div>
            <div className="flex items-center gap-2 text-sm font-mono"><Github className="h-4 w-4" /> GitHub</div>
            <div className="flex items-center gap-2 text-sm font-mono"><Activity className="h-4 w-4" /> Hacker News</div>
            <div className="text-xs font-mono text-primary/70">+ more coming</div>
          </motion.div>
        </section>

        {/* Feature Grid */}
        <section className="container mx-auto px-6 py-24 border-t border-border/50">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold font-mono uppercase tracking-tight mb-4">Tactical Advantages</h2>
            <p className="text-muted-foreground">Every feature built for speed and signal-to-noise ratio.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Search,
                title: "Multi-Source Research",
                description: "Pull real discussions from Reddit, YouTube comments, GitHub issues, and Hacker News in a single run — with more sources added over time."
              },
              {
                icon: BrainCircuit,
                title: "Multi-Model Inference",
                description: "Connect OpenAI, Anthropic, Gemini, DeepSeek or Groq. You control the intelligence engine and the cost."
              },
              {
                icon: ShieldAlert,
                title: "Pain Point Extraction",
                description: "Automatically identify what users hate about existing solutions so you can build what they actually want."
              },
              {
                icon: BarChart3,
                title: "Cross-Platform Sentiment",
                description: "See how the community feels about specific competitors or topics, merged across every source that mentions them."
              },
              {
                icon: Zap,
                title: "Actionable Recommendations",
                description: "Get prioritized, tactical next steps based purely on the aggregated data, not AI hallucinations."
              },
              {
                icon: Activity,
                title: "Competitor Analysis",
                description: "Track competitor mentions and sentiment wherever your audience talks about them — not just on one platform."
              }
            ].map((feature, i) => (
              <div key={i} className="p-6 border border-border bg-card/50 hover:bg-card hover:border-primary/50 transition-colors group">
                <feature.icon className="h-8 w-8 text-primary mb-4 group-hover:scale-110 transition-transform" />
                <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Mock Report Preview */}
        <section className="container mx-auto px-6 py-24 border-t border-border/50">
          <div className="max-w-5xl mx-auto border border-border bg-[#0a0a0c] shadow-2xl relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent" />
            <div className="p-4 border-b border-border flex items-center justify-between bg-card/80">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-destructive/80" />
                  <div className="w-3 h-3 rounded-full bg-orange-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <div className="text-xs font-mono text-muted-foreground ml-4">REPORT_VIEWER // ID: 8942 // KEYWORD: Notion Alternative</div>
              </div>
            </div>
            <div className="p-8 md:p-12 font-mono">
              <h3 className="text-2xl font-bold mb-6 text-foreground">Executive Summary</h3>
              <p className="text-muted-foreground mb-8 text-sm leading-relaxed">
                Analysis of 85 discussions and 412 comments across Reddit, YouTube, and GitHub reveals a growing frustration with performance degradation and feature bloat. Users are actively seeking alternatives that prioritize speed, offline support, and native feeling apps over all-in-one workspace complexity.
              </p>
              
              <h3 className="text-xl font-bold mb-4 text-foreground mt-8 border-b border-border/50 pb-2">Top Pain Points</h3>
              <div className="space-y-4 text-sm">
                <div className="flex justify-between border border-border/50 p-3 bg-white/5">
                  <span className="font-semibold">1. Unbearable load times on mobile</span>
                  <span className="text-primary">Reddit, YouTube · 42%</span>
                </div>
                <div className="flex justify-between border border-border/50 p-3 bg-white/5">
                  <span className="font-semibold">2. Lack of true offline mode</span>
                  <span className="text-primary">Reddit, GitHub · 38%</span>
                </div>
                <div className="flex justify-between border border-border/50 p-3 bg-white/5">
                  <span className="font-semibold">3. Cluttered UI for simple notes</span>
                  <span className="text-primary">YouTube, HN · 24%</span>
                </div>
              </div>
              
              <div className="mt-12 text-center">
                <Link href="/sign-up">
                  <Button className="rounded-none bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border">
                    View Full 11-Section Report
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/50 bg-card py-12 relative z-10">
        <div className="container mx-auto px-6 text-center text-muted-foreground text-sm font-mono">
          <p>© {new Date().getFullYear()} Signal. Not affiliated with Reddit, YouTube, GitHub, or Hacker News.</p>
          <div className="mt-4 flex justify-center gap-4">
            <a href="#" className="hover:text-primary transition-colors">Terms</a>
            <a href="#" className="hover:text-primary transition-colors">Privacy</a>
            <a href="#" className="hover:text-primary transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
