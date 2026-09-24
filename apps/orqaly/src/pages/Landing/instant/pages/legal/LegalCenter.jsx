import { useEffect } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import InstantLayout from '../../InstantLayout';
import { useT } from '../../i18n/useT';
import LegalHub from './LegalHub';
import LegalDoc from './LegalDoc';
import { useLegalRegion } from './legalRegion';
import { LEGAL_BASE, findLegalDoc, isRegion, legalNames, legalPath } from './legal.links';
import './legal.css';

/*
 * Everything under /instant/legal:
 *   /instant/legal             the Legal Center, in the visitor's chosen (or the default) version
 *   /instant/legal/eu          the Legal Center, EU version (us likewise)
 *   /instant/legal/eu/privacy  one document, EU version
 *   /instant/legal/privacy     no version named: goes to the chosen (or default) one. Never by
 *                              where the visitor is: that may only be suggested.
 */
export default function LegalCenter() {
  const { '*': rest = '' } = useParams();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const { t } = useT('lg');
  const parts = rest.split('/').filter(Boolean);
  const fromUrl = isRegion(parts[0]) ? parts[0] : null;
  const slug = fromUrl ? parts[1] : parts[0];
  const entry = slug ? findLegalDoc(slug) : null;
  const { region, suggest, choose } = useLegalRegion(fromUrl);

  // A new page starts at its top, unless the address points at a section of it.
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
    // Only a new path counts; a new #section is the document's own business.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rest]);

  const valid = parts.length <= (fromUrl ? 2 : 1) && (!slug || entry);
  if (!valid) return <Navigate to={LEGAL_BASE} replace />;
  if (entry && !fromUrl) return <Navigate to={`${legalPath(entry.slug, region)}${hash}`} replace />;

  const pick = (next, keepHash = '') => {
    choose(next);
    navigate(`${legalPath(entry?.slug, next)}${keepHash}`, { replace: true });
  };
  const names = legalNames(t);
  const title = t('lg.pageTitle', 'Orqanix — {title} ({region})', {
    title: entry ? names.doc(entry.slug) : t('lg.title', 'Legal'),
    region: names.regionLabel(region),
  });

  return (
    <InstantLayout title={title} translated>
      {entry ? (
        <LegalDoc entry={entry} region={region} suggest={suggest} onChoose={pick} />
      ) : (
        <LegalHub region={region} suggest={suggest} onChoose={pick} />
      )}
    </InstantLayout>
  );
}
