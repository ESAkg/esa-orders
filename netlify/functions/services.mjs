import { SERVICES, json } from "../lib/core.mjs";

export default async () =>
  json({ services: SERVICES, bot: process.env.TG_BOT_USERNAME || null });

export const config = { path: "/api/services" };
