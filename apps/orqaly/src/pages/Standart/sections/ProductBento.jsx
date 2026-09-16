/**
 * Three cards: the approvals, the panel, and the bill.
 *
 * The order is the order a buyer worries in - "will it do something I did not
 * sanction", then "will the output be any good", then "what will it cost". Each
 * card carries the drawing that answers its own question.
 */
import { PRODUCT_BENTO } from '../standartCopy';
import { MOCK_BY_KIND } from '../mocks';
import SectionShell from '../primitives/SectionShell';
import SectionReveal from '../primitives/SectionReveal';
import Bento from '../primitives/Bento';
import DarkCard from '../primitives/DarkCard';

export default function ProductBento() {
  return (
    <SectionShell id="platform" divider={false}>
      <Bento layout="three">
        {PRODUCT_BENTO.cards.map((card, i) => {
          const Mock = MOCK_BY_KIND[card.mock];
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
