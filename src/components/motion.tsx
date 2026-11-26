"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

/**
 * Scroll reveal primitives.
 *
 * Three rules keep the motion from becoming decoration:
 *  1. Reveal once. Replaying on scroll-up is noise on a record.
 *  2. Never delay the content that tells you what the site is — only what you
 *     scroll to.
 *  3. Everything collapses to a no-op under `prefers-reduced-motion`, and in any
 *     environment without IntersectionObserver the content is shown as-is.
 */

function useReveal<T extends HTMLElement>(threshold = 0.18) {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const Observer = (globalThis as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver;
    if (!Observer) {
      // No observer available: reveal on the next task rather than synchronously.
      const timer = setTimeout(() => setShown(true), 0);
      return () => clearTimeout(timer);
    }

    const observer = new Observer(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      // A generous bottom margin means type is already revealed as it enters
      // the viewport. Root-margin-only reveals with no IntersectionObserver
      // still fall back to a timed reveal rather than ever hiding content.
      { threshold, rootMargin: "12% 0px 12% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, shown };
}

export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
  threshold,
}: {
  children: ReactNode;
  delay?: number;
  as?: ElementType;
  className?: string;
  threshold?: number;
}) {
  const { ref, shown } = useReveal<HTMLDivElement>(threshold);
  return (
    <Tag
      ref={ref}
      className={`rv ${shown ? "is-in" : ""} ${className}`}
      style={{ ["--rv-delay" as string]: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

/**
 * Masked word reveal for display type. Words rise through an overflow mask,
 * staggered — the effect reads as typesetting rather than animation.
 */
export function SplitText({
  text,
  as: Tag = "span",
  stagger = 55,
  base = 0,
  className = "",
}: {
  text: string;
  as?: ElementType;
  stagger?: number;
  base?: number;
  className?: string;
}) {
  const { ref, shown } = useReveal<HTMLSpanElement>(0.1);
  const words = text.split(" ");

  return (
    <Tag ref={ref} className={`split-reveal ${shown ? "is-in" : ""} ${className}`}>
      {words.map((word, i) => (
        <span key={`${word}-${i}`} className="split-word">
          <span style={{ ["--rv-delay" as string]: `${base + i * stagger}ms` }}>{word}</span>
          {i < words.length - 1 ? "\u00a0" : ""}
        </span>
      ))}
    </Tag>
  );
}

/**
 * Counts up to a value the first time it scrolls into view.
 *
 * The static HTML renders the *final* value, so the number is correct without
 * JavaScript, for crawlers, and in a screenshot. Once hydrated, a numeral below
 * the fold counts up forward — never a fake countdown, never a jump backwards.
 */
export function CountUp({
  to,
  decimals = 0,
  duration = 1300,
  suffix = "",
  prefix = "",
  className = "",
}: {
  to: number;
  decimals?: number;
  duration?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}) {
  const { ref, shown } = useReveal<HTMLSpanElement>(0.4);
  const [value, setValue] = useState(to);
  const [counting, setCounting] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduce) return;
    const timer = setTimeout(() => {
      const node = ref.current;
      if (!node) return;
      // Only animate numerals the visitor has not reached yet.
      if (node.getBoundingClientRect().top > window.innerHeight * 0.9) {
        setValue(0);
        setCounting(true);
      }
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  useEffect(() => {
    if (!shown || !counting) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutExpo: fast out of the gate, settling precisely.
      const eased = t === 1 ? 1 : 1 - 2 ** (-10 * t);
      setValue(to * eased);
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setValue(to);
        frame = requestAnimationFrame(() => setCounting(false));
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [shown, counting, to, duration]);

  return (
    <span ref={ref} className={className} aria-label={`${prefix}${to}${suffix}`}>
      <span aria-hidden>
        {prefix}
        {value.toFixed(decimals)}
        {suffix}
      </span>
    </span>
  );
}
