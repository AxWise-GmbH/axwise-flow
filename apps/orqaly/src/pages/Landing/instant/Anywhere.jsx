import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Reveal from './ui/Reveal';
import { OrqanixMark } from './ui/Glyphs';
import './Anywhere.css';

/*
 * "Chat from anywhere": Orqanix is the chat card in the middle, the five ways into it are
 * small device mocks around it, and messages travel the curved lines between them.
 */
const CHANNELS = [
  {
    id: 'desktop',
    name: 'Desktop App',
    line: 'The full workspace on your Mac.',
    glyph: 'laptop',
  },
  {
    id: 'messenger',
    name: 'Messenger by Choice',
    line: 'Message it in the messenger you already use.',
    glyph: 'chat',
  },
  {
    id: 'email',
    name: 'Email',
    line: 'Briefs and results in your inbox.',
    glyph: 'mail',
  },
  {
    id: 'voice',
    name: 'Voice Commands',
    line: 'Say it instead of typing it.',
    glyph: 'wave',
  },
  {
    id: 'mobile',
    name: 'Mobile Application',
    line: 'Your workspace in your pocket.',
    glyph: 'phone',
  },
];

/*
 * Two arrangements of the same scene, in units of a 1000-wide drawing: a square one, and a
 * portrait one for phones. `at` is the middle of a device; `path` runs from inside the card
 * to inside the device, so both ends stay tucked under something solid.
 */
const TALL_QUERY = '(max-width: 600px)';

const LAYOUTS = {
  wide: {
    height: 1000,
    card: [510, 520],
    spots: {
      desktop: { at: [240, 145], path: 'M400 450C400 330 250 370 250 245' },
      messenger: { at: [815, 160], path: 'M680 450C830 450 740 360 734 225' },
      email: { at: [860, 815], path: 'M640 600C640 800 700 856 810 858' },
      voice: { at: [410, 915], path: 'M450 600C450 780 410 740 410 900' },
      mobile: { at: [105, 640], path: 'M340 570C240 570 280 640 150 640' },
    },
  },
  tall: {
    height: 1400,
    card: [500, 690],
    spots: {
      desktop: { at: [262, 165], path: 'M330 600C330 440 262 450 262 285' },
      messenger: { at: [800, 190], path: 'M670 600C670 440 705 430 704 268' },
      email: { at: [185, 1105], path: 'M330 800C330 1040 440 1160 310 1160' },
      voice: { at: [530, 1325], path: 'M500 800C500 1040 530 1060 530 1300' },
      mobile: { at: [880, 1152], path: 'M670 800C670 930 880 890 880 1000' },
    },
  },
};

const GLYPHS = {
  chat: [
    'M5 5.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7l-4.5 3.5V16.5H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z',
    'M8 9.5h8',
    'M8 12.5h5',
  ],
  laptop: ['M5 15V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8', 'M2.5 18.5h19', 'M5 15h14'],
  phone: [
    'M9.5 2.5h5A2.5 2.5 0 0 1 17 5v14a2.5 2.5 0 0 1-2.5 2.5h-5A2.5 2.5 0 0 1 7 19V5a2.5 2.5 0 0 1 2.5-2.5z',
    'M10 7.5h4',
    'M10 10.5h2.5',
    'M11 18.5h2',
  ],
  mail: [
    'M5.5 5.5h13A2.5 2.5 0 0 1 21 8v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16V8a2.5 2.5 0 0 1 2.5-2.5z',
    'M3.6 7.4 12 13.2l8.4-5.8',
  ],
  wave: ['M4 10.5v3', 'M8 7.5v9', 'M12 4v16', 'M16 8v8', 'M20 10.5v3'],
  mic: [
    'M12 3.5A2.5 2.5 0 0 1 14.5 6v5a2.5 2.5 0 0 1-5 0V6A2.5 2.5 0 0 1 12 3.5Z',
    'M6.5 11a5.5 5.5 0 0 0 11 0',
    'M12 16.5V20',
    'M9 20h6',
  ],
};

// Resting heights of the waveform bars, as a share of the pill's inner height.
const BARS = [
  0.3, 0.55, 0.85, 0.5, 1, 0.7, 0.4, 0.9, 0.6, 0.35, 0.75, 0.95, 0.5, 0.8, 0.45, 0.3, 0.6, 0.25,
];

