import React from "react";
import KitchenLayout from "../Layout.jsx";
import Skeleton from "./ui/Skeleton.jsx";

function WeekDayStripSkeleton({ chipCount = 7 }) {
  return (
    <section className="kitchen-weekdays-strip kitchen-card kitchen-skeleton-panel" aria-label="Cargando panel de dias">
      <div className="kitchen-weekdays-list kitchen-skeleton-weekdays-list">
        {Array.from({ length: chipCount }).map((_, index) => (
          <div key={`weekday-skeleton-${index}`} className="kitchen-skeleton-weekday">
            <Skeleton className="kitchen-skeleton-weekday-circle" />
            <Skeleton className="kitchen-skeleton-weekday-label" />
          </div>
        ))}
      </div>
    </section>
  );
}

function WeekHeaderSkeleton({ showTabs = true }) {
  return (
    <section className="kitchen-week-header">
      <div className="kitchen-week-header-actions">
        <div className="kitchen-week-nav-row">
          <div className="kitchen-week-nav kitchen-skeleton-week-nav" aria-hidden="true">
            <Skeleton className="kitchen-skeleton-week-arrow" />
            <Skeleton className="kitchen-skeleton-week-input" />
            <Skeleton className="kitchen-skeleton-week-arrow" />
          </div>
          <Skeleton className="kitchen-skeleton-now-button" />
        </div>
        {showTabs ? (
          <div className="kitchen-meal-tabs kitchen-meal-tabs-with-link kitchen-skeleton-tabs" aria-hidden="true">
            <Skeleton className="kitchen-skeleton-tab is-active" />
            <Skeleton className="kitchen-skeleton-tab" />
            <Skeleton className="kitchen-skeleton-tab kitchen-skeleton-tab-link" />
          </div>
        ) : null}
        <div className="kitchen-week-header-utility-row">
          <Skeleton className="kitchen-skeleton-utility-pill" />
        </div>
        <Skeleton className="kitchen-skeleton-inline-copy" />
      </div>
    </section>
  );
}

function DayCardSkeleton({ index }) {
  return (
    <article
      className="kitchen-card kitchen-day-card kitchen-skeleton-day-card"
      style={{ "--skeleton-accent": index % 2 === 0 ? "rgba(129, 140, 248, 0.16)" : "rgba(52, 211, 153, 0.14)" }}
    >
      <div className="kitchen-day-header">
        <div className="kitchen-day-header-row">
          <div className="kitchen-day-header-main">
            <Skeleton className="kitchen-skeleton-day-title" />
            <div className="kitchen-skeleton-day-subtitle-row">
              <Skeleton className="kitchen-skeleton-day-subtitle" />
              <Skeleton className="kitchen-skeleton-day-subtitle-action" />
            </div>
          </div>
          <div className="kitchen-skeleton-cook-block">
            <Skeleton className="kitchen-skeleton-cook-line" />
            <Skeleton className="kitchen-skeleton-cook-line is-short" />
          </div>
        </div>
        <Skeleton className="kitchen-skeleton-meta-line" />
      </div>
      <div className="kitchen-day-view">
        <div className="kitchen-day-dish-row">
          <Skeleton className="kitchen-skeleton-dish-title" />
          <Skeleton className="kitchen-skeleton-info-dot" />
        </div>
        <div className="kitchen-skeleton-chip-row">
          <Skeleton className="kitchen-skeleton-chip" />
          <Skeleton className="kitchen-skeleton-chip is-wide" />
          <Skeleton className="kitchen-skeleton-chip" />
        </div>
        <div className="kitchen-day-footer kitchen-skeleton-day-footer">
          <Skeleton className="kitchen-skeleton-toggle" />
          <div className="kitchen-skeleton-icon-actions">
            <Skeleton className="kitchen-skeleton-icon-button" />
            <Skeleton className="kitchen-skeleton-icon-button" />
            <Skeleton className="kitchen-skeleton-icon-button" />
          </div>
        </div>
      </div>
    </article>
  );
}

export default function WeekPageSkeleton({
  dayCount = 5,
  showTabs = true,
  chipCount = 7,
  className = ""
}) {
  return (
    <div className={["kitchen-week-controls", className].filter(Boolean).join(" ")}>
      <WeekDayStripSkeleton chipCount={chipCount} />
      <div className="kitchen-week-mobile-frame">
        <WeekHeaderSkeleton showTabs={showTabs} />
        <div className="kitchen-week-carousel kitchen-skeleton-carousel">
          <div className="kitchen-grid kitchen-week-days kitchen-skeleton-week-days" aria-label="Cargando programacion">
            {Array.from({ length: dayCount }).map((_, index) => (
              <DayCardSkeleton key={`day-card-skeleton-${index}`} index={index} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppLoadingScreen({
  title = "Cargando Lunchfy",
  subtitle = "Estamos despertando la cocina y preparando tu planificacion."
}) {
  return (
    <KitchenLayout containerClassName="kitchen-week-canvas kitchen-loading-screen">
      <div className="kitchen-loading-copy">
        <div className="kitchen-loading-copy-text">
          <h2>{title}</h2>
          <p className="kitchen-muted">{subtitle}</p>
        </div>
        <div className="kitchen-loading-inline" aria-live="polite">
          <span className="kitchen-loading-spinner" aria-hidden="true" />
          <span>Preparando datos...</span>
        </div>
      </div>
      <WeekPageSkeleton dayCount={5} showTabs />
    </KitchenLayout>
  );
}
