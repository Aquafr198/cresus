"use client";

import { motion, type Variants } from "motion/react";

/**
 * Animated SVG icons built on motion/react.
 *
 * Pattern : each icon is a motion.svg root with sub-paths animated via
 * `variants` driven by the parent's `whileHover` / `animate` props. Drop
 * each icon inside a `group` parent that triggers `whileHover` and the
 * sub-paths animate on hover. Subtle idle animations also defined so the
 * icons feel alive even when not hovered.
 *
 * Usage:
 *   <div className="group">
 *     <AnimatedNetworkIcon />
 *   </div>
 *
 * Premium feel : stroke-based, currentColor for theming, ~280ms cubic
 * springs. No bouncy / playful defaults — sharp + measured.
 */

const easing = [0.16, 1, 0.3, 1] as const;

/* ============================================================
   Network — 3 nodes pulse + connecting lines draw on hover
   ============================================================ */
const NETWORK_NODE: Variants = {
  initial: { scale: 1, opacity: 0.85 },
  hover: (i: number) => ({
    scale: [1, 1.25, 1],
    opacity: [0.85, 1, 0.85],
    transition: { duration: 0.7, delay: i * 0.08, ease: easing, repeat: Infinity, repeatDelay: 1.2 },
  }),
};
const NETWORK_LINE: Variants = {
  initial: { pathLength: 1, opacity: 0.4 },
  hover: (i: number) => ({
    pathLength: [0.3, 1],
    opacity: [0.4, 1, 0.4],
    transition: { duration: 0.9, delay: i * 0.06, ease: easing, repeat: Infinity, repeatDelay: 0.6 },
  }),
};

export function AnimatedNetworkIcon() {
  return (
    <motion.svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" initial="initial" whileHover="hover">
      <motion.path
        d="M10.5 6.5 6.5 16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        variants={NETWORK_LINE}
        custom={0}
      />
      <motion.path
        d="M13.5 6.5l4 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        variants={NETWORK_LINE}
        custom={1}
      />
      <motion.path
        d="M7.5 18h9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        variants={NETWORK_LINE}
        custom={2}
      />
      <motion.circle cx="12" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5" variants={NETWORK_NODE} custom={0} />
      <motion.circle cx="5" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.5" variants={NETWORK_NODE} custom={1} />
      <motion.circle cx="19" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.5" variants={NETWORK_NODE} custom={2} />
    </motion.svg>
  );
}

/* ============================================================
   Shield + checkmark — checkmark draws + shield subtle pulse
   ============================================================ */
export function AnimatedShieldIcon() {
  return (
    <motion.svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" initial="initial" whileHover="hover" animate="idle">
      <motion.path
        d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        variants={{
          initial: { scale: 1 },
          idle: { scale: [1, 1.03, 1], transition: { duration: 2.4, ease: easing, repeat: Infinity } },
          hover: { scale: 1.06, transition: { duration: 0.28, ease: easing } },
        }}
        style={{ transformOrigin: "12px 12px" }}
      />
      <motion.path
        d="m9 12 2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={{
          initial: { pathLength: 1, opacity: 1 },
          hover: {
            pathLength: [0, 1],
            opacity: [0, 1],
            transition: { duration: 0.42, ease: easing },
          },
        }}
      />
    </motion.svg>
  );
}

/* ============================================================
   Bars — 4 bars stagger-grow on hover
   ============================================================ */
const BARS_REST: { x: number; restH: number; restY: number; hoverH: number; hoverY: number }[] = [
  { x: 3, restH: 6, restY: 15, hoverH: 7, hoverY: 14 },
  { x: 8, restH: 10, restY: 11, hoverH: 12, hoverY: 9 },
  { x: 13, restH: 8, restY: 13, hoverH: 10, hoverY: 11 },
  { x: 18, restH: 14, restY: 7, hoverH: 17, hoverY: 4 },
];

