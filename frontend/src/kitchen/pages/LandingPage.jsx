import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import lunchfyIcon from "../../assets/brand/Lunchfy_icon.png";
import lunchfyLogo from "../../assets/brand/Lunchfy_logo1.png";
import "../landing.css";

// ── Data ──────────────────────────────────────────────────────────────────────

const PLANS = [
  {
    id: "basic",
    name: "Basic",
    price: "Gratis",
    tagline: "Lo esencial para organizar tu semana.",
    features: [
      "Planificación semanal completa",
      "Lista de la compra automática",
      "Randomizar platos por día",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "4,99€",
    priceSuffix: "/mes",
    tagline: "La opción recomendada para familias activas.",
    recommended: true,
    features: [
      "Todo lo de Basic",
      "Randomizar la semana completa",
      "Presupuesto y control de gasto",
      "Filtro de dieta en randomización",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    price: "8,99€",
    priceSuffix: "/mes",
    tagline: "Para hogares que quieren el máximo y soporte ampliado.",
    features: [
      "Todo lo de Pro",
      "Usuarios y comensales ilimitados",
      "Acceso prioritario a novedades",
      "Soporte beta ampliado",
    ],
  },
];

const FEATURES = [
  {
    icon: "calendar",
    color: "brand",
    title: "Planificación semanal",
    desc: "Organiza comidas y cenas de toda la semana de un vistazo. Rellena los huecos en segundos.",
  },
  {
    icon: "cook",
    color: "green",
    title: "Recetas y cocina",
    desc: "Guarda tus platos favoritos con ingredientes, pasos y modo de cocción guiado paso a paso.",
  },
  {
    icon: "cart",
    color: "amber",
    title: "Lista de la compra",
    desc: "Se genera sola desde tu planificación. Sin duplicados, sin olvidos, lista para compartir.",
  },
  {
    icon: "stack",
    color: "brand",
    title: "Catálogos y packs",
    desc: "Colecciones curadas por dieta, temporada o cocina. Impórtalas enteras con un clic.",
  },
  {
    icon: "users",
    color: "green",
    title: "Uso familiar",
    desc: "Comparte tu hogar con tu pareja o familia. Todos ven el mismo menú, actualizado al instante.",
  },
  {
    icon: "trophy",
    color: "amber",
    title: "Retos y recompensas",
    desc: "Completa desafíos semanales, sube de nivel y desbloquea mejoras y funciones exclusivas.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Planifica tu semana",
    desc: "Asigna platos a cada comida o deja que Lunchfy proponga el menú entero.",
  },
  {
    n: "2",
    title: "Genera la lista",
    desc: "La compra se crea sola desde tu menú. Marca lo que ya tienes en casa.",
  },
  {
    n: "3",
    title: "Cocina y comparte",
    desc: "Sigue las recetas paso a paso. Toda la familia ve el mismo menú actualizado.",
  },
];

const FAQ = [
  {
    q: "¿Cómo instalo la app en mi móvil?",
    a: 'Abre Lunchfy en tu navegador, pulsa «Compartir» y «Añadir a pantalla de inicio». Sin App Store ni descargas: funciona como una app nativa.',
  },
  {
    q: "¿Cómo funciona la planificación semanal?",
    a: "Asignas platos a cada comida y cena. Rellena a mano, randomiza por día o deja que Lunchfy proponga la semana entera en un toque.",
  },
  {
    q: "¿Y la lista de la compra?",
    a: "Se genera sola desde tu planificación. Revisa los ingredientes, marca lo que ya tienes en casa y compártela con quien quieras.",
  },
  {
    q: "¿Qué son los catálogos y packs?",
    a: "Colecciones de recetas temáticas que importas de golpe: dietas especiales, temporadas del año, cocinas del mundo…",
  },
  {
    q: "¿Están seguros mis datos?",
    a: "Tus recetas, planificaciones y datos del hogar son tuyos. No vendemos ni cedemos datos a terceros, y puedes eliminar tu cuenta cuando quieras.",
  },
];

const NEWS = [
  {
    date: "Junio 2025",
    title: "Modo de cocción guiado",
    desc: "Sigue cualquier receta con temporizadores automáticos integrados en la app.",
  },
  {
    date: "Mayo 2025",
    title: "Retos semanales y recompensas",
    desc: "Nueva capa de gamificación: completa retos, sube de nivel y desbloquea Pro Beta.",
  },
  {
    date: "Abril 2025",
    title: "Catálogos y packs de recetas",
    desc: "Importa colecciones enteras de platos organizados por dieta, temporada o cocina.",
  },
];

const TUTORIAL_EMBED_SRC = "/media/lunchfy-tutorial-9x16/index.html";

// ── Icons ─────────────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="8" cy="8" r="8" fill="var(--hf-brand)" />
      <path d="M4.5 8l2.5 2.5L11.5 5.5" stroke="var(--button-primary-text, #fff)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FeatureIcon({ type }) {
  const paths = {
    calendar: <><rect x="3" y="4" width="18" height="18" rx="3" strokeLinecap="round" strokeLinejoin="round" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="16" y1="2" x2="16" y2="6" /></>,
    cook: <><path d="M5 13a7 7 0 0 1 14 0" /><path d="M4 13h16" /><path d="M6 21h12" /><path d="M6 17h12" /><path d="M12 6V3" /></>,
    cart: <><circle cx="9" cy="21" r="1.4" /><circle cx="19" cy="21" r="1.4" /><path d="M2.5 3h2l2.6 13.4a1.5 1.5 0 0 0 1.5 1.2h9.3a1.5 1.5 0 0 0 1.5-1.2L21 7H6" /></>,
    stack: <><path d="M12 2 2 7l10 5 10-5-10-5Z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    trophy: <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></>,
  };
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[type] || null}
    </svg>
  );
}

