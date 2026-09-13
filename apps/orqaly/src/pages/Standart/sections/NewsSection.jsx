/**
 * Featured post, a card row, and the full list.
 *
 * All three read off standartChangelog, so they cannot drift: adding an entry
 * promotes it to featured, pushes the old one into the card row, and appends to
 * the list, with no flag to move and nothing to remember.
 *
 * The gradient panels are CSS rather than images. Five images would be five
 * requests and five things to keep in step with a design that changes; a
 * gradient keyed off the entry's position is neither.
 */
import { Box } from '@mui/material';
import { ALL_POSTS, CARDS, FEATURED, formatEntryDate } from '../standartChangelog';
import { NEWS } from '../standartCopy';
import { INK, RADII, TYPE } from '../standartTokens';
import SectionShell from '../primitives/SectionShell';
import SectionReveal from '../primitives/SectionReveal';
import HairlineList from '../primitives/HairlineList';
import CardScroller from '../primitives/CardScroller';
import Pill from '../primitives/Pill';

/**
 * A panel of moving grey.
 *
 * Angle varies with position so the four cards do not read as one repeated
 * texture, which is the failure mode of a generated gradient set.
 */
function GradientPanel({ seed = 0, height = 160 }) {
  const angle = 120 + seed * 37;
  return (
    <Box
      aria-hidden="true"
      sx={{
        height,
        borderRadius: RADII.cardSm,
        border: `1px solid ${INK.line}`,
        background: `linear-gradient(${angle}deg, #1C1C1C 0%, #131313 45%, #0D0D0D 100%)`,
      }}
    />
  );
}

export default function NewsSection({ onGo }) {
  return (
    <SectionShell id="news" heading={NEWS.heading}>
      <SectionReveal
        index={0}
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1.2fr' },
          gap: { xs: 3, md: 6 },
          alignItems: 'center',
          mb: { xs: 5, md: 8 },
        }}
      >
        <Box sx={{ display: 'grid', gap: 2, alignContent: 'start' }}>
          <Box sx={{ ...TYPE.proof, color: INK.dimmer }}>{formatEntryDate(FEATURED.date)}</Box>
          <Box component="h3" sx={{ ...TYPE.h2, color: INK.bright, m: 0 }}>
            {FEATURED.title}
          </Box>
          <Box sx={{ ...TYPE.body, color: INK.dim, maxWidth: 460 }}>{FEATURED.summary}</Box>
          {FEATURED.sectionId && (
            <Box>
              <Pill
                variant="ghost"
                href={`#${FEATURED.sectionId}`}
                onClick={(event) => {
                  event.preventDefault();
                  onGo(FEATURED.sectionId);
                }}
              >
                {NEWS.readMore}
              </Pill>
            </Box>
          )}
        </Box>
        <GradientPanel height={260} />
      </SectionReveal>

      <CardScroller
        count={CARDS.length}
        label="post"
        gridSx={{ gridTemplateColumns: { md: 'repeat(4, 1fr)' } }}
      >
        {CARDS.map((entry, i) => (
          <SectionReveal
            key={entry.id}
            index={i}
            sx={{ display: 'grid', gap: 1.5, alignContent: 'start' }}
          >
            <GradientPanel seed={i + 1} height={120} />
            <Box sx={{ ...TYPE.proof, color: INK.dimmer }}>{formatEntryDate(entry.date)}</Box>
            <Box sx={{ ...TYPE.body, color: INK.bright }}>{entry.title}</Box>
          </SectionReveal>
        ))}
      </CardScroller>

      <SectionReveal sx={{ mt: { xs: 6, md: 9 } }}>
        <Box component="h3" sx={{ ...TYPE.cardH, color: INK.bright, m: 0, mb: 1 }}>
          {NEWS.allPostsLabel}
        </Box>
        <HairlineList
          items={ALL_POSTS.map((entry) => ({
            id: entry.id,
            title: entry.title,
            body: entry.summary,
            meta: formatEntryDate(entry.date),
            sectionId: entry.sectionId,
          }))}
          onSelect={(item) => item.sectionId && onGo(item.sectionId)}
        />
      </SectionReveal>
    </SectionShell>
  );
}
