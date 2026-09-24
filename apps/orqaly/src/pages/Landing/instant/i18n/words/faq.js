import { QUESTIONS, faqKey } from '../../InstantFaq';

// The home page questions (InstantFaq.jsx), keyed at run time by faqKey.
export default function words() {
  return Object.fromEntries(
    QUESTIONS.flatMap(({ id, question, answer }) => [
      [faqKey(id, 'q'), question],
      [faqKey(id, 'a'), answer],
    ])
  );
}
