import { useMemo } from "react";
import { MIRROR_PRESETS, presetToPoints } from "../data/presetShapes";
import { boundingBox, buildSmoothClosedPath } from "../model/geometry";
import { PRESET_COUNT } from "../components/PresetPicker";
import "../landing.css";

interface Props {
  onLaunch: () => void;
  hasSavedWork: boolean;
}

/**
 * Marketing landing page. Semantic, crawlable, and self-contained (no external
 * fonts/assets). The hero renders the real mirror silhouette as a "shop
 * drawing" — silver form, warm backlight, cm ruler — the page's signature.
 */
export function Landing({ onLaunch, hasSavedWork }: Props) {
  const hero = useMemo(() => {
    const pts = presetToPoints(MIRROR_PRESETS[0]); // the "Wave" shape
    const bb = boundingBox(pts);
    return {
      d: buildSmoothClosedPath(pts),
      viewBox: `${bb.minX - 8} ${bb.minY - 8} ${bb.width + 16} ${bb.height + 16}`,
    };
  }, []);

  return (
    <div className="landing">
      <header className="landing-nav">
        <span className="wordmark">
          <span className="glyph" aria-hidden="true" />
          <span className="serif">Mirror Wall Studio</span>
        </span>
        <span className="spacer" />
        <button className="btn btn-amber" onClick={onLaunch}>
          {hasSavedWork ? "Resume your design" : "Start designing"}
        </button>
      </header>

      <main>
        {/* ---------- HERO ---------- */}
        <section className="hero" aria-labelledby="hero-title">
          <div className="reveal">
            <p className="eyebrow mono">Custom mirror · 1:1 paper template</p>
            <h1 className="serif" id="hero-title">
              Design the mirror.<br />
              Print the <span className="em">exact shape.</span>
            </h1>
            <p className="lead">
              Shape an organic mirror right on a photo of your wall, then export a
              full-size cutting template across ordinary printer paper. Tape the
              sheets, trace the line, cut the glass — at true 1:1 scale.
            </p>
            <div className="cta-row">
              <button className="btn btn-amber" onClick={onLaunch}>
                {hasSavedWork ? "Resume your design →" : "Start designing →"}
              </button>
              <span className="cta-note">Free · runs in your browser · nothing to install</span>
            </div>
          </div>

          <figure className="hero-figure reveal" aria-label="Shop drawing of a custom wavy mirror with a backlit edge">
            <div className="ruler mono" aria-hidden="true">
              <span>0</span><span>40</span><span>80</span><span>120</span><span>173 cm</span>
            </div>
            <svg className="plate" viewBox={hero.viewBox} preserveAspectRatio="xMidYMid meet" role="img">
              <defs>
                <linearGradient id="lp-silver" x1="0" y1="0" x2="0.85" y2="1">
                  <stop offset="0%" stopColor="#8a97a6" />
                  <stop offset="18%" stopColor="#c3ccd6" />
                  <stop offset="34%" stopColor="#7f8c9c" />
                  <stop offset="50%" stopColor="#f7fbff" />
                  <stop offset="66%" stopColor="#9aa6b4" />
                  <stop offset="100%" stopColor="#6c7887" />
                </linearGradient>
                <filter id="lp-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#ffcf66" floodOpacity="0.9" />
                </filter>
              </defs>
              <path d={hero.d} fill="url(#lp-silver)" stroke="#5c6673" strokeWidth="0.5"
                    filter="url(#lp-glow)" vectorEffect="non-scaling-stroke" />
            </svg>
            <figcaption className="mono">wave · 68 × 173 cm</figcaption>
          </figure>
        </section>

        {/* ---------- STORY: template ↔ installed mirror, one composition ---------- */}
        <section aria-labelledby="story-title">
          <p className="section-eyebrow mono">Paper today, mirror tomorrow</p>
          <h2 className="section-title serif" id="story-title">The template becomes the mirror</h2>
          <p className="section-intro">
            One organic shape, two forms of the same 64&nbsp;×&nbsp;163&nbsp;cm outline:
            the sheets you print and tape, and the finished mirror on the wall.
          </p>

          {/* the "single jelly": paper template and installed mirror share one frame,
              joined by a live cm rule, with the shape flowing between them. */}
          <div className="diptych">
            <figure className="diptych-paper">
              <img
                src={`${import.meta.env.BASE_URL}printed-grid.png`}
                alt="Printed sheets taped together into a full-size 64 by 163 cm cutting outline, with page labels, dashed overlap lines and a 10 cm ruler"
                loading="lazy"
              />
              <figcaption className="mono">printed · 3 × 5 sheets · 1:1</figcaption>
            </figure>

            <div className="diptych-arrow" aria-hidden="true">
              <span className="rule mono">64 × 163 cm</span>
              <span className="arrow">→</span>
            </div>

            <figure className="diptych-room">
              <img
                src={`${import.meta.env.BASE_URL}final.jpg`}
                alt="The finished organic mirror installed on the bedroom wall"
                loading="lazy"
              />
              <figcaption className="mono">installed · on your wall</figcaption>
            </figure>
          </div>

          {/* supporting before / during strip */}
          <div className="ministrip">
            <figure>
              <img
                src={`${import.meta.env.BASE_URL}wall.jpeg`}
                alt="The bare wall before the mirror"
                loading="lazy"
              />
              <figcaption><b>Before</b></figcaption>
            </figure>
            <figure>
              <img
                src={`${import.meta.env.BASE_URL}editing.png`}
                alt="Designing the mirror on the calibrated wall"
                loading="lazy"
              />
              <figcaption><b>Designing</b></figcaption>
            </figure>
            <figure className="ministrip-final">
              <img
                src={`${import.meta.env.BASE_URL}final.jpg`}
                alt="The finished mirror"
                loading="lazy"
              />
              <figcaption><b>After</b></figcaption>
            </figure>
          </div>
        </section>

        {/* ---------- FEATURES ---------- */}
        <section aria-labelledby="feat-title">
          <p className="section-eyebrow mono">What's inside</p>
          <h2 className="section-title serif" id="feat-title">Built for an exact result</h2>
          <div className="features">
            <article className="feature">
              <span className="fx" aria-hidden="true">📐</span>
              <h3 className="serif">True 1:1 export</h3>
              <p>Every sheet carries registration marks, overlap guides and a 10 cm ruler so you can confirm the scale before you cut.</p>
            </article>
            <article className="feature">
              <span className="fx" aria-hidden="true">🪞</span>
              <h3 className="serif">{PRESET_COUNT} shape templates</h3>
              <p>Organic waves, pebbles, pills and more — or draw your own by dragging smooth control points.</p>
            </article>
            <article className="feature">
              <span className="fx" aria-hidden="true">🧭</span>
              <h3 className="serif">Perspective calibration</h3>
              <p>Your angled wall photo is straightened to head-on, so the mirror you place is the mirror you get.</p>
            </article>
            <article className="feature">
              <span className="fx" aria-hidden="true">🖨️</span>
              <h3 className="serif">Any paper size</h3>
              <p>Tile across A4, Letter, A3, Legal or A2 — the page count updates live as you choose.</p>
            </article>
            <article className="feature">
              <span className="fx" aria-hidden="true">👁️</span>
              <h3 className="serif">In-room preview</h3>
              <p>See the finished mirror on your wall with its warm backlit glow, then download the image to share.</p>
            </article>
            <article className="feature">
              <span className="fx" aria-hidden="true">💾</span>
              <h3 className="serif">Your work is kept</h3>
              <p>Photo, calibration and shape are saved in your browser — come back any time and pick up where you left off.</p>
            </article>
          </div>
        </section>

        {/* ---------- HOW IT WORKS (a real 4-step sequence) — placed lower ---------- */}
        <section aria-labelledby="how-title">
          <p className="section-eyebrow mono">How it works</p>
          <h2 className="section-title serif" id="how-title">Four steps to a mirror that fits your wall</h2>
          <p className="section-intro">
            The whole thing is grounded in real centimeters, so what you print is
            what you cut — no guesswork, no scaling surprises.
          </p>
          <ol className="steps">
            <li className="step">
              <span className="num serif">1</span>
              <div>
                <h3 className="serif">Photograph the wall</h3>
                <p>Snap the spot where the mirror will hang. Any phone photo works.</p>
              </div>
            </li>
            <li className="step">
              <span className="num serif">2</span>
              <div>
                <h3 className="serif">Calibrate the scale</h3>
                <p>Mark a rectangle you know the real size of and type it in centimeters. The photo is straightened to a head-on view at true scale.</p>
              </div>
            </li>
            <li className="step">
              <span className="num serif">3</span>
              <div>
                <h3 className="serif">Design the shape</h3>
                <p>Start from {PRESET_COUNT} templates, then drag the curve, move and scale it until it sits exactly right on your wall.</p>
              </div>
            </li>
            <li className="step">
              <span className="num serif">4</span>
              <div>
                <h3 className="serif">Print at 1:1</h3>
                <p>Export a full-size PDF tiled across A4, A3 or Letter. Print at 100%, tape the sheets, trace the outline.</p>
              </div>
            </li>
          </ol>
        </section>

        {/* ---------- CLOSING CTA ---------- */}
        <section>
          <div className="closing reveal">
            <h2 className="serif">Ready to fit a mirror to your wall?</h2>
            <p>Design it in minutes and walk away with a template you can cut to.</p>
            <button className="btn btn-amber" onClick={onLaunch}>
              {hasSavedWork ? "Resume your design →" : "Start designing →"}
            </button>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <span className="serif">Mirror Wall Studio</span>
        <span className="spacer" />
        <span className="mono">1 unit = 1 cm · print at 100%</span>
      </footer>
    </div>
  );
}
