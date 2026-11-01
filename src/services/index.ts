import { env } from "@/config/env";
import { httpServices } from "@/services/http";
import { mockServices } from "@/services/mock";
import type { CurvinServices } from "@/services/types";

/**
 * Service registry — the single seam between UI and data.
 *
 * NEXT_PUBLIC_USE_MOCKS=true (or unset): local mock adapters with clearly
 * labelled demo data. No network calls leave the browser.
 * NEXT_PUBLIC_USE_MOCKS=false: HTTP adapters against NEXT_PUBLIC_API_BASE_URL.
 */
export const services: CurvinServices = env.NEXT_PUBLIC_USE_MOCKS ? mockServices : httpServices;

export { env };
