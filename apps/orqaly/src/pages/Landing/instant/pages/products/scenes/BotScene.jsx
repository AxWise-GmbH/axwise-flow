import { Bars, Icon, SceneStage, Win } from './kit';
import { useT } from '../../../i18n/useT';
import './bot.css';

/*
 * Assistant Bot: make a bot, give it a role, let it learn the business, watch it work.
 * Markup only; bot.css places the parts for each cut and moves them on the shared clock.
 * Cuts: menu (the whole story), hero (a wall of bots, one being made), role, map, contacts,
 * files, control. Labels that are only drawn (map groups, folder counts) live in the CSS:
 * bot.css for the menu and hero, bot-page.css (shipped with the page) for the rest. Their
 * words come from here, in the current language, as CSS variables (drawn).
 */

// The scene's words, in the current language (t from useT). The first three roles are the
// story's bots.
const roles = (t) => [
  t('pp.bot.scene.role.sales', 'Sales'),
  t('pp.bot.scene.role.finance', 'Finance'),
  t('pp.bot.scene.role.support', 'Support'),
];
// Two rows of six; the ninth card is the one being made.
const wall = (t) => [
  t('pp.bot.scene.role.office', 'Office'),
  t('pp.bot.scene.role.legal', 'Legal'),
  t('pp.bot.scene.role.finance', 'Finance'),
  t('pp.bot.scene.role.sales', 'Sales'),
  t('pp.bot.scene.role.research', 'Research'),
  t('pp.bot.scene.role.payroll', 'Payroll'),
  t('pp.bot.scene.role.bookings', 'Bookings'),
  t('pp.bot.scene.role.support', 'Support'),
  t('pp.bot.scene.role.marketing', 'Marketing'),
  t('pp.bot.scene.role.hiring', 'Hiring'),
  t('pp.bot.scene.role.buying', 'Buying'),
  t('pp.bot.scene.role.partners', 'Partners'),
];
// The labels the stylesheets draw (bot.css, bot-page.css), by their CSS variable.
const drawn = (t, ROLES) => ({
  '--pbo-say-team': t('pp.bot.scene.map.team', 'Team'),
  '--pbo-say-clients': t('pp.bot.scene.map.clients', 'Clients'),
  '--pbo-say-suppliers': t('pp.bot.scene.map.suppliers', 'Suppliers'),
  '--pbo-say-files': t('pp.bot.scene.map.files', 'Files'),
  '--pbo-say-bot': ROLES[1],
  '--pbo-say-new': t('pp.bot.scene.newbot.drawn', '+ New bot'),
  '--pbo-say-business': t('pp.bot.scene.map.business', 'Your business'),
  '--pbo-say-contacts': t('pp.bot.scene.contacts', 'Contacts'),
  '--pbo-say-documents': t('pp.bot.scene.folder.documents', 'Documents'),
  '--pbo-say-images': t('pp.bot.scene.folder.images', 'Images'),
  '--pbo-say-invoices': t('pp.bot.scene.folder.invoices', 'Invoices'),
  '--pbo-say-chat': t('pp.bot.scene.pane.chat', 'Chat'),
  '--pbo-say-recipe': t('pp.bot.scene.pane.recipe', 'Recipe'),
  '--pbo-say-schedule': t('pp.bot.scene.pane.schedule', 'Schedule'),
  '--pbo-say-when': t('pp.bot.scene.pane.when', 'Mon 9:00'),
});
// What each role does, three duties apiece.
const DUTIES = 'mail chat user sheet doc clock chat user tick'.split(' ');

const Bot = ({ role }) => (
  <div className="pbo-bot">
    <i className="pbo-orb" />
    <b>{role}</b>
    <Bars w={[78, 48]} />
  </div>
);

const Tile = ({ name }) => (
  <span className="pbo-tile">
    <Icon name={name} />
  </span>
);

// A file the bot made, ticked done.
const File = ({ name }) => (
  <div className="ps-file">
    <span className="ps-file-icon">
      <Icon name="doc" />
    </span>
    <span className="ps-file-name">{name}</span>
    <i className="ps-tick" />
  </div>
);

// Thin lines on a 100 x 100 grid stretched over the part; bot.css draws them in turn.
const Lines = ({ d }) => (
  <svg viewBox="0 0 100 100" preserveAspectRatio="none">
    {d.map((line, i) => (
      <path key={i} d={line} pathLength={1} />
    ))}
  </svg>
);

