import { useEffect, useState } from 'react';
import { InfoHead } from './InfoParts';
import { loadAboutCopy } from './about.copy';
import { AboutFounders, AboutGoal, AboutMission, AboutStory } from './AboutSections';
import { useLang, useT } from '../../i18n/useT';

const CHAPTERS = ['story', 'goal', 'mission', 'founders'];

/** The chapter the reader is in: the last one whose top has passed the upper third. */
function useActiveChapter(ready) {
  const [active, setActive] = useState(CHAPTERS[0]);
  useEffect(() => {
    if (!ready || typeof IntersectionObserver === 'undefined') return undefined;
    const seen = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => seen.set(entry.target.id, entry.isIntersecting));
        const current = CHAPTERS.find((id) => seen.get(`about-${id}`));
        if (current) setActive(current);
      },
      { rootMargin: '-35% 0px -60% 0px' }
    );
    CHAPTERS.forEach((id) => {
      const section = document.getElementById(`about-${id}`);
      if (section) observer.observe(section);
    });
    return () => observer.disconnect();
  }, [ready]);
  return active;
}

/** Who we are: a hero, then four chapters: story, goal, mission, founders. */
export default function AboutPage({ page }) {
  const { t } = useT('pg');
  const lang = useLang();
  const [copy, setCopy] = useState(null);

  useEffect(() => {
    let live = true;
    loadAboutCopy(lang).then(
      (text) => live && setCopy(text),
      () => {}
    );
    return () => {
      live = false;
    };
  }, [lang]);

  const active = useActiveChapter(Boolean(copy));

  return (
    <>
      <section className="oin-about-hero" aria-labelledby="instant-page-heading">
        <i className="oin-glow" aria-hidden="true" />
        <div className="oi-container">
          <InfoHead page={page} center />
        </div>
      </section>

      {copy && (
        <>
          <nav className="oin-chapters" aria-label={t('pg.about.chapters', 'On this page')}>
            <ol>
              {CHAPTERS.map((id) => (
                <li key={id}>
                  <a
                    href={`#about-${id}`}
                    aria-current={active === id ? 'location' : undefined}
                  >
                    {copy.chapters[id]}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="oi-container oin-about">
            <AboutStory copy={copy.story} />
            <AboutGoal copy={copy.goal} />
            <AboutMission copy={copy.mission} />
            <AboutFounders copy={copy.founders} />
          </div>
        </>
      )}
    </>
  );
}
