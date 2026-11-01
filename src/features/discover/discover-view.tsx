"use client";

import Link from "next/link";
import { Compass } from "lucide-react";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { SkeletonCard } from "@/components/ui/feedback";
import { useDiscoverEntries } from "@/hooks/use-services";
import { cn } from "@/lib/utils";
import type { DiscoverEntry } from "@/types/domain";

/**
 * Discover — a curated map of what CURVIN connects to. Only integrations
 * that exist are actionable; planned ones are explicitly labeled Coming soon
 * with no interactive affordance, so nothing pretends to be available.
 */
export function DiscoverView() {
  const discoverQuery = useDiscoverEntries();
  const entries = discoverQuery.data ?? [];

  const grouped = useMemo(() => {
    const map = new Map<string, DiscoverEntry[]>();
    for (const entry of entries) {
      const list = map.get(entry.category) ?? [];
      list.push(entry);
      map.set(entry.category, list);
    }
    return Array.from(map.entries());
  }, [entries]);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pb-24 pt-10 md:px-8">
      <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-foreground">Discover</h1>
      <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
        A curated map of CURVIN's world — verified templates, official docs, and
        the integrations planned next. Availability is always labeled honestly.
      </p>

      {discoverQuery.isLoading ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-10">
          {grouped.map(([category, categoryEntries]) => (
            <section key={category} aria-labelledby={`discover-${category}`}>
              <h2
                id={`discover-${category}`}
                className="text-[15px] font-semibold tracking-[-0.01em] text-foreground"
              >
                {category}
              </h2>
              <div className="mt-3.5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {categoryEntries.map((entry) => {
                  const available = entry.status === "available";
                  return (
                    <Card
                      key={entry.id}
                      className={cn("h-full", !available && "border-dashed")}
                    >
                      <CardBody className="flex h-full flex-col gap-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-[14px] font-semibold text-foreground">{entry.title}</h3>
                          {available ? (
                            <Badge variant="success" dot>Available</Badge>
                          ) : (
                            <Badge variant="neutral">Coming soon</Badge>
                          )}
                        </div>
                        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                          {entry.description}
                        </p>
                        {available && entry.action ? (
                          <Link
                            href={entry.action.href}
                            className="mt-auto inline-flex w-fit rounded-pill border border-border px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors duration-150 ease-swift hover:border-border-strong hover:bg-subtle"
                          >
                            {entry.action.label}
                          </Link>
                        ) : (
                          <p className="mt-auto text-[11px] italic text-subtle-foreground">
                            In development — not yet available in CURVIN.
                          </p>
                        )}
                      </CardBody>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
          {grouped.length === 0 ? (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Compass className="h-4 w-4" aria-hidden />
              Nothing curated yet — check back soon.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
