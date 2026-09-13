/**
 * The 2x2, and the only section that is mostly words.
 *
 * Deliberately light on drawings: it sits between two mockup-dense stretches,
 * and a page that never lets up is a page nobody finishes. Only the supervisor
 * cell earns a picture, because "it stops the agent" is the claim in this
 * section a reader is most likely to doubt.
 */
import { MANY } from '../standartCopy';
import { MOCK_BY_KIND } from '../mocks';
import SectionShell from '../primitives/SectionShell';
import SectionReveal from '../primitives/SectionReveal';
import Bento from '../primitives/Bento';
import DarkCard from '../primitives/DarkCard';

export default function ManyAgents() {
  return (
    <SectionShell id="many" heading={MANY.heading} align="center">
      <Bento layout="quad">
        {MANY.cards.map((card, i) => {
          const Mock = card.mock ? MOCK_BY_KIND[card.mock] : null;
          return (
            <SectionReveal key={card.id} index={i} sx={{ display: 'flex' }}>
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