function Glyph({ name }) {
  return (
    <svg className="oia-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {GLYPHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

// A line of text that says nothing: mock content is drawn, never written.
function Ghost({ w, tone }) {
  return <i className="oia-g" data-tone={tone} style={{ '--w': w }} />;
}

function prefersReducedMotion() {
  return globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

function startsSeen() {
  return typeof IntersectionObserver === 'undefined' || prefersReducedMotion();
}

/*
 * The scroll gate: `seen` sticks once the block has really been scrolled to (the shared
 * reveal timer would otherwise play it off screen); `live` follows the viewport so every
 * looping animation can rest while nobody is looking.
 */
function useGate(threshold) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(startsSeen);
  const [live, setLive] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        setLive(entry.isIntersecting);
        if (entry.isIntersecting && entry.intersectionRatio >= threshold * 0.95) setSeen(true);
      },
      { threshold: [0, threshold], rootMargin: '0px 0px -8% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return [ref, seen, live];
}

function subscribeTall(notify) {
  const query = globalThis.window?.matchMedia?.(TALL_QUERY);
  if (!query?.addEventListener) return () => {};
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
}

function readTall() {
  return globalThis.window?.matchMedia?.(TALL_QUERY)?.matches ?? false;
}

// The scene leans toward the pointer; CSS turns --px/--py (-1 to 1) into slow transforms.
function usePointerLean(sectionRef, sceneRef) {
  useEffect(() => {
    const section = sectionRef.current;
    const scene = sceneRef.current;
    if (!section || !scene || prefersReducedMotion()) return undefined;
    let raf = 0;
    let point = null;
    const paint = () => {
      raf = 0;
      const box = section.getBoundingClientRect();
      const x = point ? ((point.x - box.left) / box.width) * 2 - 1 : 0;
      const y = point ? ((point.y - box.top) / box.height) * 2 - 1 : 0;
      scene.style.setProperty('--px', x.toFixed(3));
      scene.style.setProperty('--py', y.toFixed(3));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onMove = (event) => {
      if (event.pointerType !== 'mouse') return;
      point = { x: event.clientX, y: event.clientY };
      schedule();
    };
    const onLeave = () => {
      point = null;
      schedule();
    };
    section.addEventListener('pointermove', onMove, { passive: true });
    section.addEventListener('pointerleave', onLeave);
    return () => {
      section.removeEventListener('pointermove', onMove);
      section.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [sectionRef, sceneRef]);
}

function Row({ channel, index, pinned, active, onPin, onPreview }) {
  return (
    <li className="oia-item" style={{ '--i': index }}>
      <button
        type="button"
        className="oia-row"
        aria-pressed={pinned}
        data-active={active}
        onClick={() => onPin(channel.id)}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') onPreview(channel.id);
        }}
        onPointerLeave={() => onPreview(null)}
        onFocus={() => onPreview(channel.id)}
        onBlur={() => onPreview(null)}
      >
        <span className="oia-tile">
          <Glyph name={channel.glyph} />
        </span>
        <span className="oia-row-text">
          <span className="oia-row-name">{channel.name}</span>
          <span className="oia-row-line">{channel.line}</span>
        </span>
        <span className="oia-row-rule" aria-hidden="true">
          <i />
        </span>
      </button>
    </li>
  );
}

/* Device mocks ------------------------------------------------------------------ */

function LaptopMock() {
  return (
    <div className="oia-laptop">
      <div className="oia-laptop-screen oia-glass oia-rim">
        <div className="oia-laptop-ui oia-ink">
          <div className="oia-laptop-side">
            <span className="oia-lights">
              <i />
              <i />
              <i />
            </span>
            <span className="oia-brand">
              <OrqanixMark className="oia-mark" />
              <Ghost w="54%" tone="ink" />
            </span>
            <Ghost w="100%" tone="pill" />
            <Ghost w="64%" />
            <Ghost w="78%" />
            <Ghost w="50%" />
          </div>
          <div className="oia-laptop-main">
            <span className="oia-said">
              <Ghost w="100%" tone="ink" />
            </span>
            <Ghost w="84%" />
            <Ghost w="58%" />
            <span className="oia-laptop-panel">
              <Ghost w="44%" tone="ink" />
              <span className="oia-laptop-opts">
                <i />
                <i />
              </span>
            </span>
            <span className="oia-laptop-ask">
              <i />
            </span>
          </div>
        </div>
      </div>
      <div className="oia-laptop-base" />
    </div>
  );
}

function MessengerMock() {
  return (
    <div className="oia-msgr">
      <div className="oia-msgr-row">
        <span className="oia-avatar oia-glass">
          <OrqanixMark className="oia-mark" />
        </span>
        <span className="oia-bubble oia-glass oia-rim">
          <span className="oia-ink">
            <Ghost w="100%" />
            <Ghost w="62%" />
          </span>
        </span>
      </div>
      <div className="oia-msgr-row" data-side="out">
        <span className="oia-bubble oia-bubble-out oia-rim">
          <span className="oia-ink">
            <Ghost w="100%" tone="ink" />
            <Ghost w="48%" tone="ink" />
          </span>
        </span>
      </div>
      <div className="oia-msgr-row">
        <span className="oia-avatar oia-glass">
          <OrqanixMark className="oia-mark" />
        </span>
        <span className="oia-bubble oia-bubble-typing oia-glass oia-rim">
          <i />
          <i />
          <i />
        </span>
      </div>
    </div>
  );
}

function MailMock() {
  return (
    <div className="oia-mail">
      <div className="oia-mail-back oia-glass oia-rim" />
      <div className="oia-mail-letter">
        <span className="oia-ink">
          <Ghost w="58%" tone="ink" />
          <Ghost w="100%" />
          <Ghost w="86%" />
          <Ghost w="92%" />
        </span>
      </div>
      <div className="oia-mail-front">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d="M0 100 39 41M100 100 61 41" />
          <path className="oia-mail-fold" d="M0 1.5 50 53.5 100 1.5" />
        </svg>
      </div>
    </div>
  );
}

function VoiceMock() {
  return (
    <div className="oia-voice oia-glass oia-rim">
      <span className="oia-voice-mic">
        <Glyph name="mic" />
      </span>
      <span className="oia-voice-bars oia-ink">
        {BARS.map((height, index) => (
          <i
            // The bars never reorder, so their position is their identity.
            key={index}
            style={{
              '--h': height,
              '--t': `${720 + ((index * 137) % 560)}ms`,
              '--dl': `-${(index * 211) % 900}ms`,
            }}
          />
        ))}
      </span>
    </div>
  );
}

function PhoneMock() {
  return (
    <div className="oia-phone oia-glass oia-rim">
      <div className="oia-phone-screen">
        <i className="oia-phone-island" />
        <div className="oia-phone-chat oia-ink">
          <span className="oia-phone-in">
            <Ghost w="100%" />
            <Ghost w="60%" />
          </span>
          <span className="oia-phone-out">
            <Ghost w="100%" tone="ink" />
          </span>
          <span className="oia-phone-in">
            <Ghost w="100%" />
            <Ghost w="76%" />
            <Ghost w="42%" />
          </span>
          <span className="oia-phone-ask">
            <i />
          </span>
        </div>
        <div className="oia-phone-chip">
          <span className="oia-phone-chip-mark">
            <OrqanixMark className="oia-mark" />
          </span>
          <span className="oia-phone-chip-text">
            <Ghost w="70%" tone="ink" />
            <Ghost w="100%" />
          </span>
        </div>
      </div>
    </div>
  );
}

const MOCKS = {
  desktop: LaptopMock,
  messenger: MessengerMock,
  email: MailMock,
  voice: VoiceMock,
  mobile: PhoneMock,
};

function percent(value, of) {
  return `${((value / of) * 100).toFixed(2)}%`;
}

function Device({ channel, index, layout, active, onPin, onPreview }) {
  const Mock = MOCKS[channel.id];
  const [x, y] = layout.spots[channel.id].at;
  return (
    <div
      className="oia-dev"
      data-channel={channel.id}
      data-active={active}
      style={{ '--x': percent(x, 1000), '--y': percent(y, layout.height), '--n': index }}
      onClick={() => onPin(channel.id)}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') onPreview(channel.id);
      }}
      onPointerLeave={() => onPreview(null)}
    >
      <div className="oia-dev-pop">
        <div className="oia-dev-bob">
          <Mock />
        </div>
      </div>
    </div>
  );
}

function Link({ channel, index, layout, active }) {
  const d = layout.spots[channel.id].path;
  // Re-keyed so the line fires a fresh message the moment its channel is picked.
  const beat = active ? 'live' : 'idle';
  return (
    <g className="oia-link" data-channel={channel.id} data-active={active} style={{ '--n': index }}>
      <path className="oia-link-base" d={d} pathLength="100" />
      <path className="oia-link-halo" d={d} pathLength="100" />
      <path className="oia-link-lit" d={d} pathLength="100" />
      <path key={`in-${beat}`} className="oia-packet oia-packet-in" d={d} pathLength="100" />
      <path key={`out-${beat}`} className="oia-packet oia-packet-out" d={d} pathLength="100" />
    </g>
  );
}

// Orqanix itself: a small chat window. Its newest line answers whichever channel is active.
function ChatCard({ layout, channel }) {
  const [x, y] = layout.card;
  return (
    <div
      className="oia-card"
      style={{ '--cx': percent(x, 1000), '--cy': percent(y, layout.height) }}
    >
      <div className="oia-card-rise">
        <div className="oia-card-glass oia-glass">
          <div className="oia-card-bar">
            <span className="oia-lights">
              <i />
              <i />
              <i />
            </span>
            <span className="oia-brand">
              <OrqanixMark className="oia-mark" />
              <span className="oia-card-name">Orqanix</span>
            </span>
          </div>
          <div className="oia-card-feed">
            <span className="oia-said">
              <Ghost w="100%" tone="ink" />
              <Ghost w="58%" tone="ink" />
            </span>
            <Ghost w="76%" />
            <Ghost w="52%" />
            <div key={channel.id} className="oia-card-reply" data-channel={channel.id}>
              <span className="oia-card-via">
                <Glyph name={channel.glyph} />
              </span>
              <span className="oia-card-reply-text">
                <Ghost w="88%" tone="accent" />
                <Ghost w="54%" />
              </span>
            </div>
          </div>
          <div className="oia-card-ask">
            <i className="oia-caret" />
            <span className="oia-card-placeholder">Ask whatever&rsquo;s on your mind.</span>
            <span className="oia-card-mic">
              <Glyph name="mic" />
            </span>
          </div>
          <i className="oia-card-sheen" />
          <i key={channel.id} className="oia-card-flash" />
        </div>
      </div>
    </div>
  );
}

export default function Anywhere() {
  const sceneRef = useRef(null);
  const [sectionRef, seen, live] = useGate(0.2);
  const tall = useSyncExternalStore(subscribeTall, readTall, () => false);
  const [pinned, setPinned] = useState(CHANNELS[0].id);
  const [preview, setPreview] = useState(null);
  usePointerLean(sectionRef, sceneRef);

  const layout = tall ? LAYOUTS.tall : LAYOUTS.wide;
  const activeId = preview ?? pinned;
  const activeChannel = CHANNELS.find((channel) => channel.id === activeId);

  return (
    <section
      ref={sectionRef}
      id="anywhere"
      className="oi-section oia"
      aria-labelledby="anywhere-heading"
      data-seen={seen}
      data-live={live}
    >
      <div className="oi-container oia-grid">
        <header className="oia-head">
          <Reveal as="p" className="oi-tag oi-tag-bracket">
            Connectivity
          </Reveal>
          <Reveal as="h2" id="anywhere-heading" className="oi-h2 oia-title" delay={90}>
            <span className="oia-title-line">Chat from</span>{' '}
            <span className="oia-title-line oia-title-glow">anywhere.</span>
          </Reveal>
          <Reveal as="p" className="oi-line oia-lede" delay={180}>
            Reach Orqanix from where you already are.
          </Reveal>
        </header>

        <div
          ref={sceneRef}
          className="oia-scene"
          aria-hidden="true"
          data-layout={tall ? 'tall' : 'wide'}
        >
          <div className="oia-stage">
            <div className="oia-glow" />
            <div className="oia-dots" />
            <svg
              className="oia-lines"
              viewBox={`0 0 1000 ${layout.height}`}
              aria-hidden="true"
              focusable="false"
            >
              {CHANNELS.map((channel, index) => (
                <Link
                  key={channel.id}
                  channel={channel}
                  index={index}
                  layout={layout}
                  active={activeId === channel.id}
                />
              ))}
            </svg>
            {CHANNELS.map((channel, index) => (
              <Device
                key={channel.id}
                channel={channel}
                index={index}
                layout={layout}
                active={activeId === channel.id}
                onPin={setPinned}
                onPreview={setPreview}
              />
            ))}
            <ChatCard layout={layout} channel={activeChannel} />
          </div>
        </div>

        <ul className="oia-list" aria-label="Channels">
          {CHANNELS.map((channel, index) => (
            <Row
              key={channel.id}
              index={index}
              channel={channel}
              pinned={pinned === channel.id}
              active={activeId === channel.id}
              onPin={setPinned}
              onPreview={setPreview}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}
