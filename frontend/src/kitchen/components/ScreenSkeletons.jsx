import React from "react";
import PageHeader from "./PageHeader.jsx";
import Skeleton from "./ui/Skeleton.jsx";

export function PageHeaderSkeleton({
  className = "",
  leading = false,
  primaryAction = true,
  secondaryLeft = null,
  secondaryRight = null,
  footer = null,
  children = null,
}) {
  return (
    <PageHeader
      className={["kitchen-skeleton-page-header", className].filter(Boolean).join(" ")}
      leading={leading ? <Skeleton className="skeleton-avatar" /> : null}
      title={<Skeleton className="skeleton-title-line" />}
      subtitle={<Skeleton className="skeleton-subtitle-line" />}
      primaryAction={primaryAction ? <Skeleton className="skeleton-action-pill" /> : null}
      secondaryLeft={secondaryLeft}
      secondaryRight={secondaryRight}
      footer={footer}
    >
      {children}
    </PageHeader>
  );
}

export function WeekControlsSkeleton() {
  return (
    <div className="skeleton-week-controls">
      <Skeleton className="skeleton-icon-button" />
      <Skeleton className="skeleton-date-pill" />
      <Skeleton className="skeleton-icon-button" />
    </div>
  );
}

export function MealTabsSkeleton() {
  return (
    <div className="kitchen-meal-tabs skeleton-segmented" aria-hidden="true">
      <Skeleton className="skeleton-segment is-active" />
      <Skeleton className="skeleton-segment" />
    </div>
  );
}

export function DayTabsSkeleton({ count = 7 }) {
  return (
    <div className="skeleton-day-tabs" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="skeleton-day-tab" />
      ))}
    </div>
  );
}

