import { Box, Container, Typography } from '@mui/material';
import './SimpleHowItWorks.css';

function Exchange() {
  return (
    <div className="oq-flow-exchange" aria-hidden="true">
      <span>Request + context</span>
      <i>→</i>
      <i>←</i>
      <span>Response</span>
    </div>
  );
}

export default function SimpleHowItWorks() {
  return (
    <Box
      component="section"
      id="how-it-works"
      aria-labelledby="local-cloud-title"
      sx={{ pt: { xs: 3, md: 4 }, pb: { xs: 3, md: 5 }, scrollMarginTop: 88 }}
    >
      <Container maxWidth="lg">
        <Typography
          component="h2"
          id="local-cloud-title"
          sx={{
            color: 'text.primary',
            fontSize: { xs: '1.75rem', md: '2.5rem' },
            fontWeight: 700,
            letterSpacing: '-0.04em',
            mb: 1.5,
          }}
        >
          From your request to useful work.
        </Typography>
        <Typography sx={{ maxWidth: 720, color: 'text.secondary', mb: 4, lineHeight: 1.7 }}>
          Tell Orqanix what you want to get done. Add files if they help. Move between research,
          planning and doing in one conversation, with the results beside you.
        </Typography>

        <div className="oq-flow" aria-label="How Orqanix connects your desktop and the cloud">
          <div className="oq-flow-device">
            <h3 className="oq-flow-label">On your device</h3>
            <div className="oq-flow-request">
              <strong>Your request</strong>
              <span>Optional files and project context</span>
            </div>
            <span className="oq-flow-down" aria-hidden="true">
              ↓
            </span>
            <div className="oq-flow-desktop">
              <span className="oq-flow-signin">Browser sign-in</span>
              <h4>Orqanix Desktop</h4>
              <p>Chat + Workspace panel</p>
              <small>Built on Goose</small>
            </div>
            <span className="oq-flow-down" aria-hidden="true">
              ↕
            </span>
            <div className="oq-flow-local">
              <strong>Files · Tools · Skills · History</strong>
              <span>Local tools, with your approval controls</span>
            </div>
          </div>

          <Exchange />

          <div className="oq-flow-cloud">
            <h3 className="oq-flow-label">In the cloud</h3>
            <div className="oq-flow-cloud-body">
              <div className="oq-flow-gateway">
                <h4>Orqanix Gateway</h4>
                <p>Identity &amp; access</p>
                <p>Conversation context</p>
                <span>Selected project context, when useful</span>
              </div>
              <div className="oq-flow-cloud-services">
                <div className="oq-flow-service">
                  <span className="oq-flow-service-arrow" aria-hidden="true">
                    ↔
                  </span>
                  <h4>Gemini</h4>
                  <p>Cloud reasoning</p>
                </div>
                <div className="oq-flow-service">
                  <span className="oq-flow-service-arrow" aria-hidden="true">
                    ↔
                  </span>
                  <h4>Research on demand</h4>
                  <p>A cognitive layer for deeper context</p>
                </div>
              </div>
            </div>
            <p className="oq-flow-key-note">Model keys stay server-side.</p>
          </div>

          <div className="oq-flow-outputs">
            <div>
              <span className="oq-flow-label">Back in your connected workspace</span>
              <h3>Your outputs</h3>
              <p>Useful results beside the conversation, ready to review and work with.</p>
            </div>
            <ul aria-label="Examples of useful outputs">
              <li>Briefs &amp; documents</li>
              <li>Spreadsheets</li>
              <li>Scripts &amp; workflows</li>
            </ul>
          </div>
        </div>

        <Typography
          sx={{
            mt: 3,
            maxWidth: 900,
            fontSize: '0.82rem',
            color: 'text.secondary',
            lineHeight: 1.7,
          }}
        >
          Conversation context and selected tool results are sent to the cloud model. Cloud
          documents are available on demand. Automatic syncing of local files and chat history is
          not part of this preview.
        </Typography>
      </Container>
    </Box>
  );
}
