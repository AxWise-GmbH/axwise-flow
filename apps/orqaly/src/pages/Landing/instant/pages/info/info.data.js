import { COMPANY, LAST_UPDATED } from './company';

/*
 * Copy for the four text pages behind the footer. Each page has the fields its own layout
 * needs; a legal section has a title and any of text (paragraphs), list (bullets) and links.
 * Every claim about the app or the site here was checked against the code; keep it so.
 */

const mail = (address) => `mailto:${address}`;
const operator = [COMPANY.legalName, COMPANY.address].filter(Boolean).join(', ');

const about = {
  tag: 'Company',
  title: 'Made for people with work to do.',
  line: 'Made by a group of AI product engineers and consultants.',
  statement: [
    'Orqanix is an app for your Mac.',
    'You say what you need in plain words.',
    'AI agents research, plan and make the real files.',
  ],
  principles: [
    {
      title: 'Your Mac first',
      text: 'Your files, commands and chat history stay on your Mac.',
    },
    {
      title: 'Plain words in. Real files out.',
      text: 'No coding. Orqanix shows you each result to review.',
    },
    {
      title: 'Built in the open',
      text: 'Built on Goose, an open-source agent under the Apache 2.0 license.',
    },
  ],
  why: 'Good AI tools are still built for engineers. We want a founder with no technical team to get the same work done, on their own computer, in minutes.',
  email: COMPANY.email,
};

const contact = {
  tag: 'Company',
  title: 'Contact',
  line: 'Write to us. A person reads it.',
  channels: [
    {
      icon: 'hello',
      title: 'Say hello',
      text: 'Questions, feedback and help with the app.',
      email: COMPANY.email,
    },
    {
      icon: 'privacy',
      title: 'Privacy',
      text: 'Ask what we hold about you, or ask us to delete it.',
      email: COMPANY.privacyEmail,
    },
    {
      icon: 'security',
      title: 'Security',
      text: 'Found a weak spot? Tell us first. We answer quickly.',
      email: COMPANY.securityEmail,
    },
  ],
  operator,
};

const privacy = {
  tag: 'Legal',
  title: 'Privacy',
  // Where your data goes, at a glance. Each lane repeats what the sections below say in full.
  map: [
    {
      title: 'Stays on your Mac',
      home: true,
      items: ['Your files', 'Your commands', 'Chat history', 'Sign-in, in the Keychain'],
    },
    { title: 'Goes to the AI', items: ['Your conversation', 'The results the AI needs'] },
    { title: 'Held by us', items: ['Email address', 'Name, if you give it', 'Sign-in records'] },
  ],
  promise: 'No ads. No tracking cookies. We do not sell your data.',
  line: `The plain version of what we collect and why. Last updated ${LAST_UPDATED}.`,
  sections: [
    {
      title: 'Who we are',
      text: [
        operator
          ? `Orqanix is run by ${operator}. We decide how your personal data is used.`
          : 'Orqanix (“we”) makes the Orqanix app and this website. We decide how your personal data is used.',
      ],
      links: [{ label: COMPANY.privacyEmail, href: mail(COMPANY.privacyEmail) }],
    },
    {
      title: 'This website',
      list: [
        'Our host, Google Cloud, keeps normal server logs: IP address, browser and time of visit. We use them for security and to fix problems.',
        'The fonts come from Google Fonts, so your browser asks Google for the font files.',
        'We set no advertising or tracking cookies. If you sign in, the sign-in service sets the cookies it needs to keep you signed in.',
      ],
    },
    {
      title: 'Your account',
      text: [
        'To use the app you sign in with an Orqanix account. We hold your email address, your name if you give it, and sign-in records. Sign-in is run for us by Clerk.',
      ],
    },
    {
      title: 'The app on your Mac',
      list: [
        'Your files, commands and chat history stay on your Mac.',
        'Your conversation and the results the AI needs are sent to the cloud AI to get an answer. In the early version that is Google Gemini.',
        'Your sign-in is stored in the macOS Keychain.',
        'Chat history is saved on your Mac in a normal file. Orqanix does not add its own encryption.',
        'The app does not send usage statistics.',
      ],
    },
    {
      title: 'Models and tools you connect',
      text: [
        'If you connect another AI model or a tool, what you send goes to that provider under its own privacy terms. You choose what to connect.',
      ],
    },
    {
      title: 'Services we use',
      list: [
        'Google Cloud: hosting for the website and our servers.',
        'Clerk: sign-in and accounts.',
        'Google Gemini: AI answers in the early version.',
        'Google Fonts: the typeface on this website.',
      ],
      text: [
        'Some of these work outside the EU and the UK. For those transfers we rely on the EU Standard Contractual Clauses.',
      ],
    },
    {
      title: 'Why we may use your data',
      list: [
        'Contract: to give you the app and the account you signed up for.',
        'Legitimate interest: to keep the service safe and working.',
        'Legal duty: when the law makes us keep or share something.',
      ],
    },
    {
      title: 'How long we keep it',
      list: [
        'Account data: until you ask us to delete your account.',
        'Server logs: only as long as security and fixing problems need.',
        'Everything the app saves on your Mac is yours to delete at any time.',
      ],
    },
    {
      title: 'Your rights',
      text: [
        'You can ask for a copy of your data, ask us to correct or delete it, take it with you, or object to a use. Write to us and we answer within 30 days. You can also complain to your data protection authority.',
      ],
      links: [{ label: COMPANY.privacyEmail, href: mail(COMPANY.privacyEmail) }],
    },
    {
      title: 'Children',
      text: ['Orqanix is not for anyone under 16.'],
    },
    {
      title: 'Changes',
      text: ['When this page changes, the date at the top changes with it.'],
    },
  ],
};