export function DishGridSkeleton({ count = 6, ingredients = false }) {
  return (
    <div className="kitchen-dishes-grid skeleton-card-grid" aria-label={ingredients ? "Cargando productos" : "Cargando platos"}>
      {Array.from({ length: count }).map((_, index) => (
        <article className={["kitchen-dish-card", ingredients ? "kitchen-ingredient-card" : "", "skeleton-dish-card"].filter(Boolean).join(" ")} key={index}>
          <div className="kitchen-dish-main">
            <div className="kitchen-dish-title-row">
              <Skeleton className="skeleton-dish-name" />
            </div>
            <Skeleton className="skeleton-card-subtitle" />
            {!ingredients ? (
              <div className="skeleton-meta-row">
                <Skeleton className="skeleton-icon-chip" />
                <Skeleton className="skeleton-small-pill" />
              </div>
            ) : null}
            {!ingredients ? <Skeleton className="skeleton-random-row" /> : null}
          </div>
          <div className="kitchen-dish-actions-bar">
            <div className="kitchen-dish-actions">
              <Skeleton className="skeleton-icon-button" />
              <Skeleton className="skeleton-icon-button" />
              <Skeleton className="skeleton-icon-button" />
              <Skeleton className="skeleton-icon-button" />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export function DishesPageSkeleton({ ingredients = false }) {
  return (
    <div className="kitchen-dishes-page">
      <PageHeaderSkeleton
        className="dishes-explorer-panel"
        primaryAction
      >
        <div className="dishes-controls-row skeleton-controls-row">
          <div className="dishes-explorer-nav skeleton-tab-pair">
            <Skeleton className="skeleton-tab-button is-active" />
            <Skeleton className="skeleton-tab-button" />
          </div>
          <div className="dishes-filters-right">
            <Skeleton className="skeleton-icon-button" />
            {!ingredients ? <Skeleton className="skeleton-toggle-pill" /> : null}
          </div>
        </div>
        <Skeleton className="skeleton-search-input" />
        <Skeleton className="skeleton-count-line" />
      </PageHeaderSkeleton>
      <DishGridSkeleton ingredients={ingredients} />
    </div>
  );
}

function ShoppingCategorySkeleton({ rows = 4 }) {
  return (
    <div className="shopping-category-card skeleton-shopping-category">
      <div className="shopping-category-head">
        <Skeleton className="skeleton-category-title" />
        <Skeleton className="skeleton-category-count" />
      </div>
      <div className="shopping-items-flat-list">
        {Array.from({ length: rows }).map((_, index) => (
          <div className="shopping-item-flat skeleton-shopping-row" key={index}>
            <Skeleton className="skeleton-checkbox" />
            <div className="shopping-item-name-col">
              <Skeleton className="skeleton-shopping-name" />
            </div>
            <div className="shopping-item-controls">
              <Skeleton className="skeleton-qty-button" />
              <Skeleton className="skeleton-qty-value" />
              <Skeleton className="skeleton-qty-button" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ShoppingPageSkeleton() {
  return (
    <>
      <PageHeaderSkeleton
        className="shopping-header-card"
        primaryAction
        secondaryLeft={<WeekControlsSkeleton />}
        footer={<Skeleton className="skeleton-budget-bar" />}
      >
        <div className="shopping-tabs-standalone">
          <div className="kitchen-dishes-tabs shopping-tabs-inline skeleton-shopping-tabs">
            <Skeleton className="skeleton-tab-button is-active" />
            <Skeleton className="skeleton-tab-button" />
            <Skeleton className="skeleton-tab-button is-wide" />
          </div>
        </div>
      </PageHeaderSkeleton>
      <div className="shopping-page-shell">
        <div className="kitchen-card shopping-main-card skeleton-shopping-main">
          <div className="shopping-add-inline">
            <Skeleton className="skeleton-shopping-input" />
            <Skeleton className="skeleton-basics-button" />
          </div>
          <div className="shopping-categories-wrap">
            <div className="shopping-global-actions-row">
              <Skeleton className="skeleton-mark-all" />
            </div>
            <div className="shopping-categories shopping-categories-grid">
              <ShoppingCategorySkeleton />
              <ShoppingCategorySkeleton rows={3} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function CatalogPackCardSkeleton() {
  return (
    <article className="kitchen-card catalog-pack-card skeleton-catalog-card">
      <Skeleton className="catalog-pack-cover skeleton-pack-image" />
      <div className="catalog-pack-body">
        <Skeleton className="skeleton-pack-title" />
        <Skeleton className="skeleton-pack-desc" />
        <Skeleton className="skeleton-pack-desc is-short" />
        <div className="skeleton-pack-tags">
          <Skeleton className="skeleton-small-pill" />
          <Skeleton className="skeleton-small-pill is-wide" />
        </div>
      </div>
      <div className="catalog-pack-footer">
        <Skeleton className="skeleton-price-pill" />
        <Skeleton className="skeleton-cta-button" />
      </div>
    </article>
  );
}

export function CatalogPageSkeleton() {
  return (
    <div className="catalog-page">
      <PageHeaderSkeleton
        primaryAction={false}
        secondaryLeft={<Skeleton className="skeleton-filter-button" />}
        secondaryRight={<Skeleton className="skeleton-bites-chip" />}
        footer={<Skeleton className="skeleton-search-input" />}
      />
      <div className="catalog-grid skeleton-card-grid">
        {Array.from({ length: 6 }).map((_, index) => (
          <CatalogPackCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}

function SettingsRowSkeleton() {
  return (
    <div className="settings-nav-row skeleton-settings-row">
      <Skeleton className="skeleton-settings-icon" />
      <span className="settings-nav-row-main">
        <Skeleton className="skeleton-settings-title" />
        <Skeleton className="skeleton-settings-sub" />
      </span>
      <Skeleton className="skeleton-settings-chevron" />
    </div>
  );
}

export function SettingsPageSkeleton() {
  return (
    <div className="settings-hub skeleton-settings-hub">
      {Array.from({ length: 3 }).map((_, sectionIndex) => (
        <div className="settings-section" key={sectionIndex}>
          <Skeleton className="skeleton-settings-label" />
          <div className="settings-section-group">
            <SettingsRowSkeleton />
            <SettingsRowSkeleton />
            {sectionIndex === 1 ? <SettingsRowSkeleton /> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
