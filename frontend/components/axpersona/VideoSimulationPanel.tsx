'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  Loader2,
  Play,
  Shield,
  DollarSign,
  Eye,
  EyeOff,
  AlertTriangle,
  TrendingUp,
  Activity,
  Video,
  Signpost,
  Users,
  Luggage,
  Navigation,
  UserCircle2,
  ChevronDown,
} from 'lucide-react';
import type {
  VideoAnnotation,
  TechnicalAnnotation,
  DepartmentView,
  VideoAnalysisResponse,
  SecurityStatus,
  MarketingSentiment,
  OperationsFlowRate,
  VideoAnalysisRequest,
} from '@/lib/axpersona/videoAnalysisTypes';
import {
  parseTimestamp,
  getActiveAnnotations,
  getActiveTechnicalAnnotations,
  DEPARTMENT_STYLES,
} from '@/lib/axpersona/videoAnalysisTypes';

// Type for annotations feed tab
type AnnotationsFeedTab = 'findings' | 'technical';

interface VideoSimulationPanelProps {
  className?: string;
  availablePersonas?: Array<{
    name: string;
    role: string;
    description: string;
    age?: number;
  }>;
}

export function VideoSimulationPanel({ className, availablePersonas = [] }: VideoSimulationPanelProps) {
  // State
  const [videoUrl, setVideoUrl] = useState('');
  const [videoDurationInput, setVideoDurationInput] = useState(''); // MM:SS or HH:MM:SS format
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<VideoAnalysisResponse | null>(null);
  const [activeDepartment, setActiveDepartment] = useState<DepartmentView>('none');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AnnotationsFeedTab>('findings');
  const [activeAnnotations, setActiveAnnotations] = useState<VideoAnnotation[]>([]);
  const [activeTechnicalAnnotations, setActiveTechnicalAnnotations] = useState<TechnicalAnnotation[]>([]);

  // Persona Selection State
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>([]);
  const [isPersonaSelectorOpen, setIsPersonaSelectorOpen] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  // Derived state for annotations
  const annotations = useMemo(() => analysisResult?.annotations || [], [analysisResult]);
  const technicalAnnotations = useMemo(() => analysisResult?.technical_annotations || [], [analysisResult]);

  // Handle Persona Selection
  const handlePersonaToggle = (personaName: string) => {
    setSelectedPersonas(prev => {
      if (prev.includes(personaName)) {
        return prev.filter(p => p !== personaName);
      }
      if (prev.length >= 3) {
        // limit to 3
        return prev;
      }
      return [...prev, personaName];
    });
  };

  const getActivePersonaObjects = useCallback(() => {
    if (!availablePersonas) return [];
    return availablePersonas.filter(p => selectedPersonas.includes(p.name));
  }, [availablePersonas, selectedPersonas]);

  // Helper to extract YouTube ID
  const getYouTubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const isYouTubeUrl = (url: string) => !!getYouTubeId(url);

  // Fetch video metadata when URL changes
  useEffect(() => {
    const fetchVideoMetadata = async (url: string) => {
      try {
        const response = await fetch('/api/axpersona/video-metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ video_url: url }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.duration_formatted) {
            setVideoDurationInput(data.duration_formatted);
          }
        }
      } catch (err) {
        console.error('Failed to fetch video metadata', err);
      }
    };

    const timeoutId = setTimeout(() => {
      if (videoUrl.trim() && isYouTubeUrl(videoUrl)) {
        fetchVideoMetadata(videoUrl);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl]); // Only trigger on URL change, not on duration change

  // Update active annotations based on current time
  useEffect(() => {
    if (annotations.length > 0) {
      const active = getActiveAnnotations(annotations, currentTime);
      setActiveAnnotations(active);
    }
    if (technicalAnnotations.length > 0) {
      const activeTech = getActiveTechnicalAnnotations(technicalAnnotations, currentTime);
      setActiveTechnicalAnnotations(activeTech);
    }
  }, [currentTime, annotations, technicalAnnotations]);

  // Handle video time update
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  // Handle video loaded metadata
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  }, []);

  // Toggle play/pause
  const togglePlayPause = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  // Helper to convert MM:SS to seconds
  const parseDurationToSeconds = (durationStr: string): number | undefined => {
    if (!durationStr) return undefined;
    const parts = durationStr.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return undefined;
  };

  // Analyze video with LLM - calls backend API
  const handleAnalyzeVideo = useCallback(async () => {
    if (!videoUrl.trim()) {
      setError('Please enter a video URL');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      // Parse video duration if provided
      const durationSeconds = parseDurationToSeconds(videoDurationInput);

      // Build request body
      const requestBody: VideoAnalysisRequest = { video_url: videoUrl };
      if (durationSeconds && durationSeconds > 0) {
        requestBody.video_duration_seconds = durationSeconds;
      }

      // Add personas if selected
      const activePersonas = getActivePersonaObjects();
      if (activePersonas.length > 0) {
        requestBody.personas = activePersonas;
      }

      // Try to call the backend API
      const response = await fetch('/api/axpersona/video-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const result = await response.json();
        setAnalysisResult(result);

        // If we have simulated personas, default to showing "all" so we see the avatars
        if (result.analysis_metadata?.simulated_personas) {
          setActiveDepartment('all');
        } else {
          // Default to showing all departments
          setActiveDepartment('all');
        }

      } else {
        throw new Error('Analysis failed');
      }
    } catch (err) {
      console.error('Video analysis error:', err);
      setError('Analysis failed. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  }, [videoUrl, videoDurationInput, getActivePersonaObjects]);

  // Get status color for security
  const getSecurityColor = (status: SecurityStatus) => {
    switch (status) {
      case 'Red': return 'bg-red-500 text-white';
      case 'Yellow': return 'bg-yellow-500 text-black';
      case 'Green': return 'bg-green-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  // Get sentiment emoji for marketing
  const getSentimentEmoji = (sentiment: MarketingSentiment) => {
    switch (sentiment) {
      case 'Positive': return '😊';
      case 'Negative': return '😟';
      case 'Neutral': return '😐';
      default: return '❓';
    }
  };

  // Get flow icon for operations
  const getFlowIcon = (flowRate: OperationsFlowRate) => {
    switch (flowRate) {
      case 'Fast': return <TrendingUp className="h-3 w-3" />;
      case 'Slow': return <Activity className="h-3 w-3" />;
      case 'Stagnant': return <AlertTriangle className="h-3 w-3" />;
      default: return null;
    }
  };

  // Helper to get display name
  const getPersonaDisplayName = (fullName: string) => {
    // Split by comma to handle "Name, the Role" format
    return fullName.split(',')[0].trim();
  };

  // Render overlay annotation
  const renderAnnotation = (annotation: VideoAnnotation, index: number) => {
    const [x, y, width, height] = annotation.coordinates;
    const style = DEPARTMENT_STYLES[activeDepartment];

    // Check if we are in dynamic persona mode
    const isDynamicMode = selectedPersonas.length > 0;
    const activePersonas = getActivePersonaObjects();

    if (activeDepartment === 'none') return null;

    const dept = annotation.departments;
    let content: React.ReactNode = null;
    let statusBadge: React.ReactNode = null;

    if (activeDepartment === 'security') {
      // In dynamic mode, 'security' maps to Persona 1
      if (isDynamicMode && activePersonas[0]) {
        content = dept.security.detail;
        statusBadge = (
          <Badge className="text-[10px] bg-indigo-500 hover:bg-indigo-600 text-white flex items-center gap-1.5 px-2 py-0.5 shadow-sm border border-indigo-400/50">
            <UserCircle2 className="h-3 w-3" />
            <span className="font-semibold">{getPersonaDisplayName(activePersonas[0].name)}</span>
          </Badge>
        );
      } else {
        statusBadge = (
          <Badge className={`text-[9px] ${getSecurityColor(dept.security.status)}`}>
            <Shield className="h-2.5 w-2.5 mr-0.5" />
            {dept.security.label}
          </Badge>
        );
        content = dept.security.detail;
      }
    } else if (activeDepartment === 'marketing') {
      // In dynamic mode, 'marketing' maps to Persona 2
      if (isDynamicMode && activePersonas[1]) {
        content = dept.marketing.detail;
        statusBadge = (
          <Badge className="text-[10px] bg-pink-500 hover:bg-pink-600 text-white flex items-center gap-1.5 px-2 py-0.5 shadow-sm border border-pink-400/50">
            <UserCircle2 className="h-3 w-3" />
            <span className="font-semibold">{getPersonaDisplayName(activePersonas[1].name)}</span>
          </Badge>
        );
      } else {
        statusBadge = (
          <Badge className="text-[9px] bg-purple-500 text-white">
            <DollarSign className="h-2.5 w-2.5 mr-0.5" />
            {getSentimentEmoji(dept.marketing.sentiment)} {dept.marketing.label}
          </Badge>
        );
        content = dept.marketing.detail;
      }
    } else if (activeDepartment === 'operations') {
      // In dynamic mode, 'operations' maps to Persona 3
      if (isDynamicMode && activePersonas[2]) {
        content = dept.operations.detail;
        statusBadge = (
          <Badge className="text-[10px] bg-teal-500 hover:bg-teal-600 text-white flex items-center gap-1.5 px-2 py-0.5 shadow-sm border border-teal-400/50">
            <UserCircle2 className="h-3 w-3" />
            <span className="font-semibold">{getPersonaDisplayName(activePersonas[2].name)}</span>
          </Badge>
        );
      } else {
        statusBadge = (
          <Badge className="text-[9px] bg-blue-500 text-white">
            {getFlowIcon(dept.operations.flow_rate)}
            <span className="ml-0.5">{dept.operations.label}</span>
          </Badge>
        );
        content = dept.operations.detail;
      }
    } else if (activeDepartment === 'all') {
      // Show all departments
      return (
        <div
          key={annotation.id}
          className="absolute pointer-events-none"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: `${width}%`,
            height: `${height}%`,
          }}
        >
          <div className="absolute -top-8 left-0 flex gap-1 flex-wrap">
            {isDynamicMode ? (
              <>
                {activePersonas[0] && (
                  <Badge className="text-[9px] bg-indigo-500/90 text-white flex items-center gap-1 backdrop-blur-sm border border-indigo-400/30">
                    <span className="font-medium">{getPersonaDisplayName(activePersonas[0].name)}</span>
                  </Badge>
                )}
                {activePersonas[1] && (
                  <Badge className="text-[9px] bg-pink-500/90 text-white flex items-center gap-1 backdrop-blur-sm border border-pink-400/30">
                    <span className="font-medium">{getPersonaDisplayName(activePersonas[1].name)}</span>
                  </Badge>
                )}
                {activePersonas[2] && (
                  <Badge className="text-[9px] bg-teal-500/90 text-white flex items-center gap-1 backdrop-blur-sm border border-teal-400/30">
                    <span className="font-medium">{getPersonaDisplayName(activePersonas[2].name)}</span>
                  </Badge>
                )}
              </>
            ) : (
              <>
                <Badge className={`text-[8px] ${getSecurityColor(dept.security.status)}`}>
                  <Shield className="h-2 w-2 mr-0.5" />
                  {dept.security.status}
                </Badge>
                <Badge className="text-[8px] bg-purple-500 text-white">
                  {getSentimentEmoji(dept.marketing.sentiment)}
                </Badge>
                <Badge className="text-[8px] bg-blue-500 text-white">
                  {getFlowIcon(dept.operations.flow_rate)}
                </Badge>
              </>
            )}
          </div>
          <div
            className={`w-full h-full border-2 rounded ${isPlaying ? 'opacity-30' : 'opacity-80'
              }`}
            style={{
              borderColor: style.borderColor,
              backgroundColor: style.backgroundColor,
            }}
          />
        </div>
      );
    }

    return (
      <div
        key={annotation.id}
        className="absolute transition-all duration-300 pointer-events-none"
        style={{
          left: `${x}%`,
          top: `${y}%`,
          width: `${width}%`,
          height: `${height}%`,
        }}
      >
        <div
          className={`w-full h-full border-2 rounded relative ${style.animation === 'pulse' ? 'animate-pulse' : ''
            }`}
          style={{
            borderColor: style.borderColor,
            backgroundColor: style.backgroundColor,
          }}
        >
          <div className="absolute -top-8 left-0 min-w-[200px]">
            {statusBadge}
            {!isPlaying && (
              <div className="bg-black/80 text-white text-[10px] p-2 rounded mt-1 shadow-lg backdrop-blur-sm border border-white/10">
                {content}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderVideoPlayer = () => {
    // If it's a YouTube URL, we need to embed it via iframe or use a specialized player
    // For simplicity in this demo, we'll assume standard video formats or YouTube embed logic
    const ytId = getYouTubeId(videoUrl);

    if (ytId) {
      return (
        <div className="relative w-full h-full bg-black flex items-center justify-center">
          {/* 
               In a real app, use 'react-youtube' or similar to get currentTime access.
               Since generic iframes don't expose currentTime easily without postMessage API,
               we will simulate the playback for this UI demo if needed, 
               or just show a placeholder that we can't sync overlays perfectly with standard iframe.
               
               However, to make the 'Simulation' feel real, we'll overlay a transparent div 
               to capture interactions if needed.
            */}
          <iframe
            className="w-full h-full"
            src={`https://www.youtube.com/embed/${ytId}?enablejsapi=1&autoplay=${isPlaying ? 1 : 0}`}
            title="YouTube video player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />

          {/* Overlays Layer */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {annotations.map((ann, i) => renderAnnotation(ann, i))}
          </div>
        </div>
      );
    }

    // Default HTML5 Video
    return (
      <div className="relative w-full h-full bg-black flex items-center justify-center group" ref={playerContainerRef}>
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-full object-contain"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setIsPlaying(false)}
        />

        {/* Play/Pause Overlay */}
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          onClick={togglePlayPause}
        >
          {!isPlaying && <Play className="h-12 w-12 text-white opacity-80" fill="currentColor" />}
        </div>

        {/* Annotations Layer */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {activeAnnotations.map((ann, i) => renderAnnotation(ann, i))}
        </div>
      </div>
    );
  };

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 h-auto min-h-[600px] items-start ${className}`}>
      {/* Main Video Area */}
      <div className="lg:col-span-2 flex flex-col gap-4">
        <Card className="flex-1 flex flex-col min-h-0 bg-slate-950 border-slate-800 text-slate-200 overflow-hidden">
          <CardContent className="p-0 relative bg-black aspect-video flex items-center justify-center">
            {videoUrl ? (
              renderVideoPlayer()
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 p-12 text-center bg-slate-900/50">
                <Video className="h-12 w-12 mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">Ready to Analyze</h3>
                <p className="text-sm max-w-md">
                  Enter a YouTube URL above to start the multimodal analysis.
                  Gemini 3 will simulate viewer reactions and identify facility metrics.
                </p>
              </div>
            )}

            {/* HUD Controls */}
            <div className="absolute top-4 right-4 flex flex-col gap-2">
              <div className="bg-black/60 backdrop-blur-md p-1 rounded-lg border border-white/10 flex flex-col gap-1">
                <Button
                  variant={activeDepartment === 'all' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setActiveDepartment('all')}
                  title="Show All"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant={activeDepartment === 'security' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-950/50"
                  onClick={() => setActiveDepartment('security')}
                  title="Security View"
                >
                  <Shield className="h-4 w-4" />
                </Button>
                <Button
                  variant={activeDepartment === 'marketing' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-8 w-8 text-purple-400 hover:text-purple-300 hover:bg-purple-950/50"
                  onClick={() => setActiveDepartment('marketing')}
                  title="Marketing View"
                >
                  <DollarSign className="h-4 w-4" />
                </Button>
                <Button
                  variant={activeDepartment === 'operations' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-8 w-8 text-blue-400 hover:text-blue-300 hover:bg-blue-950/50"
                  onClick={() => setActiveDepartment('operations')}
                  title="Operations View"
                >
                  <Activity className="h-4 w-4" />
                </Button>
                <Button
                  variant={activeDepartment === 'none' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setActiveDepartment('none')}
                  title="Hide Overlays"
                >
                  <EyeOff className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Input Controls */}
        <Card>
          <CardContent className="p-4 flex gap-3 items-center">
            <Input
              placeholder="Paste YouTube URL here..."
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder="Length (10:00)"
              value={videoDurationInput}
              onChange={(e) => setVideoDurationInput(e.target.value)}
              className="w-24 text-center font-mono"
              title="Video Duration (MM:SS)"
            />

            {/* Persona Selector */}
            {availablePersonas.length > 0 && (
              <Popover open={isPersonaSelectorOpen} onOpenChange={setIsPersonaSelectorOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="gap-2 relative">
                    <Users className="h-4 w-4" />
                    {selectedPersonas.length > 0 ? (
                      <Badge variant="secondary" className="px-1 h-5 text-[10px] ml-1">
                        {selectedPersonas.length}
                      </Badge>
                    ) : (
                      <span>Simulate...</span>
                    )}
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end">
                  <div className="p-3 border-b bg-muted/50">
                    <h4 className="font-medium text-sm">Simulate Client Perspectives</h4>
                    <p className="text-xs text-muted-foreground">Select up to 3 personas to react to this video.</p>
                  </div>
                  <ScrollArea className="h-[200px] p-2">
                    <div className="space-y-1">
                      {availablePersonas.map(persona => (
                        <div
                          key={persona.name}
                          className="flex items-start gap-2 p-2 hover:bg-muted rounded-md cursor-pointer"
                          onClick={() => handlePersonaToggle(persona.name)}
                        >
                          <Checkbox
                            id={`p-${persona.name}`}
                            checked={selectedPersonas.includes(persona.name)}
                            disabled={!selectedPersonas.includes(persona.name) && selectedPersonas.length >= 3}
                            onCheckedChange={() => handlePersonaToggle(persona.name)}
                          />
                          <div className="flex-1">
                            <div className="text-sm font-medium leading-none mb-1 flex items-center justify-between">
                              {persona.name}
                              {persona.age && <span className="text-xs text-muted-foreground">{persona.age}y</span>}
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">{persona.role}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            )}

            <Button
              onClick={handleAnalyzeVideo}
              disabled={isAnalyzing || !videoUrl}
              className="w-32"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Run Sim
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Analysis Output Panel */}
      <div className="flex flex-col gap-4 h-full">
        <Tabs defaultValue="findings" className="flex-1 flex flex-col h-full bg-background rounded-lg border">
          <div className="p-4 border-b">
            <h3 className="font-semibold mb-1">Analysis Results</h3>
            <p className="text-xs text-muted-foreground">
              {analysisResult
                ? `Found ${analysisResult.analysis_metadata.total_annotations} events in ${analysisResult.analysis_metadata.duration_analyzed || 'video'}`
                : 'Wating for analysis...'}
            </p>
          </div>

          <TabsList className="w-full justify-start rounded-none border-b px-4 h-11 bg-transparent">
            <TabsTrigger
              value="findings"
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
              onClick={() => setActiveTab('findings')}
            >
              Simulation
            </TabsTrigger>
            <TabsTrigger
              value="technical"
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
              onClick={() => setActiveTab('technical')}
            >
              Technical Data
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4 max-h-[600px]">
              {activeTab === 'findings' ? (
                // Findings Feed
                <>
                  {annotations.length === 0 && (
                    <div className="text-center text-muted-foreground py-10 text-sm">
                      No events detected yet.
                    </div>
                  )}
                  {annotations.map((ann, i) => (
                    <div key={ann.id} className="border rounded-lg p-3 text-sm hover:border-primary/50 transition-colors bg-card/50">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className="font-mono text-xs text-muted-foreground">
                          {ann.timestamp_start} - {ann.timestamp_end}
                        </Badge>
                      </div>
                      <p className="mb-3 text-sm font-medium leading-relaxed">{ann.description}</p>

                      <div className="space-y-2">
                        {/* Security / Persona 1 */}
                        <div className="flex items-start gap-3 bg-red-50/50 dark:bg-red-950/20 p-2.5 rounded-md text-xs border border-red-100 dark:border-red-900/50">
                          {selectedPersonas.length > 0 && availablePersonas.find(p => p.name === selectedPersonas[0]) ? (
                            <Badge className="bg-indigo-500 hover:bg-indigo-600 text-white shrink-0 w-20 justify-center h-5">
                              {getPersonaDisplayName(selectedPersonas[0])}
                            </Badge>
                          ) : (
                            <Badge className={`${getSecurityColor(ann.departments.security.status)} shrink-0 w-16 justify-center h-5`}>
                              Security
                            </Badge>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold mb-0.5 text-foreground/90">{ann.departments.security.label}</div>
                            <div className="text-muted-foreground leading-snug">{ann.departments.security.detail}</div>
                          </div>
                        </div>

                        {/* Marketing / Persona 2 */}
                        {(selectedPersonas.length === 0 || selectedPersonas.length >= 2) && (
                          <div className="flex items-start gap-3 bg-purple-50/50 dark:bg-purple-950/20 p-2.5 rounded-md text-xs border border-purple-100 dark:border-purple-900/50">
                            {selectedPersonas.length >= 2 && availablePersonas.find(p => p.name === selectedPersonas[1]) ? (
                              <Badge className="bg-pink-500 hover:bg-pink-600 text-white shrink-0 w-20 justify-center h-5">
                                {getPersonaDisplayName(selectedPersonas[1])}
                              </Badge>
                            ) : (
                              <Badge className="bg-purple-500 text-white shrink-0 w-16 justify-center h-5">
                                Marketing
                              </Badge>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold mb-0.5 text-foreground/90">{ann.departments.marketing.label}</div>
                              <div className="text-muted-foreground leading-snug">{ann.departments.marketing.detail}</div>
                            </div>
                          </div>
                        )}

                        {/* Operations / Persona 3 */}
                        {(selectedPersonas.length === 0 || selectedPersonas.length >= 3) && (
                          <div className="flex items-start gap-3 bg-blue-50/50 dark:bg-blue-950/20 p-2.5 rounded-md text-xs border border-blue-100 dark:border-blue-900/50">
                            {selectedPersonas.length >= 3 && availablePersonas.find(p => p.name === selectedPersonas[2]) ? (
                              <Badge className="bg-teal-500 hover:bg-teal-600 text-white shrink-0 w-20 justify-center h-5">
                                {getPersonaDisplayName(selectedPersonas[2])}
                              </Badge>
                            ) : (
                              <Badge className="bg-blue-500 text-white shrink-0 w-16 justify-center h-5">
                                Operations
                              </Badge>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold mb-0.5 text-foreground/90">{ann.departments.operations.label}</div>
                              <div className="text-muted-foreground leading-snug">{ann.departments.operations.detail}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                // Technical Feed
                <>
                  {technicalAnnotations.length === 0 && (
                    <div className="text-center text-muted-foreground py-10 text-sm">
                      No technical data available.
                    </div>
                  )}
                  {technicalAnnotations.map((tech, i) => (
                    <div key={tech.id} className="border rounded-lg p-3 text-sm space-y-3 bg-card/50">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="font-mono text-xs">
                          {tech.timestamp_start}
                        </Badge>
                        <div className="flex gap-2">
                          <Badge variant="outline" className="text-[10px] bg-background">
                            Stress: {tech.navigational_stress_score}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] bg-background">
                            Intent: {tech.purchase_intent_score}
                          </Badge>
                        </div>
                      </div>

                      {/* Summary */}
                      <p className="text-xs text-muted-foreground italic pl-2 border-l-2 border-primary/20">
                        {tech.summary}
                      </p>

                      {/* Signs */}
                      {tech.signs_detected && tech.signs_detected.length > 0 && (
                        <div className="bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-md border border-slate-100 dark:border-slate-800">
                          <div className="text-[10px] font-semibold uppercase text-slate-500 mb-2 flex items-center gap-1.5">
                            <Signpost className="h-3.5 w-3.5 text-primary/70" />
                            Signs & Wayfinding
                          </div>
                          <div className="space-y-1.5">
                            {tech.signs_detected.map((sign, idx) => (
                              <div key={idx} className="flex justify-between items-center text-xs bg-background p-1.5 rounded border border-border/50">
                                <span className="font-medium truncate max-w-[180px]">"{sign.sign_text}"</span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${sign.readability === 'clear' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                                  sign.readability === 'moderate' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                                    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                  }`}>
                                  {sign.readability}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Crowd Metrics */}
                      {tech.agent_behavior && (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-md border border-slate-100 dark:border-slate-800">
                            <div className="text-[10px] font-semibold uppercase text-slate-500 mb-2 flex items-center gap-1.5">
                              <Users className="h-3.5 w-3.5 text-blue-500/70" />
                              Crowd Flow
                            </div>
                            <div className="text-xs space-y-1">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Count</span>
                                <span className="font-mono">{tech.agent_behavior.agent_count}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Velocity</span>
                                <span className="font-mono">{tech.agent_behavior.avg_velocity}</span>
                              </div>
                            </div>
                          </div>

                          <div className="bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-md border border-slate-100 dark:border-slate-800">
                            <div className="text-[10px] font-semibold uppercase text-slate-500 mb-2 flex items-center gap-1.5">
                              <Luggage className="h-3.5 w-3.5 text-orange-500/70" />
                              Objects
                            </div>
                            <div className="text-xs space-y-1">
                              {tech.objects?.luggage_trolleys ? (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Trolleys</span>
                                  <span className="font-mono">{tech.objects.luggage_trolleys}</span>
                                </div>
                              ) : null}
                              {tech.objects?.smartphones_cameras ? (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Phones</span>
                                  <span className="font-mono">{tech.objects.smartphones_cameras}</span>
                                </div>
                              ) : null}
                              {(!tech.objects?.luggage_trolleys && !tech.objects?.smartphones_cameras) && (
                                <span className="text-muted-foreground italic text-[10px]">None detected</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          </ScrollArea>
        </Tabs>
      </div>

      {error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span className="block sm:inline">{error}</span>
        </div>
      )}
    </div>
  );
}
