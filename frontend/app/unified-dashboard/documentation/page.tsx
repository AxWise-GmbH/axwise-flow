/**
 * Documentation Tab Server Component
 * 
 * ARCHITECTURAL NOTE: This is the server component implementation of the documentation tab.
 * It eliminates the Zustand store dependency by using server components.
 */

export default function DocumentationPage() {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <h2>Interview Insight Analyst Documentation</h2>
      
      <h3>Getting Started</h3>
      <p>
        Upload an interview transcript to analyze themes, patterns, and sentiment.
        The system works best with conversation-style interviews, either in plain text
        format or in a structured JSON format.
      </p>
      
      <h3>File Formats</h3>
      <ul>
        <li>
          <strong>Plain Text (.txt)</strong> - Simple text file with the interview transcript.
          The system will attempt to identify speakers and segments automatically.
        </li>
        <li>
          <strong>JSON Format</strong> - Structured interview data with the following format:
          <pre>
            {`{
  "metadata": {
    "title": "Interview Title",
    "date": "2024-03-10",
    "participants": ["Interviewer", "Subject"]
  },
  "transcript": [
    {
      "speaker": "Interviewer",
      "text": "Tell me about your experience with...",
      "timestamp": "00:01:24"
    },
    {
      "speaker": "Subject",
      "text": "Well, I've been working with this technology for...",
      "timestamp": "00:01:32"
    }
  ]
}`}
          </pre>
        </li>
      </ul>
      
      <h3>Analysis Process</h3>
      <ol>
        <li>Upload your interview file using the Upload tab.</li>
        <li>Select your preferred LLM provider (OpenAI or Gemini).</li>
        <li>Click "Start Analysis" to begin processing.</li>
        <li>Once complete, view the results in the Visualization tab.</li>
      </ol>
      
      <h3>Understanding the Results</h3>
      <ul>
        <li>
          <strong>Themes</strong> - Key topics and concepts mentioned in the interview,
          with frequency and representative quotes.
        </li>
        <li>
          <strong>Patterns</strong> - Recurring behaviors, attitudes, or expressions
          identified in the interview.
        </li>
        <li>
          <strong>Sentiment</strong> - Emotional tone throughout the interview,
          shown as a timeline and with supporting statements.
        </li>
        <li>
          <strong>Personas</strong> - AI-generated profiles based on the interview content,
          identifying roles, responsibilities, and characteristics.
        </li>
      </ul>
    </div>
  );
} 