const cursor = <i className="pbo-cur" />;

const chips = (t, ROLES) => (
  <div className="pbo-chips" key="c">
    <span className="ps-chip pbo-new">
      <Icon name="plus" />
      {t('pp.bot.scene.newbot', 'New bot')}
    </span>
    {ROLES.map((role) => (
      <span key={role} className="ps-chip">
        {role}
      </span>
    ))}
    <i className="pbo-sel" />
  </div>
);

// The business in the middle, four groups (Team, Clients, Suppliers, Files), their leaves.
const map = (
  <div className="pbo-map" key="m">
    <Lines
      d={[
        'M50 50Q22 50 22 26',
        'M50 50Q78 50 78 26',
        'M50 50Q78 50 78 74',
        'M50 50Q22 50 22 74',
        'M5 8L22 26L4 42',
        'M95 8L78 26L96 42',
        'M95 92L78 74L96 58',
        'M5 92L22 74L4 58',
      ]}
    />
    <i className="pbo-hub" />
    {['team', 'user', 'sheet', 'folder'].map((name) => (
      <span key={name} className="pbo-node">
        <Icon name={name} />
      </span>
    ))}
    {['user', 'mail', 'doc', 'image'].map((name) => (
      <Tile key={name} name={name} />
    ))}
  </div>
);

// The cuts, in the current language: ROLES are the story's three bots.
const cuts = (t, ROLES) => ({
  menu: [
    chips(t, ROLES),
    <div className="pbo-roster" key="r">
      {ROLES.map((role) => (
        <Bot key={role} role={role} />
      ))}
    </div>,
    map,
    <Win className="pbo-mac" key="w" bar={<i className="pbo-orb" />}>
      <p className="pbo-run">
        <Icon name="spark" />
        <Bars w={[54]} />
      </p>
      <File name="Monthly report.pdf" />
      {cursor}
    </Win>,
  ],
  hero: (
    <div className="pbo-wall">
      {wall(t).map((role, k) => (
        <Bot key={k} role={role} />
      ))}
    </div>
  ),
  role: [
    chips(t, ROLES),
    <div className="pbo-flip" key="f">
      {ROLES.map((role, k) => (
        <div key={role} className="pbo-face">
          <Bot role={role} />
          {DUTIES.slice(k * 3, k * 3 + 3).map((name) => (
            <p key={name}>
              <Icon name={name} />
            </p>
          ))}
        </div>
      ))}
    </div>,
  ],
  map,
  // Mail and phone feed one list; a dot runs down each line in turn, then two rows merge.
  contacts: (
    <div className="pbo-con">
      <Tile name="mail" />
      <Tile name="phone" />
      <Lines d={['M16 30C28 30 26 44 40 44', 'M16 70C28 70 26 56 40 56']} />
      <Win className="pbo-book">
        {[...'01234'].map((i) => (
          <p key={i} className="pbo-person">
            <Bars w={[64, 38]} />
            <Icon name="mail" />
            <Icon name="phone" />
          </p>
        ))}
      </Win>
    </div>
  ),
  files: (
    <div className="pbo-files">
      {/* Documents, images and invoices, twice over. */}
      {[...'012012'].map((k, i) => (
        <Tile key={i} name={['doc', 'image', 'sheet'][k]} />
      ))}
      {[...'012'].map((i) => (
        <div key={i} className="pbo-folder">
          <b />
        </div>
      ))}
    </div>
  ),
  // Three bots take turns at the app: a chat, a recipe, a schedule, a file. Each pane has
  // its icon; the last holds the file.
  control: (
    <div className="pbo-ctl">
      {ROLES.map((role) => (
        <Bot key={role} role={role} />
      ))}
      <Win className="pbo-app" bar={<Bars w={[22]} />}>
        {['chat', 'spark', 'clock', 'folder'].map((name, i) => (
          <div key={name} className="pbo-pane">
            <Icon name={name} />
            {i < 3 ? <Bars w={[82, 58]} /> : <File name="report.pdf" />}
          </div>
        ))}
        {cursor}
      </Win>
    </div>
  ),
});

export default function BotScene(props) {
  const { t } = useT('pp');
  const ROLES = roles(t);
  const CUTS = cuts(t, ROLES);
  return (
    <SceneStage {...props} product="assistant-bot" words={drawn(t, ROLES)}>
      {CUTS[props.cut] ?? CUTS.menu}
    </SceneStage>
  );
}
