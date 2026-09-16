/**
 * The 3 + 2 + 3 grid.
 *
 * The two wide cells are the two claims that need the most room to be believed -
 * a process that waits for a person, and answers that cite their source - so the
 * layout puts them where the eye rests in the middle of a scroll rather than
 * leaving them to compete with six others at the same size.
 */
import { FEATURES } from '../standartCopy';
import { MOCK_BY_KIND } from '../mocks';
import SectionShell from '../primitives/SectionShell';
import SectionReveal from '../primitives/SectionReveal';
import Bento from '../primitives/Bento';
import DarkCard from '../primitives/DarkCard';

export default function FeatureBento() {
  return (
    <SectionShell id="features" heading={FEATURES.heading}>
      <Bento layout="threeTwoThree">
        {FEATURES.cards.map((card, i) => {
          const Mock = MOCK_BY_KIND[card.mock];
          return (
            <SectionReveal key={card.id} index={i} data-span={card.span} sx={{ display: 'flex' }}>
              <DarkCard
                title={card.title}
                body={card.body}
                proof={card.proof}
                mock={Mock ? <Mock /> : null}
                sx={{ flex: 1 }}
              />
            </SectionReveal>
          );
        })}
      </Bento>
    </SectionShell>
  );
}
