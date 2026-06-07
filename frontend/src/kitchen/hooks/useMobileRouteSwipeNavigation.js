import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const SWIPE_MIN_X = 60;
const SWIPE_RATIO = 1.5;
const MOBILE_QUERY = "(max-width: 767px)";

const INTERACTIVE_SELECTOR = [
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "summary",
  "[role='button']",
  "[role='tab']",
  "[role='switch']",
  "[contenteditable='true']",
  "[data-swipe-zone='ignore']",
  "[data-horizontal-scroll='true']",
  ".kitchen-modal-backdrop",
  ".kitchen-modal",
  ".cooking-stepper-overlay",
  ".kitchen-user-menu",
  ".kitchen-ui-bottom-nav",
  ".kitchen-meal-tabs",
  ".kitchen-dishes-tabs",
  ".dishes-explorer-nav",
  ".dishes-controls-row",
  ".dishes-filter-pills",
  ".shopping-tabs-inline",
  ".catalog-filter-chips",
  ".kitchen-weekday-tabs",
  ".kitchen-week-carousel-dots"
].join(",");

function isHorizontalScroller(element) {
  let node = element;
  while (node && node !== document.body && node !== document.documentElement) {
    if (node.dataset?.swipeZone === "carousel" || node.dataset?.horizontalScroll === "true") {
      return true;
    }
    const style = window.getComputedStyle(node);
    const canScrollX = node.scrollWidth > node.clientWidth + 8;
    const overflowAllowsX = /(auto|scroll|overlay)/.test(`${style.overflowX} ${style.overflow}`);
    if (canScrollX && overflowAllowsX) return true;
    node = node.parentElement;
  }
  return false;
}

function shouldIgnoreStart(target) {
  if (!(target instanceof Element)) return true;
  if (target.closest(INTERACTIVE_SELECTOR)) return true;
  if (target.closest("[data-swipe-zone='carousel']")) return true;
  if (target.closest("[aria-modal='true']")) return true;
  return isHorizontalScroller(target);
}

export default function useMobileRouteSwipeNavigation(routes) {
  const navigate = useNavigate();
  const location = useLocation();
  const gestureRef = useRef(null);
  const routeIndex = routes.findIndex((route) => location.pathname === route);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia(MOBILE_QUERY);
    if (!media.matches || routeIndex < 0) return undefined;

    const reset = () => {
      gestureRef.current = null;
    };

    const onTouchStart = (event) => {
      if (event.touches.length !== 1) {
        reset();
        return;
      }
      const touch = event.touches[0];
      if (shouldIgnoreStart(event.target)) {
        reset();
        return;
      }
      gestureRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        tracking: true,
        locked: false,
      };
    };

    const onTouchMove = (event) => {
      const gesture = gestureRef.current;
      if (!gesture?.tracking || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - gesture.startX;
      const dy = touch.clientY - gesture.startY;
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 12) {
        gesture.locked = true;
      }
    };

    const onTouchEnd = (event) => {
      const gesture = gestureRef.current;
      reset();
      if (!gesture?.tracking || gesture.locked) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - gesture.startX;
      const dy = touch.clientY - gesture.startY;
      if (Math.abs(dx) < SWIPE_MIN_X) return;
      if (Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return;

      const nextIndex = dx < 0 ? routeIndex + 1 : routeIndex - 1;
      const nextRoute = routes[nextIndex];
      if (!nextRoute || nextRoute === location.pathname) return;
      navigate(nextRoute);
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", reset, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", reset);
    };
  }, [location.pathname, navigate, routeIndex, routes]);
}