const terms = {
  tag: 'Legal',
  title: 'Terms',
  facts: [
    { big: 'Free', text: 'while the version is early' },
    { big: '16+', text: 'to have an account' },
    { big: 'Yours', text: 'what you make belongs to you' },
    { big: 'As is', text: 'early version, no warranty' },
  ],
  line: `The rules for using Orqanix, in plain words. Last updated ${LAST_UPDATED}.`,
  sections: [
    {
      title: 'The early version',
      text: [
        'Orqanix is an early version. It is free while it is early. Commercial terms will be published before paid access begins. By using the app or this website you accept these terms.',
      ],
    },
    {
      title: 'Your account',
      text: [
        'You need an Orqanix account and must be 16 or older. Keep your sign-in safe. What happens under your account is your responsibility.',
      ],
    },
    {
      title: 'Your work is yours',
      text: [
        'What you put in and what Orqanix makes for you belongs to you. We claim no rights to it.',
      ],
    },
    {
      title: 'Check the results',
      text: [
        'AI can be wrong. Review what Orqanix makes before you rely on it. It is not legal, medical, financial or other professional advice.',
      ],
    },
    {
      title: 'It works on your Mac',
      text: [
        'At your request the app creates and changes files and runs commands on your computer. You decide what to ask for. Keep backups of anything important.',
      ],
    },
    {
      title: 'Other services',
      text: [
        'The AI models and tools you use through Orqanix have their own terms and prices. When you connect one, its terms apply to you too.',
      ],
    },
    {
      title: 'Fair use',
      list: [
        'Nothing illegal and nothing that harms other people.',
        'No breaking into systems or accounts that are not yours.',
        'No overloading, reselling or attacking the service.',
      ],
    },
    {
      title: 'Open source',
      text: [
        'Orqanix is built on Goose, open-source software under the Apache 2.0 license. Open-source parts keep their own licenses.',
      ],
    },
    {
      title: 'No warranty',
      text: [
        'An early version can change, break or stop. We provide it as it is, without warranties. As far as the law allows, we are not liable for lost data, lost profit or indirect damage. Nothing here takes away rights the law gives you as a consumer.',
      ],
    },
    {
      title: 'Ending',
      text: [
        'You can stop at any time: delete the app and ask us to delete your account. We may suspend an account that breaks these terms.',
      ],
    },
    {
      title: 'Changes',
      text: [
        'When these terms change, the date at the top changes with them. If you keep using Orqanix after that, the new terms apply.',
      ],
    },
    ...(COMPANY.law
      ? [{ title: 'Governing law', text: [`These terms follow the law of ${COMPANY.law}.`] }]
      : []),
    {
      title: 'Contact',
      links: [{ label: COMPANY.email, href: mail(COMPANY.email) }],
    },
  ],
};

export const INFO_PAGES = { about, contact, privacy, terms };
