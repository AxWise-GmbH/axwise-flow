export default {
  slug: 'real-estate',
  eyebrow: 'Listings and leads',
  title: 'Leads answered while you are at viewings.',
  subtitle:
    'Orqanix replies to listing questions, books viewings in your calendar, keeps quiet leads warm and drafts offers from your templates, showing every step.',
  pillars: [
    {
      id: 'concierge',
      icon: 'message',
      title: 'Listing answers',
      body: 'Replies to listing questions by messenger and email, using the facts in your listing files.',
      stat: 'First reply handled',
    },
    {
      id: 'viewings',
      icon: 'calendar',
      title: 'Viewing booker',
      body: 'Offers free slots from your calendar, books, reschedules and sends the confirmation.',
      stat: 'Clashes caught early',
    },
    {
      id: 'nurture',
      icon: 'clock',
      title: 'Follow-up nurture',
      body: 'Checks in with quiet leads in your tone and stops the moment they reply.',
      stat: 'Fewer lost leads',
    },
    {
      id: 'contracts',
      icon: 'document',
      title: 'Contract drafter',
      body: 'Fills your offer and disclosure templates. Your lawyer reviews before anything goes out.',
      stat: 'Drafts, not advice',
    },
  ],
  spotlights: [
    {
      id: 'listings',
      eyebrow: 'Listings',
      title: 'Every listing question gets a real answer.',
      body: 'Floor area, fees, pet policy, parking. Orqanix reads your listing files and answers from them, then offers a viewing slot while the lead is still interested.',
      bullets: [
        'Messenger, email and site form',
        'Answers from your listing files',
        'Slots offered in the reply',
        'Replies logged to your CRM',
      ],
      scene: {
        kind: 'chat',
        messages: [
          { from: 'you', text: 'Any new leads on 14 Mill Lane?' },
          {
            from: 'app',
            text: 'Three. All asked about parking and pets. I answered from the listing file.',
          },
          { from: 'you', text: 'Book whoever is free on Thursday.' },
          { from: 'app', text: 'Two booked: Thu 16:00 and 16:30. One prefers Saturday.' },
        ],
      },
    },
    {
      id: 'conversation',
      eyebrow: 'Conversation',
      title: 'Replies that sound like your best coordinator.',
      body: 'It writes in your tone about price, neighbourhood and next steps. When a question needs you, it asks you first and sends nothing until you say so.',
      bullets: [
        'Your tone, learned from examples',
        'Other languages when needed',
        'Hands over to you',
        'Full transcript kept',
      ],
      scene: {
        kind: 'inbox',
        threads: [
          {
            from: 'Lena Fischer',
            subject: 'Is the price open to offers?',
            tag: 'Marsh Lane',
            state: 'draft',
          },
          {
            from: 'Omar Haddad',
            subject: 'Which schools are nearby?',
            tag: 'Quay St',
            state: 'replied',
          },
          {
            from: 'Priya Nair',
            subject: 'Second viewing on Saturday?',
            tag: 'Mill Row',
            state: 'waiting',
          },
        ],
        draft: {
          to: 'Reply to Lena F.',
          lines: [
            'Hello Lena, the owners will look at offers this week.',
            'Would you like a second viewing first?',
          ],
        },
      },
    },
    {
      id: 'viewings',
      eyebrow: 'Viewings',
      title: 'Calendar chaos ends here.',
      body: 'Orqanix works from your live calendar, so clashes are caught before anything is booked. It confirms, reschedules, follows up after a missed visit and sends you the next day’s agenda each evening.',
      bullets: [
        'Works from your calendar',
        'Reschedules without the back-and-forth',
        'Follow-up after a missed visit',
        'Agenda every evening',
      ],
      scene: {
        kind: 'map',
        pins: [
          { x: 12, y: 72, label: '10:00 Marsh Lane', state: 'done' },
          { x: 36, y: 34, label: '11:30 Quay St', state: 'done' },
          { x: 64, y: 62, label: '13:00 Mill Row', state: 'now' },
          { x: 88, y: 18, label: '15:00 Park View', state: 'next' },
        ],
        note: 'Saturday: 4 viewings, no clashes',
      },
    },
    {
      id: 'nurture',
      eyebrow: 'Nurture',
      title: 'Quiet leads, kept warm without nagging.',
      body: 'A lead who went silent gets a short, personal check-in every so often. The moment interest returns, Orqanix tells you and offers a viewing.',
      bullets: [
        'Personal, never copy-paste',
        'Stops on reply',
        'Hot leads handed to you',
        'Pipeline stages kept current',
      ],
      scene: {
        kind: 'phone',
        title: 'Marta · quiet for 3 weeks',
        messages: [
          { from: 'app', text: 'Hi Marta, two new flats near the park came up. Want a look?' },
          { from: 'them', text: 'Yes, still looking. Saturday?' },
        ],
        actions: ['Offer Saturday 11:00', 'Ask me first'],
      },
    },
  ],
  agentsTitle: 'Agents estate teams hire first',
  agents: [
    { name: 'Listing concierge', line: 'Answers listing questions from your files' },
    { name: 'Viewing booker', line: 'Books and confirms viewings in your calendar' },
    { name: 'Follow-up agent', line: 'Keeps quiet leads warm, politely' },
    { name: 'Contract drafter', line: 'Fills offer templates for lawyer review' },
    { name: 'Lead sorter', line: 'Ranks new enquiries by how serious they look' },
    { name: 'Agenda writer', line: 'Sends the next day’s viewings every evening' },
  ],
  closing: 'Try Orqanix for your listings.',
  related: ['legal', 'freelancers', 'healthcare'],
};
