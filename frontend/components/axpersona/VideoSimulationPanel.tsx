'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Loader2,
  Play,
  Shield,
  DollarSign,
  Settings,
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
} from 'lucide-react';
import type {
  VideoAnnotation,
  TechnicalAnnotation,
  DepartmentView,
  VideoAnalysisResponse,
  SecurityStatus,
  MarketingSentiment,
  OperationsFlowRate,
} from '@/lib/axpersona/videoAnalysisTypes';
import {
  parseTimestamp,
  getActiveAnnotations,
  getActiveTechnicalAnnotations,
  DEPARTMENT_STYLES,
} from '@/lib/axpersona/videoAnalysisTypes';

// Type for annotations feed tab
type AnnotationsFeedTab = 'findings' | 'technical';

// Demo annotations for testing without API
const DEMO_ANNOTATIONS: VideoAnnotation[] = [
  {
    id: 'ann-1',
    timestamp_start: '00:05',
    timestamp_end: '00:15',
    coordinates: [30, 40, 25, 35],
    description: 'Family with luggage trolley stops in narrow corridor.',
    departments: {
      security: { status: 'Yellow', label: 'Egress Obstruction', detail: 'Path reduced by 40%' },
      marketing: { sentiment: 'Negative', label: 'Engagement Failed', detail: 'Too stressed to browse' },
      operations: { flow_rate: 'Stagnant', label: 'Friction Point', detail: 'Velocity 0 m/s' },
    },
  },
  {
    id: 'ann-2',
    timestamp_start: '00:20',
    timestamp_end: '00:35',
    coordinates: [60, 30, 20, 25],
    description: 'Crowd forming near gate entrance.',
    departments: {
      security: { status: 'Red', label: 'Crowd Density Alert', detail: 'Exceeds threshold' },
      marketing: { sentiment: 'Positive', label: 'High Footfall Zone', detail: 'Potential ad placement' },
      operations: { flow_rate: 'Slow', label: 'Queue Forming', detail: 'Wait time increasing' },
    },
  },
  {
    id: 'ann-3',
    timestamp_start: '00:40',
    timestamp_end: '00:55',
    coordinates: [15, 60, 30, 20],
    description: 'Person stopping to check phone near retail area.',
    departments: {
      security: { status: 'Green', label: 'Normal Activity', detail: 'No concerns' },
      marketing: { sentiment: 'Positive', label: 'Browsing Behavior', detail: 'Dwell time opportunity' },
      operations: { flow_rate: 'Fast', label: 'Normal Flow', detail: 'Optimal throughput' },
    },
  },
];

interface VideoSimulationPanelProps {
  className?: string;
}

