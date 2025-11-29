'use client';

import React, { useState, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  MessageSquare,
  MapPin,
  Sparkles,
  Globe,
  Coffee,
  Newspaper,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import type { CallIntelligence, LocalIntelligence, NewsItem, NewsSource } from '@/lib/precall/types';
import { searchLocalNews } from '@/lib/precall/coachService';

interface LiveNewsState {
  isLoading: boolean;
  newsItems: NewsItem[];
  sources: NewsSource[];
  error: string | null;
}

interface OpenTabProps {
  intelligence: CallIntelligence;
  localIntelligence?: LocalIntelligence | null;
}

/**
 * OPEN Tab - Opening & rapport building
 *
 * Displays: Opening Line, Local Bonding Insights, Conversation Starters, Cultural Notes, Live News
 */
export function OpenTab({ intelligence, localIntelligence }: OpenTabProps) {
  const { callGuide } = intelligence;
  const local = localIntelligence || intelligence.localIntelligence;

  // Live news state
  const [liveNews, setLiveNews] = useState<LiveNewsState>({
    isLoading: false,
    newsItems: [],
    sources: [],
    error: null,
  });
  const [hasFetched, setHasFetched] = useState(false);

  const handleFetchNews = useCallback(async () => {
    if (!local?.location) return;

    setLiveNews({ isLoading: true, newsItems: [], sources: [], error: null });

    try {
      const result = await searchLocalNews(local.location, 7, 5);

      if (result.success) {
        setLiveNews({
          isLoading: false,
          newsItems: result.news_items || [],
          sources: result.sources || [],
          error: null,
        });
      } else {
        setLiveNews({
          isLoading: false,
          newsItems: [],
          sources: [],
          error: result.error || 'Failed to fetch news',
        });
      }
    } catch (err) {
      setLiveNews({
        isLoading: false,
        newsItems: [],
        sources: [],
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
    setHasFetched(true);
  }, [local?.location]);

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        {/* Opening Line - Highlighted for memorization */}
        <Card className="border-2 border-green-500 bg-green-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-green-600" />
              Opening Line
              <Badge variant="secondary" className="text-xs ml-auto">
                Memorize This!
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <blockquote className="text-lg font-medium italic border-l-4 border-green-500 pl-4 py-2 bg-white rounded-r-md">
              "{callGuide?.opening_line || 'No opening line generated.'}"
            </blockquote>
            <p className="text-xs text-muted-foreground mt-3">
              💡 Tip: Practice this line out loud 2-3 times before the call.
            </p>
          </CardContent>
        </Card>

        {/* Cultural Notes */}
        {local?.cultural_notes && local.cultural_notes.length > 0 && (
          <Card className="border-l-4 border-l-purple-400">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Globe className="h-4 w-4 text-purple-600" />
                Cultural & Business Etiquette
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
                {local.cultural_notes.map((note, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {note}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Location & Live News - Combined Section */}
        {local?.location && (
          <Card className="border-l-4 border-l-orange-400">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <MapPin className="h-4 w-4 text-orange-600" />
                <span>{local.location}</span>
                <Newspaper className="h-4 w-4 text-orange-600 ml-2" />
                {liveNews.newsItems.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {liveNews.newsItems.length} news
                  </Badge>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto h-7 text-xs"
                  onClick={handleFetchNews}
                  disabled={liveNews.isLoading}
                >
                  <RefreshCw className={`h-3 w-3 mr-1 ${liveNews.isLoading ? 'animate-spin' : ''}`} />
                  {hasFetched ? 'Refresh' : 'Fetch Live News'}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {/* Loading state */}
              {liveNews.isLoading && (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                  Searching for news in {local.location}...
                </div>
              )}

              {/* Error state */}
              {liveNews.error && (
                <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                  ⚠️ {liveNews.error}
                </div>
              )}

              {/* News items */}
              {!liveNews.isLoading && liveNews.newsItems.length > 0 && (
                <div className="space-y-3">
                  {liveNews.newsItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="text-sm bg-orange-50 p-3 rounded border border-orange-100"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          {item.category}
                        </Badge>
                        {item.date && (
                          <span className="text-xs text-muted-foreground">{item.date}</span>
                        )}
                      </div>
                      <p className="font-medium text-orange-800">📰 {item.headline}</p>
                      <p className="text-muted-foreground text-xs mt-1">{item.details}</p>
                    </div>
                  ))}

                  {/* Sources */}
                  {liveNews.sources.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-xs text-muted-foreground mb-1">Sources:</p>
                      <div className="flex flex-wrap gap-2">
                        {liveNews.sources.slice(0, 5).map((source, idx) => (
                          source.url ? (
                            <a
                              key={idx}
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                            >
                              {source.title}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span key={idx} className="text-xs text-muted-foreground">
                              {source.title}
                            </span>
                          )
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground mt-2 italic">
                    💡 Use these as conversation starters to show you're informed about their region.
                  </p>
                </div>
              )}

              {/* Empty state (not yet fetched) */}
              {!liveNews.isLoading && !hasFetched && (
                <p className="text-sm text-muted-foreground py-2">
                  Click "Fetch Live News" to get recent news from {local.location} for ice-breakers.
                </p>
              )}

              {/* No results state */}
              {!liveNews.isLoading && hasFetched && liveNews.newsItems.length === 0 && !liveNews.error && (
                <p className="text-sm text-muted-foreground py-2">
                  No recent news found for {local.location}. Try again later.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Bonding Hooks / Ice-breakers */}
        {local?.bonding_hooks && local.bonding_hooks.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Coffee className="h-4 w-4 text-amber-600" />
                Ice-Breakers & Bonding Hooks
              </h3>
              <Badge variant="secondary" className="text-xs">
                {local.bonding_hooks.length}
              </Badge>
            </div>
            <div className="space-y-3">
              {local.bonding_hooks.map((hook, idx) => (
                <Card key={idx} className="border-l-4 border-l-amber-400">
                  <CardContent className="p-3">
                    <Badge variant="outline" className="text-xs mb-2">
                      {hook.category}
                    </Badge>
                    <p className="text-sm font-medium">"{hook.hook}"</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {hook.context}
                    </p>
                    {hook.tip && (
                      <p className="text-xs text-blue-600 mt-2 italic">
                        💡 {hook.tip}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Conversation Starters */}
        {local?.conversation_starters && local.conversation_starters.length > 0 && (
          <Card className="border-l-4 border-l-green-400">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-green-600" />
                Ready-to-Use Conversation Starters
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="space-y-2">
                {local.conversation_starters.map((starter, idx) => (
                  <li
                    key={idx}
                    className="text-sm bg-green-50 p-2 rounded border border-green-100 italic"
                  >
                    "{starter}"
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Fallback if no local intelligence */}
        {!local && (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center text-muted-foreground">
              <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                No location-based insights available.
                <br />
                Add location info to prospect data for ice-breakers.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}

export default OpenTab;

