import { env } from "@/config/env";
import { httpServices } from "@/services/http";
import { mockServices } from "@/services/mock";
import type { CurvinServices } from "@/services/types";

/**
 * Service registry — the single seam between UI and data.
 *
 * NEXT_PUBLIC_USE_MOCKS=true (or unset): local mock adapters with clearly
 * labelled demo data. No network calls leave the browser.
 * NEXT_PUBLIC_USE_MOCKS=false: live HTTP adapters against
 * NEXT_PUBLIC_API_BASE_URL (projects, conversations, agent turns over SSE,
 * activity, recents, search, github). Learn & Discover stay on the static
 * content library in both modes — there is no content backend yet — so no
 * page ever shows fabricated data masquerading as live results.
 */
export const services: CurvinServices = env.NEXT_PUBLIC_USE_MOCKS
  ? mockServices
  : {
      ...mockServices, // learn + discover (static educational content)
      ...httpServices, // real data services
    };

export { env };
