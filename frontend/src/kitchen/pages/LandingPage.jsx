import React from "react";
import { Link } from "react-router-dom";
import lunchfyIcon from "../../assets/brand/Lunchfy_icon.png";
import lunchfyLogo from "../../assets/brand/Lunchfy_logo1.png";
import "../landing.css";

const TUTORIAL_EMBED_SRC = "/media/lunchfy-tutorial-9x16/index.html";

// ── Static data ───────────────────────────────────────────────────────────────

const PLANS = [
  {
    id: "basic",
    name: "Basic",
    price: "Gratis",
    tagline: "El plan base, con lo esencial para organizar tu semana.",
    features: [
      "Planificación semanal completa",
      "Lista de la compra automática",
      "Randomizar platos por día",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "€4,99/mes",
    tagline: "La opción recomendada para familias activas.",
    recommended: true,
    features: [
      "Todo lo de Basic",
      "Randomizar semana completa",
      "Presupuesto y control de gasto",
      "Filtro de dieta en randomización",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    price: "€8,99/mes",
    tagline: "Para hogares que quieren el máximo y soporte ampliado.",
    features: [
      "Todo lo de Pro",
      "Usuarios y comensales ilimitados",
      "Acceso prioritario a nuevas funciones",
      "Soporte beta ampliado",
    ],
  },
];

const FEATURES = [
  {
    icon: "📅",
    title: "Planificación semanal",
    desc: "Organiza todas las comidas y cenas de la semana en un solo golpe de vista. Rellena slots en segundos.",
  },
  {
    icon: "🍽️",
    title: "Recetas y cocina",
    desc: "Guarda tus platos favoritos con ingredientes, pasos y modos de cocción guiados paso a paso.",
  },
  {
    icon: "🛒",
    title: "Lista de la compra",
    desc: "Generada automáticamente desde tu planificación semanal. Sin duplicados, sin olvidos.",
  },
  {
    icon: "📚",
    title: "Catálogos y packs",
    desc: "Descubre colecciones curadas de recetas por dieta, temporada o cocina. Añádelas con un clic.",
  },
  {
    icon: "👨‍👩‍👧‍👦",
    title: "Uso familiar",
    desc: "Comparte tu hogar con tu pareja o familia. Todos ven el mismo menú actualizado en tiempo real.",
  },
  {
    icon: "🏆",
    title: "Retos y recompensas",
    desc: "Completa desafíos semanales, sube de nivel y desbloquea mejoras y funciones exclusivas.",
  },
];

const FAQ = [
  {
    q: "¿Cómo instalo la app en mi móvil?",
    a: 'Abre la web desde tu navegador, toca el botón "Compartir" y selecciona "Añadir a pantalla de inicio". Sin App Store ni descarga — funciona como una app nativa.',
  },
  {
    q: "¿Cómo funciona la planificación semanal?",
    a: "Cada semana asignas platos a cada comida y cena. Puedes rellenar a mano, randomizar por día o dejar que Lunchfy proponga toda la semana automáticamente.",
  },
  {
    q: "¿Cómo funciona la lista de la compra?",
    a: "Se genera sola desde tu planificación. Puedes revisar los ingredientes, marcar lo que ya tienes en casa y compartir la lista con quien quieras.",
  },
  {
    q: "¿Qué son los catálogos y packs?",
    a: "Colecciones de recetas temáticas que puedes importar de golpe: dietas especiales, temporadas del año, cocinas del mundo…",
  },
  {
    q: "¿Cómo se protegen mis datos?",
    a: "Tus recetas, planificaciones y datos del hogar son tuyos. No vendemos datos ni los cedemos a terceros. Puedes eliminar tu cuenta en cualquier momento.",
  },
];

const NEWS = [
  {
    date: "Junio 2025",
    title: "Modo de cocción guiado",
    desc: "Sigue los pasos de cualquier receta con temporizadores automáticos integrados en la app.",
  },
  {
    date: "Mayo 2025",
    title: "Retos semanales y recompensas",
    desc: "Nueva capa de gamificación: completa retos, sube de nivel y desbloquea el plan Pro Beta.",
  },
  {
    date: "Abril 2025",
    title: "Catálogos y packs de recetas",
    desc: "Importa colecciones enteras de platos organizados por dieta, temporada o cocina.",
  },
];

// ── Small reusables ───────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="8" cy="8" r="8" fill="var(--hf-brand)" />
      <path d="M4.5 8l2.5 2.5L11.5 5.5" stroke="var(--button-primary-text, #fff)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Section components ────────────────────────────────────────────────────────

function LandingNav() {
  return (
    <header className="lp-nav">
      <div className="lp-nav-inner">
        <div className="lp-nav-brand">
          <img className="lp-nav-icon" src={lunchfyIcon} alt="" aria-hidden="true" />
          <img className="lp-nav-logo" src={lunchfyLogo} alt="Lunchfy" />
        </div>
        <nav className="lp-nav-actions" aria-label="Acceso">
          <Link to="/login" className="kitchen-button secondary lp-btn-sm">
            Iniciar sesión
          </Link>
          <Link to="/signup" className="kitchen-button lp-btn-sm">
            Empezar gratis
          </Link>
        </nav>
      </div>
    </header>
  );
}

function LandingHero() {
  return (
    <section className="lp-hero">
      <div className="lp-hero-inner">
        <div className="lp-hero-eyebrow">Lunchfy</div>
        <h1 className="lp-hero-title">
          Planifica tu semana,{" "}
          <span className="lp-hero-accent">cocina sin caos</span>{" "}
          y compra solo lo que necesitas.
        </h1>
        <p className="lp-hero-subtitle">
          Tu cocina, tus recetas y tu lista de la compra en un solo sitio.
          Pensado para hogares reales: comidas, cenas, básicos, catálogos y planificación semanal.
        </p>
        <div className="lp-hero-actions">
          <Link to="/signup" className="kitchen-button lp-btn-lg">
            Empezar gratis
          </Link>
          <Link to="/login" className="kitchen-button secondary lp-btn-lg">
            Ya tengo cuenta
          </Link>
        </div>
        <p className="lp-hero-trust">
          Sin tarjeta de crédito · Instálalo en tu móvil en 10 segundos · Plan gratuito para siempre
        </p>
      </div>
    </section>
  );
}

function LandingWhat() {
  return (
    <section className="lp-section lp-section-alt">
      <div className="lp-section-inner">
        <h2 className="lp-section-title">¿Qué es Lunchfy?</h2>
        <p className="lp-what-text">
          Lunchfy es una app para hogares que quieren comer mejor sin perder tiempo.
          Te ayuda a <strong>planificar las comidas de toda la semana</strong>, a organizar tus recetas
          y platos favoritos, a generar la lista de la compra automáticamente y a descubrir
          catálogos y packs de recetas curadas.
        </p>
        <p className="lp-what-text">
          Diseñada para el uso diario en familia: todos ven el mismo menú, todos pueden actualizar
          la lista y todos contribuyen a que la semana en la cocina fluya sin caos.
        </p>
      </div>
    </section>
  );
}

function LandingFeatures() {
  return (
    <section className="lp-section">
      <div className="lp-section-inner">
        <h2 className="lp-section-title">Todo en un solo sitio</h2>
        <p className="lp-section-subtitle">Funciones pensadas para el día a día de tu hogar.</p>
        <div className="lp-feature-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="lp-feature-card">
              <span className="lp-feature-icon" aria-hidden="true">{f.icon}</span>
              <h3 className="lp-feature-title">{f.title}</h3>
              <p className="lp-feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LandingPricing() {
  return (
    <section className="lp-section lp-section-alt" id="precios">
      <div className="lp-section-inner">
        <h2 className="lp-section-title">Planes y precios</h2>
        <p className="lp-section-subtitle">Empieza gratis. Actualiza cuando lo necesites.</p>
        <div className="lp-plan-grid">
          {PLANS.map((plan) => (
            <article
              key={plan.id}
              className={`lp-plan-card${plan.recommended ? " lp-plan-recommended" : ""}`}
            >
              {plan.recommended && (
                <div className="lp-plan-badge" aria-label="Plan recomendado">Recomendado</div>
              )}
              <div className="lp-plan-head">
                <h3 className="lp-plan-name">{plan.name}</h3>
                <div className="lp-plan-price">{plan.price}</div>
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
          Puedes cambiar o cancelar tu plan en cualquier momento desde la configuración.
        </p>
      </div>
    </section>
  );
}

function LandingVideo() {
  return (
    <section className="lp-section">
      <div className="lp-section-inner">
        <h2 className="lp-section-title">¿Cómo funciona?</h2>
        <p className="lp-section-subtitle">Un recorrido por la app en menos de 2 minutos.</p>
        <div className="lp-video-shell" aria-label="Vídeo tutorial de Lunchfy">
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

function LandingNews() {
  return (
    <section className="lp-section lp-section-alt">
      <div className="lp-section-inner">
        <h2 className="lp-section-title">Novedades</h2>
        <p className="lp-section-subtitle">Lo último que hemos añadido a Lunchfy.</p>
        <div className="lp-news-grid">
          {NEWS.map((item) => (
            <article key={item.title} className="lp-news-card">
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

function LandingPrivacy() {
  return (
    <section className="lp-section">
      <div className="lp-section-inner">
        <div className="lp-privacy-card">
          <span className="lp-privacy-icon" aria-hidden="true">🔒</span>
          <h2 className="lp-privacy-title">Tus datos, seguros</h2>
          <p className="lp-privacy-text">
            Los datos de tu hogar en Lunchfy — recetas, planificaciones, lista de la compra y datos
            de los miembros de tu hogar — son tuyos y solo tuyos. No vendemos datos ni los compartimos
            con terceros. Los miembros de tu hogar pueden ver el contenido compartido, pero nadie
            externo tiene acceso a tu información.
          </p>
          <p className="lp-privacy-text">
            Puedes eliminar tu cuenta y todos tus datos en cualquier momento desde la configuración de la app.
          </p>
          <Link to="/privacidad" className="lp-privacy-link">
            Leer la política de privacidad →
          </Link>
        </div>
      </div>
    </section>
  );
}

function LandingFAQ() {
  return (
    <section className="lp-section lp-section-alt">
      <div className="lp-section-inner">
        <h2 className="lp-section-title">Preguntas frecuentes</h2>
        <div className="lp-faq-list">
          {FAQ.map((item) => (
            <div key={item.q} className="lp-faq-item">
              <h3 className="lp-faq-q">{item.q}</h3>
              <p className="lp-faq-a">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

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

// ── Main page export ──────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="lp-root">
      <LandingNav />
      <main>
        <LandingHero />
        <LandingWhat />
        <LandingFeatures />
        <LandingPricing />
        <LandingVideo />
        <LandingNews />
        <LandingPrivacy />
        <LandingFAQ />
      </main>
      <LandingFooter />
    </div>
  );
}
