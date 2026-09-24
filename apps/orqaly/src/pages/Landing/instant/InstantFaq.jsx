import More from './ui/More';
import Reveal from './ui/Reveal';
import { Seen } from './SpeedStrip';
import { useT } from './i18n/useT';
import './sections.css';

const ROW_WAVE_MS = 80;

/** The translation key of a question's `q` (question) or `a` (answer). */
export function faqKey(id, field) {
  return `faq.${id}.${field}`;
}

export const QUESTIONS = [
  {
    id: 'chatgpt',
    question: 'How is this different from ChatGPT?',
    answer:
      'ChatGPT gives you an answer. Orqanix does the work: AI agents research, plan and make the real files on your Mac, like documents, plans, replies and code.',
  },
  {
    id: 'uses',
    question: 'What can I use it for?',
    answer:
      'Anything that ends in a file or a finished task: a business plan, a campaign, client replies, reports, a website. Save any job as a recipe and run it again, or put it on a schedule.',
  },
  {
    id: 'skills',
    question: 'Do I need technical skills?',
    answer:
      'No. Type or say what you need in plain words. It asks you when it needs something, and you review the result.',
  },
  {
    id: 'safety',
    question: 'Can it change or break things on my Mac?',
    answer:
      'You set the rules: approve every action, approve only the risky ones, or let it run. It starts in “let it run”, and you can stop any run at any moment.',
  },
  {
    id: 'data',
    question: 'Where does my data go?',
    answer:
      'Your files and chat history stay on your Mac. Only your conversation and what the AI needs to answer go to the cloud AI. No ads, no tracking, and we don’t sell your data.',
  },
  {
    id: 'models',
    question: 'Which AI does it use?',
    answer: 'Google Gemini by default. You can connect other models, such as OpenAI or Anthropic.',
  },
  {
    id: 'tools',
    question: 'Does it work with my other tools?',
    answer:
      'Yes. You can switch on 50+ connectors one at a time, and it works alongside your code editor.',
  },
  {
    id: 'ownership',
    question: 'Who owns what it makes?',
    answer: 'You do. AI can make mistakes, so check the results before you rely on them.',
  },
  {
    id: 'cost',
    question: 'What does it cost?',
    answer: 'It’s free during the early version. We’ll publish prices before any paid plan starts.',
  },
  {
    id: 'start',
    question: 'What do I need to start?',
    answer:
      'A Mac with Apple M1 or newer, an internet connection and a free account. The first time you open it, macOS may block it. Go to System Settings › Privacy & Security › Open Anyway. You only do this once.',
  },
];

export default function InstantFaq() {
  const { t } = useT();
  return (
    <Seen
      as="section"
      id="questions"
      className="oi-section ois-section ois-ruled ois-questions"
      aria-labelledby="questions-heading"
    >
      <div className="oi-container ois-faq-layout">
        <Seen className="ois-gate ois-faq-head">
          <Reveal as="h2" id="questions-heading" className="oi-h2">
            {t('faq.title', 'Questions')}
          </Reveal>
        </Seen>
        <Seen className="ois-gate ois-faq">
          {QUESTIONS.map(({ id, question: english, answer }, index) => {
            const question = t(faqKey(id, 'q'), english);
            return (
              <Reveal key={id} className="ois-faq-row" delay={index * ROW_WAVE_MS}>
                {/* Outside the button, so the question stays the row's whole name and text. */}
                <span className="ois-faq-index" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <More row label={question} openLabel={question}>
                  <p>{t(faqKey(id, 'a'), answer)}</p>
                </More>
              </Reveal>
            );
          })}
        </Seen>
      </div>
    </Seen>
  );
}
