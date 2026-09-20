import More from './ui/More';
import Reveal from './ui/Reveal';
import { Seen } from './SpeedStrip';
import './sections.css';

const ROW_WAVE_MS = 80;

const QUESTIONS = [
  {
    question: 'Do I need to code?',
    answer:
      'No. You describe what you need in plain words. Orqanix writes the files and shows you each change to review.',
  },
  {
    question: 'What does it cost?',
    answer:
      'Orqanix is free during the early version. Commercial terms will be published before paid access begins.',
  },
  {
    question: 'Is my data safe?',
    answer:
      'Your files, commands and chat history stay on your Mac. Your conversation and the results the AI needs are sent to the cloud AI to get an answer. Your sign-in is stored in the macOS Keychain. Chat history is saved on your Mac in a normal file; Orqanix does not add its own encryption.',
  },
  {
    question: 'Will it work on my Mac?',
    answer:
      'It needs a Mac with an Apple M1 chip or newer. To check: Apple menu > About This Mac > Chip. Intel Macs and Windows are not supported yet; the web version works in any browser.',
  },
  {
    question: 'What does early version mean?',
    answer:
      'It is a preview build. It works, but it is not notarized by Apple yet, so macOS asks you to confirm the first time you open it. Expect changes.',
  },
];

export default function InstantFaq() {
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
            Questions
          </Reveal>
        </Seen>
        <Seen className="ois-gate ois-faq">
          {QUESTIONS.map(({ question, answer }, index) => (
            <Reveal key={question} className="ois-faq-row" delay={index * ROW_WAVE_MS}>
              {/* Outside the button, so the question stays the row's whole name and text. */}
              <span className="ois-faq-index" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <More row label={question} openLabel={question}>
                <p>{answer}</p>
              </More>
            </Reveal>
          ))}
        </Seen>
      </div>
    </Seen>
  );
}