export function VideoSimulationPanel({ className }: VideoSimulationPanelProps) {
  // State
  const [videoUrl, setVideoUrl] = useState('');
  const [videoDurationInput, setVideoDurationInput] = useState(''); // MM:SS or HH:MM:SS format
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<VideoAnalysisResponse | null>(null);
  const [activeDepartment, setActiveDepartment] = useState<DepartmentView>('none');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeAnnotations, setActiveAnnotations] = useState<VideoAnnotation[]>([]);
  const [activeTechnicalAnnotations, setActiveTechnicalAnnotations] = useState<TechnicalAnnotation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [useDemoMode, setUseDemoMode] = useState(false);
  const [feedTab, setFeedTab] = useState<AnnotationsFeedTab>('findings');

  // Parse duration input (MM:SS or HH:MM:SS) to seconds
  const parseDurationToSeconds = (input: string): number | null => {
    if (!input.trim()) return null;
    const parts = input.trim().split(':').map(Number);
    if (parts.some(isNaN)) return null;
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return null;
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Extract YouTube video ID from URL
  const extractYouTubeVideoId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/v\/([^&\n?#]+)/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) return match[1];
    }
    return null;
  };

  // Check if URL is a YouTube video
  const isYouTubeUrl = (url: string): boolean => {
    return url.includes('youtube.com') || url.includes('youtu.be');
  };

  // Get the YouTube embed URL
  const getYouTubeEmbedUrl = (videoId: string): string => {
    return `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : ''}&rel=0`;
  };

  // Get annotations - either from API result or demo
  // Memoize to avoid creating new array references on every render
  const annotations = useMemo(() => {
    return useDemoMode ? DEMO_ANNOTATIONS : (analysisResult?.annotations || []);
  }, [useDemoMode, analysisResult?.annotations]);

  const technicalAnnotations = useMemo(() => {
    return analysisResult?.technical_annotations || [];
  }, [analysisResult?.technical_annotations]);

  // Get video ID for display
  const youtubeVideoId = analysisResult?.video_id || extractYouTubeVideoId(videoUrl);

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

  // Analyze video with LLM - calls backend API with demo fallback
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
      const requestBody: Record<string, unknown> = { video_url: videoUrl };
      if (durationSeconds && durationSeconds > 0) {
        requestBody.video_duration_seconds = durationSeconds;
      }

      // Try to call the backend API
      const response = await fetch('/api/axpersona/video-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const result = await response.json();
        setUseDemoMode(false);
        setAnalysisResult(result);
      } else {
        // Fallback to demo mode if API fails
        console.warn('Video analysis API failed, using demo mode');
        setUseDemoMode(true);
        setAnalysisResult({
          success: true,
          video_url: videoUrl,
          annotations: DEMO_ANNOTATIONS,
          analysis_metadata: {
            total_annotations: DEMO_ANNOTATIONS.length,
            duration_analyzed: '1:00',
            model_used: 'demo-mode (API unavailable)',
            processed_at: new Date().toISOString(),
          },
        });
      }
    } catch (err) {
      // Fallback to demo mode on error
      console.warn('Video analysis error, using demo mode:', err);
      setUseDemoMode(true);
      setAnalysisResult({
        success: true,
        video_url: videoUrl,
        annotations: DEMO_ANNOTATIONS,
        analysis_metadata: {
          total_annotations: DEMO_ANNOTATIONS.length,
          duration_analyzed: '1:00',
          model_used: 'demo-mode (offline)',
          processed_at: new Date().toISOString(),
        },
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, [videoUrl, videoDurationInput]);

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

  // Render overlay annotation
  const renderAnnotation = (annotation: VideoAnnotation, index: number) => {
    const [x, y, width, height] = annotation.coordinates;
    const style = DEPARTMENT_STYLES[activeDepartment];

    if (activeDepartment === 'none') return null;

    const dept = annotation.departments;
    let content: React.ReactNode = null;
    let statusBadge: React.ReactNode = null;

    if (activeDepartment === 'security') {
      statusBadge = (
        <Badge className={`text-[9px] ${getSecurityColor(dept.security.status)}`}>
          <Shield className="h-2.5 w-2.5 mr-0.5" />
          {dept.security.label}
        </Badge>
      );
      content = dept.security.detail;
    } else if (activeDepartment === 'marketing') {
      statusBadge = (
        <Badge className="text-[9px] bg-purple-500 text-white">
          <DollarSign className="h-2.5 w-2.5 mr-0.5" />
          {getSentimentEmoji(dept.marketing.sentiment)} {dept.marketing.label}
        </Badge>
      );
      content = dept.marketing.detail;
    } else if (activeDepartment === 'operations') {
      statusBadge = (
        <Badge className="text-[9px] bg-blue-500 text-white">
          {getFlowIcon(dept.operations.flow_rate)}
          <span className="ml-0.5">{dept.operations.label}</span>
        </Badge>
      );
      content = dept.operations.detail;
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
          </div>
          <div
            className="w-full h-full border-2 border-white/50 rounded"
            style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
          />
        </div>
      );
    }

    return (
      <div
        key={annotation.id}
        className={`absolute pointer-events-none transition-all duration-300 ${
          style.animation === 'pulse' ? 'animate-pulse' : ''
        }`}
        style={{
          left: `${x}%`,
          top: `${y}%`,
          width: `${width}%`,
          height: `${height}%`,
        }}
      >
        <div className="absolute -top-6 left-0">{statusBadge}</div>
        <div
          className="w-full h-full border-2 rounded"
          style={{
            borderColor: style.borderColor,
            backgroundColor: style.backgroundColor,
          }}
        />
        {content && (
          <div
            className="absolute -bottom-5 left-0 text-[9px] px-1 rounded"
            style={{
              color: style.textColor,
              backgroundColor: 'rgba(0,0,0,0.7)',
            }}
          >
            {content}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className={`flex flex-col h-full ${className || ''}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Video className="h-4 w-4" />
          Video Simulation Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4 min-h-0">
        {/* URL Input Section */}
        <div className="flex gap-2">
          <Input
            placeholder="Enter video URL (YouTube, MP4, etc.)"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            className="flex-1 text-xs h-8"
          />
          <Input
            placeholder="Duration (MM:SS)"
            value={videoDurationInput}
            onChange={(e) => setVideoDurationInput(e.target.value)}
            className="w-24 text-xs h-8"
            title="Video duration for long videos (>10min). E.g., 50:39 or 1:30:00"
          />
          <Button
            size="sm"
            onClick={handleAnalyzeVideo}
            disabled={isAnalyzing || !videoUrl.trim()}
            className="h-8"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Analyzing...
              </>
            ) : (
              'Analyze'
            )}
          </Button>
        </div>

        {error && (
          <div className="text-xs text-red-500 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {error}
          </div>
        )}

        {/* Department Toggle Controls */}
        {annotations.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">View:</span>
            <Tabs
              value={activeDepartment}
              onValueChange={(v) => setActiveDepartment(v as DepartmentView)}
            >
              <TabsList className="h-7">
                <TabsTrigger value="none" className="text-[10px] px-2 h-6">
                  <EyeOff className="h-3 w-3" />
                </TabsTrigger>
                <TabsTrigger value="security" className="text-[10px] px-2 h-6">
                  <Shield className="h-3 w-3 mr-1" />
                  Security
                </TabsTrigger>
                <TabsTrigger value="marketing" className="text-[10px] px-2 h-6">
                  <DollarSign className="h-3 w-3 mr-1" />
                  Marketing
                </TabsTrigger>
                <TabsTrigger value="operations" className="text-[10px] px-2 h-6">
                  <Settings className="h-3 w-3 mr-1" />
                  Operations
                </TabsTrigger>
                <TabsTrigger value="all" className="text-[10px] px-2 h-6">
                  <Eye className="h-3 w-3 mr-1" />
                  All
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}

        {/* Video Player with Annotations - Side by Side Layout */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 overflow-auto">
          {/* Video Container - 16:9 aspect ratio */}
          <div className="relative bg-black rounded-lg overflow-hidden w-full lg:w-2/3 flex-shrink-0 aspect-video">
            {/* Show YouTube player if we have a valid YouTube URL (even before analysis) */}
            {youtubeVideoId && isYouTubeUrl(videoUrl) ? (
              <>
                {/* YouTube Video Player */}
                <iframe
                  ref={iframeRef}
                  className="absolute inset-0 w-full h-full"
                  src={getYouTubeEmbedUrl(youtubeVideoId)}
                  title="YouTube video player"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />

                {/* Overlay Layer - shows annotations on top of video */}
                {annotations.length > 0 && (
                  <div
                    ref={overlayRef}
                    className="absolute inset-0 pointer-events-none z-10"
                  >
                    {activeAnnotations.map((ann, idx) => renderAnnotation(ann, idx))}
                  </div>
                )}

                {/* Analysis Summary Bar - only show when we have analysis results */}
                {analysisResult && (
                  <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/60 to-transparent p-2 z-20">
                    <div className="flex items-center justify-between text-white text-xs">
                      <span className="flex items-center gap-1">
                        <Video className="h-3 w-3" />
                        {annotations.length} annotations
                      </span>
                      {analysisResult.analysis_metadata?.duration_analyzed && (
                        <span className="opacity-70">
                          Analyzed: {analysisResult.analysis_metadata.duration_analyzed}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Loading overlay during analysis */}
                {isAnalyzing && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-30">
                    <div className="text-center text-white">
                      <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                      <p className="text-sm">Analyzing video...</p>
                      <p className="text-xs opacity-70">This may take a few minutes for long videos</p>
                    </div>
                  </div>
                )}
              </>
            ) : !analysisResult && !useDemoMode ? (
              /* Placeholder when no video URL */
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                <Video className="h-12 w-12 mb-2 opacity-30" />
                <p className="text-xs">Enter a YouTube URL and click &quot;Analyze&quot;</p>
                <p className="text-[10px] mt-1 opacity-60">
                  The AI will identify events and generate department-specific overlays
                </p>
              </div>
            ) : (
              /* Demo/fallback placeholder for non-YouTube videos */
              <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <Play className="h-16 w-16 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{useDemoMode ? 'Demo Mode Active' : 'Video Ready'}</p>
                  <p className="text-xs opacity-60">
                    {annotations.length} events detected
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Annotations Timeline / List - Right Side Panel */}
          {annotations.length > 0 && (
            <div className="lg:w-1/3 flex-shrink-0 flex flex-col min-h-0">
              {/* Tab Header */}
              <div className="flex items-center justify-between mb-2">
                <Tabs value={feedTab} onValueChange={(v) => setFeedTab(v as AnnotationsFeedTab)}>
                  <TabsList className="h-7">
                    <TabsTrigger value="findings" className="text-[10px] px-2 h-6">
                      <Eye className="h-3 w-3 mr-1" />
                      Findings ({annotations.length})
                    </TabsTrigger>
                    <TabsTrigger value="technical" className="text-[10px] px-2 h-6">
                      <Navigation className="h-3 w-3 mr-1" />
                      Signs & Nav ({technicalAnnotations.length})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <ScrollArea className="flex-1 min-h-0 max-h-[400px] lg:max-h-none">
                {/* High-Level Findings Tab */}
                {feedTab === 'findings' && (
                  <div className="space-y-2 pr-2">
                    {annotations.map((ann) => (
                      <div
                        key={ann.id}
                        className={`p-2 rounded border text-xs transition-all cursor-pointer hover:bg-muted/50 ${
                          activeAnnotations.some((a) => a.id === ann.id)
                            ? 'border-primary bg-primary/10'
                            : 'border-border'
                        }`}
                        onClick={() => {
                          const startTime = parseTimestamp(ann.timestamp_start);
                          setCurrentTime(startTime);
                          if (videoRef.current) {
                            videoRef.current.currentTime = startTime;
                          }
                        }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {ann.timestamp_start} - {ann.timestamp_end}
                          </span>
                          <div className="flex gap-1">
                            <Badge className={`text-[8px] px-1 ${getSecurityColor(ann.departments.security.status)}`}>
                              {ann.departments.security.status}
                            </Badge>
                            <Badge className="text-[8px] px-1 bg-purple-500 text-white">
                              {getSentimentEmoji(ann.departments.marketing.sentiment)}
                            </Badge>
                            <Badge className="text-[8px] px-1 bg-blue-500 text-white">
                              {ann.departments.operations.flow_rate.charAt(0)}
                            </Badge>
                          </div>
                        </div>
                        <p className="text-muted-foreground">{ann.description}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Technical Analysis Tab - Signs & Navigation */}
                {feedTab === 'technical' && (
                  <div className="space-y-3 pr-2">
                    {technicalAnnotations.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8">
                        <Navigation className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        <p className="text-xs">No technical analysis available</p>
                        <p className="text-[10px] mt-1 opacity-60">
                          Technical analysis runs automatically with video analysis
                        </p>
                      </div>
                    ) : (
                      technicalAnnotations.map((tech) => (
                        <div
                          key={tech.id}
                          className={`p-3 rounded border text-xs transition-all ${
                            activeTechnicalAnnotations.some((a) => a.id === tech.id)
                              ? 'border-cyan-500 bg-cyan-500/10'
                              : 'border-border'
                          }`}
                        >
                          {/* Timestamp and Summary */}
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {tech.timestamp_start} - {tech.timestamp_end}
                            </span>
                          </div>
                          <p className="text-muted-foreground mb-2">{tech.summary}</p>

                          {/* Score Bars */}
                          <div className="space-y-1.5 mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] w-20 text-muted-foreground">Nav Stress</span>
                              <Progress value={tech.navigational_stress_score} className="h-1.5 flex-1" />
                              <span className="text-[9px] w-8 text-right">{tech.navigational_stress_score}%</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] w-20 text-muted-foreground">Purchase Intent</span>
                              <Progress value={tech.purchase_intent_score} className="h-1.5 flex-1" />
                              <span className="text-[9px] w-8 text-right">{tech.purchase_intent_score}%</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] w-20 text-muted-foreground">Ad Attention</span>
                              <Progress value={tech.attention_availability} className="h-1.5 flex-1" />
                              <span className="text-[9px] w-8 text-right">{tech.attention_availability}%</span>
                            </div>
                          </div>

                          {/* Agent Behavior */}
                          {tech.agent_behavior && (
                            <div className="mb-2">
                              <div className="text-[9px] font-medium text-cyan-400 flex items-center gap-1 mb-1">
                                <Users className="h-3 w-3" />
                                Crowd Behavior
                              </div>
                              <div className="grid grid-cols-2 gap-1 text-[9px]">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Total</span>
                                  <span>{tech.agent_behavior.agent_count}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Static</span>
                                  <span>{tech.agent_behavior.static_spectators}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Transit</span>
                                  <span>{tech.agent_behavior.transit_passengers}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Awe-Struck</span>
                                  <span>{tech.agent_behavior.awe_struck_count}</span>
                                </div>
                                {tech.agent_behavior.dominant_gaze_target && (
                                  <div className="col-span-2 flex justify-between">
                                    <span className="text-muted-foreground">Looking at</span>
                                    <span className="text-cyan-300 truncate max-w-[100px]">
                                      {tech.agent_behavior.dominant_gaze_target}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Objects Detected */}
                          {tech.objects && (
                            <div className="mb-2">
                              <div className="text-[9px] font-medium text-orange-400 flex items-center gap-1 mb-1">
                                <Luggage className="h-3 w-3" />
                                Objects Detected
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {tech.objects.luggage_trolleys > 0 && (
                                  <Badge className="text-[8px] bg-orange-500/20 text-orange-300">
                                    🧳 {tech.objects.luggage_trolleys} luggage
                                  </Badge>
                                )}
                                {tech.objects.smartphones_cameras > 0 && (
                                  <Badge className="text-[8px] bg-blue-500/20 text-blue-300">
                                    📱 {tech.objects.smartphones_cameras} phones
                                  </Badge>
                                )}
                                {tech.objects.shopping_bags > 0 && (
                                  <Badge className="text-[8px] bg-purple-500/20 text-purple-300">
                                    🛍 {tech.objects.shopping_bags} bags
                                  </Badge>
                                )}
                                {tech.objects.strollers > 0 && (
                                  <Badge className="text-[8px] bg-green-500/20 text-green-300">
                                    👶 {tech.objects.strollers} strollers
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Signs Detected */}
                          {tech.signs_detected.length > 0 && (
                            <div>
                              <div className="text-[9px] font-medium text-green-400 flex items-center gap-1 mb-1">
                                <Signpost className="h-3 w-3" />
                                Signs ({tech.signs_detected.length})
                              </div>
                              <div className="space-y-1">
                                {tech.signs_detected.slice(0, 3).map((sign, idx) => (
                                  <div key={idx} className="p-1.5 bg-muted/30 rounded text-[9px]">
                                    <div className="flex items-center justify-between mb-0.5">
                                      <span className="font-medium truncate max-w-[150px]">{sign.sign_text}</span>
                                      <Badge className={`text-[7px] ${
                                        sign.readability === 'clear' ? 'bg-green-500/20 text-green-300' :
                                        sign.readability === 'moderate' ? 'bg-yellow-500/20 text-yellow-300' :
                                        'bg-red-500/20 text-red-300'
                                      }`}>
                                        {sign.visibility_score}/10
                                      </Badge>
                                    </div>
                                    <div className="text-muted-foreground">
                                      {sign.sign_type} • {sign.location_description}
                                    </div>
                                    {sign.issues && sign.issues.length > 0 && (
                                      <div className="text-red-400 mt-0.5">
                                        ⚠️ {sign.issues.join(', ')}
                                      </div>
                                    )}
                                  </div>
                                ))}
                                {tech.signs_detected.length > 3 && (
                                  <div className="text-[9px] text-muted-foreground text-center">
                                    +{tech.signs_detected.length - 3} more signs
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

