/**
 * The green brand panel beside the auth forms.
 *
 * Markup and artwork are the vanilla pages' own — the logo mark, the mountain
 * and tent illustration, the feature list and the rotating quote deck are
 * copied from frontend/login.html rather than redrawn, so the two versions
 * cannot drift apart while both are live.
 *
 * Hidden below 880px by CSS, where the form takes the full width and a compact
 * logo appears inside the pane instead.
 */

import { useEffect, useRef, useState } from 'react';

/** The deck from frontend/login.html, in its original order. */
const QUOTES: ReadonlyArray<{ text: string; author: string }> = [
  { text: 'The mountains are calling, and I must go.', author: 'John Muir' },
  { text: 'Not all those who wander are lost.', author: 'J.R.R. Tolkien' },
  { text: 'Of all the paths you take in life, make sure a few of them are dirt.', author: 'John Muir' },
  { text: 'It’s not the mountain we conquer, but ourselves.', author: 'Edmund Hillary' },
  { text: 'Climb the mountain so you can see the world, not so the world can see you.', author: 'David McCullough Jr.' },
  { text: 'In every walk with nature, one receives far more than he seeks.', author: 'John Muir' },
  { text: 'The clearest way into the Universe is through a forest wilderness.', author: 'John Muir' },
  { text: 'Wilderness is not a luxury but a necessity of the human spirit.', author: 'Edward Abbey' },
  { text: 'Look deep into nature, and then you will understand everything better.', author: 'Albert Einstein' },
  {
    text: 'Earth and sky, woods and fields, lakes and rivers — the love of all these is a love for life.',
    author: 'Havelock Ellis',
  },
];

const ROTATE_MS = 5000;
const FADE_MS = 400;

const FEATURES = [
  'Plan trips by terrain & season',
  'Build smart packing checklists',
  'Track group packing in real time',
] as const;

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="4 12 10 18 20 6" />
    </svg>
  );
}

export function BrandPanel() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  // Rotation is decorative. Anyone who has asked for reduced motion gets the
  // first quote and no timers at all — a fade that repeats every five seconds
  // is exactly the kind of movement that setting is for.
  const reducedMotion = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (reducedMotion.current) return;

    let fadeTimer: ReturnType<typeof setTimeout>;
    const interval = setInterval(() => {
      setVisible(false);
      fadeTimer = setTimeout(() => {
        setIndex((i) => (i + 1) % QUOTES.length);
        setVisible(true);
      }, FADE_MS);
    }, ROTATE_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(fadeTimer);
    };
  }, []);

  const quote = QUOTES[index] ?? QUOTES[0]!;

  return (
    <aside className="brand" aria-label="TrailPack brand">
      <div className="brand__inner">
        <div className="brand__logo">
          <span className="brand__logo-mark" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M3 20L9 9L13 15L16 11L21 20H3Z"
                fill="#ffffff"
                stroke="#ffffff"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="brand__logo-text">TrailPack</span>
        </div>

        {/* aria-hidden: the quote changes on a timer, and a live region here
            would interrupt a screen-reader user every five seconds to read
            decoration. The page's real content is the form. */}
        <p className="brand__quote" style={{ opacity: visible ? 1 : 0 }} aria-hidden="true">
          &ldquo;{quote.text}&rdquo;
        </p>
        <p className="brand__quote-attr" style={{ opacity: visible ? 1 : 0 }} aria-hidden="true">
          — {quote.author}
        </p>

        <ul className="brand__features">
          {FEATURES.map((feature) => (
            <li key={feature}>
              <CheckIcon />
              {feature}
            </li>
          ))}
        </ul>
      </div>

      {/* Mountains + tent, anchored to the bottom. Paths copied verbatim. */}
      <svg
        className="brand__art"
        viewBox="0 0 800 220"
        preserveAspectRatio="xMidYMax slice"
        aria-hidden="true"
        focusable="false"
      >
        {/* Back range */}
        <path
          d="M0,220 L0,150 L120,90 L230,140 L340,70 L470,140 L600,80 L720,140 L800,110 L800,220 Z"
          fill="#52b788"
          opacity="0.45"
        />
        {/* Mid range */}
        <path
          d="M0,220 L0,180 L100,130 L210,170 L330,110 L470,170 L600,120 L730,170 L800,150 L800,220 Z"
          fill="#40916c"
          opacity="0.75"
        />
        {/* Front peak */}
        <path d="M260,220 L380,90 L460,160 L520,120 L600,220 Z" fill="#1b4332" opacity="0.95" />
        {/* Snow cap */}
        <path d="M360,118 L380,90 L400,118 L390,124 L378,116 Z" fill="#ffffff" opacity="0.85" />

        {/* Tent, tucked at the base of the front peak */}
        <g transform="translate(150,170)">
          <path d="M0,40 L22,0 L44,40 Z" fill="#ffffff" opacity="0.92" />
          <path d="M22,0 L22,40" stroke="#1b4332" strokeWidth="1.5" opacity="0.6" />
          <path d="M14,40 L22,22 L30,40 Z" fill="#1b4332" opacity="0.55" />
        </g>

        {/* Ground line */}
        <rect x="0" y="218" width="800" height="2" fill="#0f3026" opacity="0.45" />
      </svg>
    </aside>
  );
}

/** The compact mark shown inside the form pane on mobile. */
export function PaneMobileLogo() {
  return (
    <div className="pane__mobile-logo">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path
          d="M3 20L9 9L13 15L16 11L21 20H3Z"
          fill="#2d6a4f"
          stroke="#2d6a4f"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
      <span className="pane__mobile-logo-text">TrailPack</span>
    </div>
  );
}