export function AnimatedBarsIcon() {
  return (
    <motion.svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" initial="initial" whileHover="hover">
      {BARS_REST.map((b, i) => (
        <motion.rect
          key={i}
          x={b.x}
          width="3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          variants={{
            initial: { y: b.restY, height: b.restH },
            hover: {
              y: b.hoverY,
              height: b.hoverH,
              transition: { duration: 0.32, delay: i * 0.05, ease: easing },
            },
          }}
        />
      ))}
    </motion.svg>
  );
}

/* ============================================================
   Gift — bow wiggle + box subtle lift
   ============================================================ */
export function AnimatedGiftIcon() {
  return (
    <motion.svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" initial="initial" whileHover="hover">
      {/* Box */}
      <motion.rect
        x="3"
        y="8"
        width="18"
        height="13"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        variants={{
          initial: { y: 0 },
          hover: { y: -0.6, transition: { duration: 0.25, ease: easing } },
        }}
      />
      <motion.path
        d="M3 13h18"
        stroke="currentColor"
        strokeWidth="1.5"
        variants={{
          initial: { opacity: 0.8 },
          hover: { opacity: 1, transition: { duration: 0.2 } },
        }}
      />
      <motion.line
        x1="12"
        y1="8"
        x2="12"
        y2="21"
        stroke="currentColor"
        strokeWidth="1.5"
        variants={{
          initial: { opacity: 0.8 },
          hover: { opacity: 1, transition: { duration: 0.2 } },
        }}
      />
      {/* Bow */}
      <motion.path
        d="M12 8a3 3 0 1 0-5 0 5 5 0 0 0 5 0 5 5 0 0 0 5 0 3 3 0 1 0-5 0z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="none"
        variants={{
          initial: { rotate: 0 },
          hover: {
            rotate: [0, -10, 10, -6, 6, 0],
            transition: { duration: 0.7, ease: easing },
          },
        }}
        style={{ transformOrigin: "12px 6px" }}
      />
    </motion.svg>
  );
}

/* ============================================================
   Rocket — slight lift + smoke pulse
   ============================================================ */
export function AnimatedRocketIcon() {
  return (
    <motion.svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" initial="initial" whileHover="hover">
      <motion.path
        d="M14 6 8 12l-4 4 4 4 4-4 6-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={{
          initial: { y: 0 },
          hover: {
            y: [0, -2, 0],
            transition: { duration: 0.6, ease: easing, repeat: Infinity, repeatDelay: 0.8 },
          },
        }}
      />
      <motion.path
        d="M16 8a4 4 0 1 0-4-4l8 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={{
          initial: { y: 0 },
          hover: {
            y: [0, -2, 0],
            transition: { duration: 0.6, ease: easing, repeat: Infinity, repeatDelay: 0.8 },
          },
        }}
      />
      {/* Exhaust pulse */}
      <motion.circle
        cx="6"
        cy="18"
        r="1.2"
        fill="currentColor"
        variants={{
          initial: { opacity: 0, scale: 0.4 },
          hover: {
            opacity: [0, 0.7, 0],
            scale: [0.4, 1.4, 0.4],
            transition: { duration: 0.55, repeat: Infinity, ease: easing },
          },
        }}
      />
    </motion.svg>
  );
}

/* ============================================================
   Wallet — flap opens on hover
   ============================================================ */
export function AnimatedWalletIcon() {
  return (
    <motion.svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" initial="initial" whileHover="hover">
      <rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <motion.path
        d="M3 10h18"
        stroke="currentColor"
        strokeWidth="1.5"
        variants={{
          initial: { opacity: 0.7 },
          hover: { opacity: 1 },
        }}
      />
      <motion.circle
        cx="17"
        cy="13"
        r="1.2"
        fill="currentColor"
        variants={{
          initial: { scale: 1, opacity: 0.7 },
          hover: { scale: [1, 1.35, 1], opacity: [0.7, 1, 0.7], transition: { duration: 0.55, ease: easing, repeat: Infinity, repeatDelay: 0.8 } },
        }}
      />
    </motion.svg>
  );
}
