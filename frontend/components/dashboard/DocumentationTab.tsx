'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

/**
 * Tab for displaying application documentation
 */
const DocumentationTab = (): JSX.Element => { // Add return type
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Documentation</CardTitle>
        <CardDescription>
          Learn how to use the Interview Analysis Application
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="item-1">
            <AccordionTrigger>Getting Started</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <p>
                  This application helps analyze interview data to extract insights, identify patterns, and generate personas.
                  Follow these steps to get started:
                </p>
                <ol className="list-decimal pl-5 space-y-2">
                  <li>Upload your interview data (JSON format or raw text)</li>
                  <li>Select an LLM provider (Google Gemini or OpenAI)</li>
                  <li>Start the analysis</li>
                  <li>View the results in the Visualization tab</li>
                </ol>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-2">
            <AccordionTrigger>Data Formats</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <p>The application supports the following data formats:</p>

                <div>
                  <h4 className="font-medium">JSON Format</h4>
                  <p className="mt-1 mb-2">
                    For structured interview data, use JSON format with the following structure:
                  </p>
                  <pre className="bg-muted p-3 rounded-md text-xs overflow-auto">
                    {`[
  {
    "interview_id": "123",
    "participant": "User A",
    "questions": [
      {
        "question": "What challenges do you face?",
        "answer": "The biggest challenge is integration."
      },
      // More questions...
    ],
    "metadata": {
      "date": "2025-01-15",
      "interviewer": "John Doe"
    }
  }
]`}
                  </pre>
                </div>

                <div>
                  <h4 className="font-medium">Text Format</h4>
                  <p className="mt-1 mb-2">
                    For raw interview transcripts, use plain text files. The application supports:
                  </p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Q&A format (questions prefixed with &quot;Q:&quot;, answers with &quot;A:&quot;)</li> {/* Escape quotes */}
                    <li>Chat transcript format (name followed by message)</li>
                    <li>Free-form text</li>
                  </ul>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-3">
            <AccordionTrigger>LLM Providers</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <p>
                  The application supports two LLM providers, each with different strengths:
                </p>

                <div>
                  <h4 className="font-medium">Google Gemini</h4>
                  <ul className="list-disc pl-5">
                    <li>Optimized for structured schema-based analysis</li>
                    <li>Strong at direct text-to-persona generation</li>
                    <li>Good pattern recognition</li>
                    <li>Uses Gemini 2.0 Flash model</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-medium">OpenAI GPT</h4>
                  <ul className="list-disc pl-5">
                    <li>Excellent for nuanced sentiment analysis</li>
                    <li>Better at identifying subtle themes</li>
                    <li>More detailed explanations</li>
                    <li>Uses GPT-4o model</li>
                  </ul>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-4">
            <AccordionTrigger>Visualization</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <p>
                  The Visualization tab provides four different views of your analysis results:
                </p>

                <div>
                  <h4 className="font-medium">Themes</h4>
                  <p>
                    Shows major themes identified in the interviews with supporting statements.
                    Larger bubbles indicate themes mentioned more frequently.
                  </p>
                </div>

                <div>
                  <h4 className="font-medium">Patterns</h4>
                  <p>
                    Displays recurring patterns and behaviors extracted from the interviews.
                    Each pattern includes supporting evidence and confidence score.
                  </p>
                </div>

                <div>
                  <h4 className="font-medium">Sentiment</h4>
                  <p>
                    Visualizes the sentiment analysis of interview responses.
                    Includes overall sentiment distribution and individual statements.
                  </p>
                </div>

                <div>
                  <h4 className="font-medium">Personas</h4>
                  <p>
                    Shows user personas generated from the interview data.
                    Each persona includes demographics, goals, pain points, and key quotes.
                  </p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-5">
            <AccordionTrigger>FAQ</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium">What file size limits are there?</h4>
                  <p>
                    The maximum file size for uploads is 10MB.
                  </p>
                </div>

                <div>
                  <h4 className="font-medium">How long does analysis take?</h4>
                  <p>
                    Analysis time depends on the size of your data and the selected LLM provider.
                    Typically, analysis takes 30 seconds to 2 minutes.
                  </p>
                </div>

                <div>
                  <h4 className="font-medium">Are my interviews private?</h4>
                  <p>
                    Yes, your interview data is processed securely and not stored permanently
                    unless you choose to save the analysis.
                  </p>
                </div>

                <div>
                  <h4 className="font-medium">Can I export the results?</h4>
                  <p>
                    Yes! You can export your analysis results as PDF or Markdown documents. Look for the Export button in the top-right corner of the Visualization tab.
                  </p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
};

export default DocumentationTab;
