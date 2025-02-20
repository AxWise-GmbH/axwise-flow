'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { FileUpload } from '@/components/FileUpload'
import { useTheme, useDarkMode } from '@/components/theme-provider'
import { apiClient } from '@/lib/apiClient'
import type { AnalysisResults, Theme, Pattern, Sentiment } from '@/types/api'

export default function HomePage() {
  const [dataId, setDataId] = useState<number | null>(null)
  const [resultId, setResultId] = useState<number | null>(null)
  const [results, setResults] = useState<AnalysisResults | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isDarkMode = useDarkMode()
  const { setTheme } = useTheme()

  // Handle successful file upload
  const handleUploadComplete = (uploadedDataId: number) => {
    setDataId(uploadedDataId)
    setError(null)
  }

  // Start analysis
  const startAnalysis = async () => {
    if (!dataId) return

    try {
      setIsAnalyzing(true)
      setError(null)

      const response = await apiClient.analyzeData({
        data_id: dataId,
        llm_provider: 'openai',
        llm_model: 'gpt-4o-2024-08-06'
      })

      setResultId(response.result_id)

      // Start polling for results
      const results = await apiClient.pollResults(response.result_id)
      setResults(results)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during analysis')
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Render theme item
  const renderTheme = (theme: Theme) => (
    <div key={theme.id} className="mb-2">
      <h4 className="font-medium">{theme.name}</h4>
      <p className="text-sm text-muted-foreground">
        Confidence: {Math.round(theme.confidence * 100)}%
      </p>
      {theme.examples.length > 0 && (
        <ul className="mt-1 text-sm list-disc pl-4">
          {theme.examples.map((example, i) => (
            <li key={i}>{example}</li>
          ))}
        </ul>
      )}
    </div>
  )

  // Render sentiment
  const renderSentiment = (sentiment: Sentiment) => (
    <div className="mb-4">
      <h4 className="font-medium">Overall: {sentiment.overall}</h4>
      <p className="text-sm text-muted-foreground">
        Score: {Math.round(sentiment.score * 100)}%
      </p>
      {sentiment.breakdown && (
        <div className="mt-2 space-y-1">
          <p className="text-sm">Breakdown:</p>
          <ul className="text-sm list-none pl-4">
            <li>Positive: {Math.round(sentiment.breakdown.positive * 100)}%</li>
            <li>Negative: {Math.round(sentiment.breakdown.negative * 100)}%</li>
            <li>Neutral: {Math.round(sentiment.breakdown.neutral * 100)}%</li>
          </ul>
        </div>
      )}
    </div>
  )

  // Render pattern item
  const renderPattern = (pattern: Pattern) => (
    <div key={pattern.id} className="mb-2">
      <h4 className="font-medium">{pattern.description}</h4>
      <p className="text-sm text-muted-foreground">
        Found {pattern.frequency} times
      </p>
      {pattern.examples.length > 0 && (
        <ul className="mt-1 text-sm list-disc pl-4">
          {pattern.examples.map((example, i) => (
            <li key={i}>{example}</li>
          ))}
        </ul>
      )}
    </div>
  )

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Interview Analysis Tool</CardTitle>
          <CardDescription>
            Upload your interview data in JSON format and get AI-powered insights.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <Button
              variant="outline"
              onClick={() => setTheme(isDarkMode ? 'light' : 'dark')}
              className="mb-4"
            >
              Toggle {isDarkMode ? 'Light' : 'Dark'} Mode
            </Button>
          </div>

          {!dataId ? (
            <FileUpload onUploadComplete={handleUploadComplete} />
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                File uploaded successfully! Data ID: {dataId}
              </p>
              <Button
                onClick={startAnalysis}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? 'Analyzing...' : 'Start Analysis'}
              </Button>
            </div>
          )}

          {isAnalyzing && (
            <div className="mt-4 space-y-2">
              <Progress value={undefined} className="w-full" />
              <p className="text-sm text-muted-foreground">
                Analyzing your data...
              </p>
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-destructive/10 text-destructive rounded-md">
              {error}
            </div>
          )}

          {results && results.results && (
            <div className="mt-6 space-y-6">
              <h3 className="text-lg font-semibold">Analysis Results</h3>
              
              {results.results.themes && results.results.themes.length > 0 && (
                <div>
                  <h4 className="text-base font-medium mb-2">Themes</h4>
                  <div className="space-y-4">
                    {results.results.themes.map(renderTheme)}
                  </div>
                </div>
              )}

              {results.results.sentiment && (
                <div>
                  <h4 className="text-base font-medium mb-2">Sentiment Analysis</h4>
                  {renderSentiment(results.results.sentiment)}
                </div>
              )}

              {results.results.patterns && results.results.patterns.length > 0 && (
                <div>
                  <h4 className="text-base font-medium mb-2">Patterns</h4>
                  <div className="space-y-4">
                    {results.results.patterns.map(renderPattern)}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}