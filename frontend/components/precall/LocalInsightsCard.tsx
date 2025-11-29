'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  MapPin,
  Train,
  Trophy,
  Utensils,
  Landmark,
  Newspaper,
  MessageCircle,
  Lightbulb,
  Globe,
  Search,
  Loader2,
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import type { LocalIntelligence, LocalBondingInsight, NewsSource, NewsItem as NewsItemType } from '@/lib/precall/types';
import { searchLocalNews } from '@/lib/precall/coachService';

/**
 * Get icon based on news category
 */
function getCategoryIcon(category: string): React.ReactNode {
  const cat = category.toLowerCase();
  if (cat.includes('sport')) return <Trophy className="h-4 w-4 text-green-600" />;
  if (cat.includes('transport') || cat.includes('infrastructure')) return <Train className="h-4 w-4 text-blue-600" />;
  if (cat.includes('economic')) return <Globe className="h-4 w-4 text-purple-600" />;
  if (cat.includes('event')) return <Landmark className="h-4 w-4 text-pink-600" />;
  if (cat.includes('weather')) return <Globe className="h-4 w-4 text-cyan-600" />;
  if (cat.includes('political')) return <Globe className="h-4 w-4 text-red-600" />;
  return <Newspaper className="h-4 w-4 text-amber-600" />;
}

/**
 * Get badge color based on news category
 */
function getCategoryColor(category: string): string {
  const cat = category.toLowerCase();
  if (cat.includes('sport')) return 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400';
  if (cat.includes('transport') || cat.includes('infrastructure')) return 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400';
  if (cat.includes('economic')) return 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400';
  if (cat.includes('event')) return 'bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-900/30 dark:text-pink-400';
  if (cat.includes('weather')) return 'bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-900/30 dark:text-cyan-400';
  if (cat.includes('political')) return 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400';
  return 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400';
}

/**
 * Structured news item component
 */
function StructuredNewsItem({ item }: { item: NewsItemType }) {
  return (
    <div className="border rounded-lg p-4 bg-white dark:bg-gray-900/50 shadow-sm mb-3 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {getCategoryIcon(item.category)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant="outline" className={`text-xs ${getCategoryColor(item.category)}`}>
              {item.category}
            </Badge>
            {item.date && (
              <span className="text-xs text-muted-foreground">
                {item.date}
              </span>
            )}
          </div>
          <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100 mb-2">
            {item.headline}
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            {item.details}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Fallback markdown parser for raw response (if structured parsing fails)
 */
function parseRawNewsResponse(text: string): React.ReactNode {
  if (!text) return null;

  // Simple markdown-to-JSX conversion
  const lines = text.split('\n');
  return (
    <div className="space-y-2 text-sm">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;

        // Bold text
        const formatted = trimmed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        // Bullet point
        if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
          return (
            <div key={i} className="flex gap-2 pl-2">
              <span className="text-amber-500">•</span>
              <span dangerouslySetInnerHTML={{ __html: formatted.slice(2) }} />
            </div>
          );
        }

        return <p key={i} dangerouslySetInnerHTML={{ __html: formatted }} />;
      })}
    </div>
  );
}

interface LocalInsightsCardProps {
  localIntelligence: LocalIntelligence;
}

interface LiveNewsState {
  isLoading: boolean;
  newsItems: NewsItemType[];
  rawResponse: string | null; // Fallback
  sources: NewsSource[];
  error: string | null;
}

const categoryIcons: Record<string, React.ReactNode> = {
  'Transportation': <Train className="h-4 w-4" />,
  'Sports': <Trophy className="h-4 w-4" />,
  'Food & Drink': <Utensils className="h-4 w-4" />,
  'Local Landmarks': <Landmark className="h-4 w-4" />,
  'Local News': <Newspaper className="h-4 w-4" />,
  'Culture': <Globe className="h-4 w-4" />,
  'Weather': <Globe className="h-4 w-4" />,
  'Regional Pride': <Globe className="h-4 w-4" />,
  'Economic News': <Newspaper className="h-4 w-4" />,
  'Cultural Events': <Globe className="h-4 w-4" />,
};

function BondingHookItem({ hook }: { hook: LocalBondingInsight }) {
  const icon = categoryIcons[hook.category] || <Lightbulb className="h-4 w-4" />;
  
  return (
    <div className="border rounded-lg p-3 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-amber-600 dark:text-amber-400">{icon}</span>
        <Badge variant="outline" className="text-xs bg-white dark:bg-gray-900">
          {hook.category}
        </Badge>
      </div>
      <p className="font-medium text-sm mb-1">{hook.hook}</p>
      <p className="text-xs text-muted-foreground mb-2">{hook.context}</p>
      <div className="flex items-start gap-2 text-xs bg-white/50 dark:bg-gray-900/50 rounded p-2">
        <MessageCircle className="h-3 w-3 mt-0.5 text-green-600 flex-shrink-0" />
        <span className="text-green-700 dark:text-green-400 italic">{hook.tip}</span>
      </div>
    </div>
  );
}

/**
 * Card component for displaying local bonding insights
 * Automatically fetches real-time news using Gemini Google Search grounding
 */
