import GcpPublicPage from './GcpPublicPage';

export default function GcpNotFound() {
  return <GcpPublicPage eyebrow="404" title="This page is not in the launch build." body="The GCP release contains the public site, Clerk account access, Assistant, Goals, and personal settings. No legacy module is loaded for this route." />;
}
