import { redirect } from "next/navigation";

/**
 * Legacy /signup route — Offivex is invite-only via /apply.
 * This server-side redirect runs at request time before any client JS ships.
 * Also configured in next.config.js redirects() as a defense-in-depth (the
 * next.config rewrite handles it at the edge; this is the in-route fallback).
 */
export default function SignupRedirect(): never {
  redirect("/apply");
}