export function LocalInsightsCard({ localIntelligence }: LocalInsightsCardProps) {
  const { location, cultural_notes, bonding_hooks } = localIntelligence;

  const [liveNews, setLiveNews] = useState<LiveNewsState>({
    isLoading: false,
    newsItems: [],
    rawResponse: null,
    sources: [],
    error: null,
  });

  const [hasFetched, setHasFetched] = useState(false);

  const handleFetchLiveNews = async () => {
    setLiveNews({ isLoading: true, newsItems: [], rawResponse: null, sources: [], error: null });

    try {
      // Fetch news from the last 7 days for recent and relevant results
      const result = await searchLocalNews(location, 7, 5);

      if (result.success) {
        setLiveNews({
          isLoading: false,
          newsItems: result.news_items || [],
          rawResponse: result.raw_response || null,
          sources: result.sources,
          error: null,
        });
      } else {
        setLiveNews({
          isLoading: false,
          newsItems: [],
          rawResponse: null,
          sources: [],
          error: result.error || 'Failed to fetch news',
        });
      }
    } catch (err) {
      setLiveNews({
        isLoading: false,
        newsItems: [],
        rawResponse: null,
        sources: [],
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
    setHasFetched(true);
  };

  // Auto-fetch live news on component mount
  useEffect(() => {
    if (location && !hasFetched && !liveNews.isLoading) {
      handleFetchLiveNews();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  return (
    <Card className="border-l-4 border-l-amber-500 hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <MapPin className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              Local Ice-Breakers
              <Badge variant="outline" className="text-xs bg-red-100 text-red-700 border-red-300">
                Live Search
              </Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">{location}</p>
          </div>
          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleFetchLiveNews}
            disabled={liveNews.isLoading}
            className="flex items-center gap-1 text-xs"
            title="Refresh news from Google Search"
          >
            {liveNews.isLoading ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <RefreshCw className="h-3 w-3" />
                Refresh
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {/* Loading State */}
        {liveNews.isLoading && !liveNews.rawResponse && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>Searching Google for latest news in {location}...</span>
          </div>
        )}

        {/* Error State */}
        {liveNews.error && !liveNews.rawResponse && (
          <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/20 p-3 rounded border border-red-200">
            <p className="font-medium mb-1">Failed to fetch live news</p>
            <p className="text-xs">{liveNews.error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleFetchLiveNews}
              className="mt-2 text-xs"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Try Again
            </Button>
          </div>
        )}

        <Accordion type="multiple" defaultValue={["live-news", "culture"]} className="space-y-2">
          {/* Live News from Google Search - PRIMARY CONTENT */}
          {(liveNews.newsItems.length > 0 || liveNews.rawResponse) && (
            <AccordionItem value="live-news" className="border rounded-lg px-3 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20">
              <AccordionTrigger className="text-sm font-medium py-2">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-amber-600" />
                  <span className="text-amber-700 dark:text-amber-400">Latest News & Events (Last 7 Days)</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pb-2">
                  {/* Structured News Items (preferred) */}
                  {liveNews.newsItems.length > 0 ? (
                    <div className="space-y-0">
                      {liveNews.newsItems.map((item, idx) => (
                        <StructuredNewsItem key={idx} item={item} />
                      ))}
                    </div>
                  ) : liveNews.rawResponse ? (
                    /* Fallback: Parse raw markdown response */
                    <div className="space-y-0">
                      {parseRawNewsResponse(liveNews.rawResponse)}
                    </div>
                  ) : null}

                  {/* Sources as clickable links */}
                  {liveNews.sources.length > 0 && (
                    <div className="border-t pt-3 mt-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" />
                        Verify Sources ({liveNews.sources.length})
                      </p>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {liveNews.sources.map((source, idx) => (
                          source.url ? (
                            <a
                              key={idx}
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300 py-1.5 px-2 rounded hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors border border-transparent hover:border-blue-200"
                            >
                              <ExternalLink className="h-3 w-3 flex-shrink-0" />
                              <span className="line-clamp-1">{source.title || new URL(source.url).hostname}</span>
                            </a>
                          ) : (
                            <div key={idx} className="flex items-center gap-2 text-xs text-muted-foreground py-1.5 px-2">
                              <Newspaper className="h-3 w-3 flex-shrink-0" />
                              <span className="line-clamp-1">{source.title}</span>
                            </div>
                          )
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Cultural/Business Notes - if available */}
          {cultural_notes.length > 0 && (
            <AccordionItem value="culture" className="border rounded-lg px-3">
              <AccordionTrigger className="text-sm font-medium py-2">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-blue-600" />
                  Business Culture Notes ({cultural_notes.length})
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-1 pb-2">
                  {cultural_notes.map((note, idx) => (
                    <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-blue-500">•</span>
                      {note}
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Legacy bonding hooks - only show if populated (for backwards compatibility) */}
          {bonding_hooks.length > 0 && (
            <AccordionItem value="hooks" className="border rounded-lg px-3 opacity-75">
              <AccordionTrigger className="text-sm font-medium py-2">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-gray-400" />
                  <span className="text-muted-foreground">General Topics ({bonding_hooks.length})</span>
                  <Badge variant="outline" className="text-xs">Static</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 pb-2">
                  {bonding_hooks.map((hook, idx) => (
                    <BondingHookItem key={idx} hook={hook} />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </CardContent>
    </Card>
  );
}

export default LocalInsightsCard;

