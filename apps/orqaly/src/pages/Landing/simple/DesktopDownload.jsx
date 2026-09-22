import { Button, Link, Typography } from '@mui/material';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import { DESKTOP_RELEASE } from './desktop-release';

export function DesktopDownloadButton({ descriptionId }) {
  return (
    <Button
      component="a"
      href={DESKTOP_RELEASE.url}
      download={DESKTOP_RELEASE.filename}
      referrerPolicy="no-referrer"
      aria-describedby={descriptionId}
      variant="contained"
      size="large"
      startIcon={<DownloadRoundedIcon />}
      sx={{ px: 3, minHeight: 48 }}
    >
      Download for macOS
    </Button>
  );
}

export function DesktopReleaseDetails({ id, showChecksum = false }) {
  return (
    <Typography id={id} sx={{ fontSize: '0.8rem', color: 'text.secondary', lineHeight: 1.8 }}>
      Orqanix {DESKTOP_RELEASE.version} · Apple Silicon ·{' '}
      {Math.round(DESKTOP_RELEASE.bytes / 1_000_000)} MB · Preview (not notarized)
      <br />
      Sign in with your Orqanix account to use the app.
      {showChecksum && (
        <>
          {' '}
          <Link href={`${DESKTOP_RELEASE.url}.sha256`} color="inherit" referrerPolicy="no-referrer">
            SHA-256 checksum
          </Link>
        </>
      )}
    </Typography>
  );
}
