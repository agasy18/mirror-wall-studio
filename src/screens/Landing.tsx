import { useMemo } from "react";
import { Trans, useTranslation } from "react-i18next";
import { MIRROR_PRESETS, presetToPoints } from "../data/presetShapes";
import { boundingBox, buildSmoothClosedPath } from "../model/geometry";
import { PRESET_COUNT } from "../components/PresetPicker";
import { LanguagePicker } from "../components/LanguagePicker";
import { APP_NAME } from "../model/brand";
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
  const { t } = useTranslation();
  const cta = hasSavedWork ? t("cta.resume") : t("cta.start");

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
          <span className="serif">{APP_NAME}</span>
        </span>
        <span className="spacer" />
        <LanguagePicker />
        <button className="btn btn-amber" onClick={onLaunch}>
          {cta}
        </button>
      </header>

      <main>
        {/* ---------- HERO ---------- */}
        <section className="hero" aria-labelledby="hero-title">
          <div className="reveal">
            <p className="eyebrow mono">{t("landing.hero.eyebrow")}</p>
            <h1 className="serif" id="hero-title">
              <Trans
                i18nKey="landing.hero.title"
                components={{ br: <br />, em: <span className="em" /> }}
              />
            </h1>
            <p className="lead">{t("landing.hero.lead")}</p>
            <div className="cta-row">
              <button className="btn btn-amber" onClick={onLaunch}>
                {cta} <span className="btn-arrow" aria-hidden="true">→</span>
              </button>
              <span className="cta-note">{t("landing.hero.ctaNote")}</span>
            </div>
          </div>

          <figure className="hero-figure reveal" aria-label={t("landing.hero.figureAlt")}>
            <div className="ruler mono" aria-hidden="true">
              <span>0</span><span>40</span><span>80</span><span>120</span>
              <span>{t("landing.hero.rulerEnd")}</span>
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
            <figcaption className="mono">{t("landing.hero.caption")}</figcaption>
          </figure>
        </section>

        {/* ---------- STORY: template ↔ installed mirror, one composition ---------- */}
        <section aria-labelledby="story-title">
          <p className="section-eyebrow mono">{t("landing.story.eyebrow")}</p>
          <h2 className="section-title serif" id="story-title">{t("landing.story.title")}</h2>
          <p className="section-intro">{t("landing.story.intro")}</p>

          {/* the "single jelly": paper template and installed mirror share one frame,
              joined by a live cm rule, with the shape flowing between them. */}
          <div className="diptych">
            <figure className="diptych-paper">
              <img
                src={`${import.meta.env.BASE_URL}printed-grid.webp`}
                alt={t("landing.story.paperAlt")}
                width={800}
                height={1937}
                loading="lazy"
              />
              <figcaption className="mono">{t("landing.story.paperCaption")}</figcaption>
            </figure>

            <div className="diptych-arrow" aria-hidden="true">
              <span className="rule mono">{t("landing.story.rule")}</span>
              <span className="arrow">→</span>
            </div>

            <figure className="diptych-room">
              <img
                src={`${import.meta.env.BASE_URL}final.webp`}
                alt={t("landing.story.roomAlt")}
                width={1000}
                height={1446}
                loading="lazy"
              />
              <figcaption className="mono">{t("landing.story.roomCaption")}</figcaption>
            </figure>
          </div>

          {/* supporting before / during strip */}
          <div className="ministrip">
            <figure>
              <img
                src={`${import.meta.env.BASE_URL}wall.webp`}
                alt={t("landing.story.beforeAlt")}
                width={893}
                height={1280}
                loading="lazy"
              />
              <figcaption><b>{t("landing.story.before")}</b></figcaption>
            </figure>
            <figure>
              <img
                src={`${import.meta.env.BASE_URL}editing.webp`}
                alt={t("landing.story.designingAlt")}
                width={900}
                height={1292}
                loading="lazy"
              />
              <figcaption><b>{t("landing.story.designing")}</b></figcaption>
            </figure>
            <figure className="ministrip-final">
              <img
                src={`${import.meta.env.BASE_URL}final.webp`}
                alt={t("landing.story.afterAlt")}
                width={1000}
                height={1446}
                loading="lazy"
              />
              <figcaption><b>{t("landing.story.after")}</b></figcaption>
            </figure>
          </div>
        </section>

        {/* ---------- FEATURES ---------- */}
        <section aria-labelledby="feat-title">
          <p className="section-eyebrow mono">{t("landing.features.eyebrow")}</p>
          <h2 className="section-title serif" id="feat-title">{t("landing.features.title")}</h2>
          <div className="features">
            <article className="feature">
              <span className="fx" aria-hidden="true">📐</span>
              <h3 className="serif">{t("landing.features.exact.title")}</h3>
              <p>{t("landing.features.exact.body")}</p>
            </article>
            <article className="feature">
              <span className="fx" aria-hidden="true">🪞</span>
              <h3 className="serif">{t("landing.features.templates.title", { count: PRESET_COUNT })}</h3>
              <p>{t("landing.features.templates.body")}</p>
            </article>
            <article className="feature">
              <span className="fx" aria-hidden="true">🧭</span>
              <h3 className="serif">{t("landing.features.perspective.title")}</h3>
              <p>{t("landing.features.perspective.body")}</p>
            </article>
            <article className="feature">
              <span className="fx" aria-hidden="true">🖨️</span>
              <h3 className="serif">{t("landing.features.paper.title")}</h3>
              <p>{t("landing.features.paper.body")}</p>
            </article>
            <article className="feature">
              <span className="fx" aria-hidden="true">👁️</span>
              <h3 className="serif">{t("landing.features.preview.title")}</h3>
              <p>{t("landing.features.preview.body")}</p>
            </article>
            <article className="feature">
              <span className="fx" aria-hidden="true">💾</span>
              <h3 className="serif">{t("landing.features.saved.title")}</h3>
              <p>{t("landing.features.saved.body")}</p>
            </article>
          </div>
        </section>

        {/* ---------- HOW IT WORKS (a real 4-step sequence) — placed lower ---------- */}
        <section aria-labelledby="how-title">
          <p className="section-eyebrow mono">{t("landing.how.eyebrow")}</p>
          <h2 className="section-title serif" id="how-title">{t("landing.how.title")}</h2>
          <p className="section-intro">{t("landing.how.intro")}</p>
          <ol className="steps">
            {(["s1", "s2", "s3", "s4"] as const).map((s, i) => (
              <li className="step" key={s}>
                <span className="num serif">{i + 1}</span>
                <div>
                  <h3 className="serif">{t(`landing.how.${s}.title`)}</h3>
                  <p>{t(`landing.how.${s}.body`, { count: PRESET_COUNT })}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------- FAQ ---------- */}
        <section aria-labelledby="faq-title">
          <p className="section-eyebrow mono">{t("landing.faq.eyebrow")}</p>
          <h2 className="section-title serif" id="faq-title">{t("landing.faq.title")}</h2>
          <div className="faq">
            {(["q1", "q2", "q3", "q4", "q5"] as const).map((q) => (
              <article className="faq-item" key={q}>
                <h3 className="serif">{t(`landing.faq.${q}.q`)}</h3>
                <p>{t(`landing.faq.${q}.a`, { count: PRESET_COUNT })}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ---------- CLOSING CTA ---------- */}
        <section aria-labelledby="closing-title">
          <div className="closing reveal">
            <h2 className="serif" id="closing-title">{t("landing.closing.title")}</h2>
            <p>{t("landing.closing.body")}</p>
            <button className="btn btn-amber" onClick={onLaunch}>
              {cta} <span className="btn-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <span className="serif">{APP_NAME}</span>
        <span className="spacer" />
        <span className="mono">{t("landing.footer.note")}</span>
      </footer>
    </div>
  );
}
