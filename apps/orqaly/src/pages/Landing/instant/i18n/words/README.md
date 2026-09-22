Keys that are built at run time (from a data file: `t(\`faq.${id}.q\`, item.question)`) cannot
be found by the source scan in `../i18n.test.js`. Each group lists them here, one module per
group: `export default function words() { return { 'faq.cost.q': 'What does it cost?', … } }`,
built from the same data and the same key helper the component uses. Only the test imports these.