// ── Phone mockup ──────────────────────────────────────────────────────────────

const PHONE_DAYS = [
  { day: "LUN", dish: "Pollo al curry", meta: "Comida · 30 min", color: "brand" },
  { day: "MAR", dish: "Crema de calabaza", meta: "Cena · 25 min", color: "green" },
  { day: "MIÉ", dish: "Tacos de pescado", meta: "Cena · 20 min", color: "amber" },
];

function PhoneMockup() {
  return (
    <div className="lp-phone-scene">
      <div className="lp-badge lp-badge-top" aria-hidden="true">
        <div className="lp-badge-icon lp-badge-green">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div>
          <div className="lp-badge-name">Lista generada</div>
          <div className="lp-badge-sub">23 ingredientes</div>
        </div>
      </div>

      <div className="lp-phone-device">
        <div className="lp-phone-screen">
          <div className="lp-phone-header">
            <div className="lp-phone-week-label">OCTUBRE · SEMANA 3</div>
            <div className="lp-phone-week-title">Tu semana</div>
            <div className="lp-phone-avatars" aria-hidden="true">
              <div className="lp-phone-avatar lp-phone-avatar-1" />
              <div className="lp-phone-avatar lp-phone-avatar-2" />
              <div className="lp-phone-avatar lp-phone-avatar-more">+2</div>
            </div>
          </div>
          <div className="lp-phone-body">
            {PHONE_DAYS.map(({ day, dish, meta, color }) => (
              <div key={day} className="lp-phone-row">
                <div className={`lp-phone-day lp-phone-day-${color}`}>{day}</div>
                <div className="lp-phone-dish-info">
                  <div className="lp-phone-dish-name">{dish}</div>
                  <div className="lp-phone-dish-meta">{meta}</div>
                </div>
                <div className={`lp-phone-dot lp-phone-dot-${color}`} />
              </div>
            ))}
            <button className="lp-phone-cta-btn" tabIndex={-1} aria-hidden="true">
              Generar lista de la compra
            </button>
          </div>
        </div>
      </div>

      <div className="lp-badge lp-badge-bottom" aria-hidden="true">
        <div className="lp-badge-icon lp-badge-brand">+5</div>
        <div>
          <div className="lp-badge-name">Recetas añadidas</div>
          <div className="lp-badge-sub">Pack mediterráneo</div>
        </div>
      </div>
    </div>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────

function LandingNav() {
  return (
    <header className="lp-nav">
      <div className="lp-nav-inner">
        <div className="lp-nav-brand">
          <img className="lp-nav-icon" src={lunchfyIcon} alt="" aria-hidden="true" />
          <img className="lp-nav-logo" src={lunchfyLogo} alt="Lunchfy" />
        </div>
        <nav className="lp-nav-links" aria-label="Secciones">
          <a href="#about" className="lp-nav-link">Qué es</a>
          <a href="#features" className="lp-nav-link">Funciones</a>
          <a href="#precios" className="lp-nav-link">Precios</a>
          <a href="#faq" className="lp-nav-link">FAQ</a>
        </nav>
        <div className="lp-nav-actions">
          <Link to="/login" className="kitchen-button secondary lp-btn-sm">Iniciar sesión</Link>
          <Link to="/signup" className="kitchen-button lp-btn-sm">Empezar gratis</Link>
        </div>
      </div>
    </header>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function LandingHero() {
  return (
    <section id="top" className="lp-hero">
      <div className="lp-hero-blob lp-hero-blob-1" aria-hidden="true" />
      <div className="lp-hero-blob lp-hero-blob-2" aria-hidden="true" />
      <div className="lp-hero-inner">
        <div className="lp-hero-text" data-lp-reveal>
          <div className="lp-hero-eyebrow">
            <span className="lp-hero-eyebrow-dot" aria-hidden="true" />
            Tu cocina, organizada
          </div>
          <h1 className="lp-hero-title">
            Planifica la semana,{" "}
            <span className="lp-hero-accent">cocina sin caos</span>
            {" "}y compra solo lo justo.
          </h1>
          <p className="lp-hero-subtitle">
            Tus recetas, tu menú semanal y la lista de la compra en un mismo sitio.
            Pensado para hogares reales: rápido, compartido y sin complicarte.
          </p>
          <div className="lp-hero-actions">
            <Link to="/signup" className="kitchen-button lp-btn-lg">Empezar gratis →</Link>
            <Link to="/login" className="kitchen-button secondary lp-btn-lg">Ya tengo cuenta</Link>
          </div>
          <p className="lp-hero-trust">
            Sin tarjeta · Instálala en tu móvil en 10 s · Gratis para siempre
          </p>
        </div>
        <div className="lp-hero-phone" data-lp-reveal style={{ transitionDelay: "0.15s" }}>
          <PhoneMockup />
        </div>
      </div>
      <div className="lp-hero-band" data-lp-reveal style={{ transitionDelay: "0.22s" }}>
        <div className="lp-hero-benefit">
          <span className="lp-hero-benefit-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
            </svg>
          </span>
          Sin tarjeta de crédito
        </div>
        <div className="lp-hero-benefit">
          <span className="lp-hero-benefit-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="3" /><line x1="12" y1="18" x2="12" y2="18.01" />
            </svg>
          </span>
          Instálala en 10 segundos
        </div>
        <div className="lp-hero-benefit">
          <span className="lp-hero-benefit-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6" /><path d="M2 7h20v5H2z" /><path d="M12 22V7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
            </svg>
          </span>
          Gratis para siempre
        </div>
      </div>
    </section>
  );
}

// ── About ─────────────────────────────────────────────────────────────────────

function LandingWhat() {
  return (
    <section id="about" className="lp-section lp-section-about">
      <div className="lp-section-inner">
        <div className="lp-about-block" data-lp-reveal>
          <div className="lp-section-label">Qué es Lunchfy</div>
          <p className="lp-about-statement">
            La app para hogares que quieren{" "}
            <span className="lp-about-accent">comer mejor sin perder tiempo</span>.
            Planifica el menú, organiza tus recetas, genera la lista sola y comparte todo
            con tu familia en tiempo real.
          </p>
        </div>
      </div>
    </section>
  );
}

// ── Features ──────────────────────────────────────────────────────────────────

function LandingFeatures() {
  return (
    <section id="features" className="lp-section lp-section-features">
      <div className="lp-section-inner">
        <div className="lp-section-head" data-lp-reveal>
          <h2 className="lp-section-title">Todo en un solo sitio</h2>
          <p className="lp-section-subtitle">Funciones pensadas para el día a día de tu hogar.</p>
        </div>
        <div className="lp-feature-grid">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="lp-feature-card"
              data-lp-reveal
              style={{ transitionDelay: `${(i % 3) * 0.06}s` }}
            >
              <div className={`lp-feature-icon lp-feature-icon-${f.color}`}>
                <FeatureIcon type={f.icon} />
              </div>
              <h3 className="lp-feature-title">{f.title}</h3>
              <p className="lp-feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── How it works ──────────────────────────────────────────────────────────────

function LandingHowItWorks() {
  return (
    <section className="lp-section lp-section-steps">
      <div className="lp-section-inner">
        <div className="lp-section-head" data-lp-reveal>
          <div className="lp-section-label">En 3 pasos</div>
          <h2 className="lp-section-title">Empieza a cocinar sin caos</h2>
        </div>
        <div className="lp-steps-grid">
          {STEPS.map((s, i) => (
            <div
              key={s.n}
              className="lp-step"
              data-lp-reveal
              style={{ transitionDelay: `${i * 0.08}s` }}
            >
              <div className="lp-step-number">{s.n}</div>
              <h3 className="lp-step-title">{s.title}</h3>
              <p className="lp-step-desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Pricing ───────────────────────────────────────────────────────────────────

function LandingPricing() {
  return (
    <section className="lp-section lp-section-pricing" id="precios">
      <div className="lp-section-inner">
        <div className="lp-section-head" data-lp-reveal>
          <h2 className="lp-section-title">Planes y precios</h2>
          <p className="lp-section-subtitle">Empieza gratis. Sube de plan cuando lo necesites.</p>
        </div>
        <div className="lp-plan-grid">
          {PLANS.map((plan, i) => (
            <article
              key={plan.id}
              className={`lp-plan-card${plan.recommended ? " lp-plan-recommended" : ""}`}
              data-lp-reveal
              style={{ transitionDelay: `${i * 0.08}s` }}
            >
              {plan.recommended && (
                <div className="lp-plan-badge">Recomendado</div>
              )}
              <div className="lp-plan-head">
                <h3 className="lp-plan-name">{plan.name}</h3>
                <div className="lp-plan-price">
                  {plan.price}
                  {plan.priceSuffix && (
                    <span className="lp-plan-price-suffix">{plan.priceSuffix}</span>
                  )}
                </div>
              </div>
              <p className="lp-plan-tagline">{plan.tagline}</p>
              <ul className="lp-plan-features">
                {plan.features.map((feat) => (
                  <li key={feat} className="lp-plan-feature">
                    <CheckIcon />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/signup"
                className={`kitchen-button${plan.recommended ? "" : " secondary"} lp-plan-cta`}
              >
                {plan.id === "basic" ? "Empezar gratis" : `Probar ${plan.name}`}
              </Link>
            </article>
          ))}
        </div>
        <p className="lp-pricing-note">
          Puedes cambiar o cancelar tu plan cuando quieras desde la configuración.
        </p>
      </div>
    </section>
  );
}

// ── Video ─────────────────────────────────────────────────────────────────────

function LandingVideo() {
  return (
    <section className="lp-section lp-section-video">
      <div className="lp-section-inner">
        <div className="lp-section-head" data-lp-reveal>
          <div className="lp-section-label">En 2 minutos</div>
          <h2 className="lp-section-title">¿Cómo funciona?</h2>
        </div>
        <div className="lp-video-shell" data-lp-reveal aria-label="Vídeo tutorial de Lunchfy">
          <iframe
            className="lp-video-frame"
            title="Vídeo tutorial de Lunchfy"
            src={TUTORIAL_EMBED_SRC}
            loading="lazy"
            allow="autoplay; fullscreen"
          />
        </div>
      </div>
    </section>
  );
}

// ── News ──────────────────────────────────────────────────────────────────────

function LandingNews() {
  return (
    <section className="lp-section lp-section-alt">
      <div className="lp-section-inner">
        <div className="lp-section-head" data-lp-reveal>
          <h2 className="lp-section-title">Novedades</h2>
          <p className="lp-section-subtitle">Lo último que hemos añadido a Lunchfy.</p>
        </div>
        <div className="lp-news-grid">
          {NEWS.map((item, i) => (
            <article
              key={item.title}
              className="lp-news-card"
              data-lp-reveal
              style={{ transitionDelay: `${i * 0.08}s` }}
            >
              <div className="lp-news-date">{item.date}</div>
              <h3 className="lp-news-title">{item.title}</h3>
              <p className="lp-news-desc">{item.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Privacy ───────────────────────────────────────────────────────────────────

function LandingPrivacy() {
  return (
    <section className="lp-section lp-section-privacy">
      <div className="lp-section-inner">
        <div className="lp-privacy-card" data-lp-reveal>
          <div className="lp-privacy-icon-wrap" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2 className="lp-privacy-title">Tus datos, seguros</h2>
          <p className="lp-privacy-text">
            Tus recetas, planificaciones y datos del hogar son tuyos y solo tuyos.
            No vendemos ni cedemos datos a terceros.
            Puedes eliminar tu cuenta y todo su contenido cuando quieras.
          </p>
          <Link to="/privacidad" className="lp-privacy-link">
            Leer la política de privacidad →
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── FAQ ───────────────────────────────────────────────────────────────────────

function LandingFAQ() {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <section id="faq" className="lp-section lp-section-faq">
      <div className="lp-section-inner">
        <div className="lp-section-head" data-lp-reveal>
          <h2 className="lp-section-title">Preguntas frecuentes</h2>
        </div>
        <div className="lp-faq-list">
          {FAQ.map((item, i) => {
            const isOpen = openIndex === i;
            return (
              <div
                key={item.q}
                className={`lp-faq-item${isOpen ? " is-open" : ""}`}
                data-lp-reveal
                style={{ transitionDelay: `${i * 0.04}s` }}
              >
                <button
                  className="lp-faq-trigger"
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  aria-expanded={isOpen}
                >
                  <span className="lp-faq-q">{item.q}</span>
                  <span className="lp-faq-toggle" aria-hidden="true" />
                </button>
                <div className="lp-faq-panel">
                  <p className="lp-faq-a">{item.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Final CTA ─────────────────────────────────────────────────────────────────

function LandingFinalCTA() {
  return (
    <section className="lp-section lp-section-finalcta">
      <div className="lp-section-inner">
        <div className="lp-finalcta-block" data-lp-reveal>
          <div className="lp-finalcta-blob" aria-hidden="true" />
          <div className="lp-finalcta-content">
            <h2 className="lp-finalcta-title">
              Tu semana, planificada<br />en cinco minutos.
            </h2>
            <p className="lp-finalcta-sub">
              Únete a los hogares que cocinan sin caos. Gratis para siempre.
            </p>
            <Link to="/signup" className="lp-finalcta-btn kitchen-button">
              Empezar gratis →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

function LandingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-footer-inner">
        <div className="lp-footer-brand">
          <img className="lp-footer-icon" src={lunchfyIcon} alt="" aria-hidden="true" />
          <span className="lp-footer-name">Lunchfy</span>
        </div>
        <nav className="lp-footer-nav" aria-label="Pie de página">
          <Link to="/login">Iniciar sesión</Link>
          <Link to="/signup">Registrarse</Link>
          <a href="#precios">Precios</a>
          <Link to="/privacidad">Privacidad</Link>
          <Link to="/terminos">Términos</Link>
        </nav>
        <p className="lp-footer-copy">© 2026 Lunchfy. Hecho para hogares reales.</p>
      </div>
    </footer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  useEffect(() => {
    const bar = document.getElementById("lp-progress-bar");
    const updateBar = () => {
      if (!bar) return;
      const total = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = total > 0 ? `${(window.scrollY / total) * 100}%` : "0%";
    };
    window.addEventListener("scroll", updateBar, { passive: true });

    const preferReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealEls = document.querySelectorAll("[data-lp-reveal]");

    if (preferReducedMotion) {
      revealEls.forEach((el) => el.setAttribute("data-lp-revealed", ""));
      return () => window.removeEventListener("scroll", updateBar);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.setAttribute("data-lp-revealed", "");
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", updateBar);
    };
  }, []);

  return (
    <div className="lp-root">
      <div id="lp-progress-bar" className="lp-progress-bar" aria-hidden="true" />
      <LandingNav />
      <main>
        <LandingHero />
        <LandingWhat />
        <LandingFeatures />
        <LandingHowItWorks />
        <LandingPricing />
        <LandingVideo />
        <LandingNews />
        <LandingPrivacy />
        <LandingFAQ />
        <LandingFinalCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
