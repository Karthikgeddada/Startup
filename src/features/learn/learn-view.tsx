"use client";

import { ArrowLeft, BookOpen, ChevronDown, ChevronRight, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, SkeletonCard } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { useLearnDomains } from "@/hooks/use-services";
import { useLearnStore } from "@/stores/learn-store";

/**
 * Learn — the CURVIN software engineering curriculum. 16 domains with
 * real summary content, searchable, browsable, with chapters that open
 * inline. The last-visited domain is remembered across sessions.
 */
export function LearnView() {
  const domainsQuery = useLearnDomains();
  const [query, setQuery] = useState("");

  const activeDomainId = useLearnStore((state) => state.activeDomainId);
  const setActiveDomain = useLearnStore((state) => state.setActiveDomain);

  // Rehydrate persisted learn state after mount (no SSR mismatch).
  useEffect(() => {
    void useLearnStore.persist.rehydrate();
  }, []);

  const domains = domainsQuery.data;
  const activeDomain = domains?.find((domain) => domain.id === activeDomainId) ?? null;

  const filtered = useMemo(() => {
    if (!domains) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return domains;
    return domains.filter(
      (domain) =>
        domain.title.toLowerCase().includes(needle) ||
        domain.summary.toLowerCase().includes(needle),
    );
  }, [domains, query]);

  if (activeDomain) {
    return <DomainDetail domain={activeDomain} onBack={() => setActiveDomain(null)} />;
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pb-24 pt-10 md:px-8">
      <header className="max-w-2xl">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-foreground">Learn</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
          Sixteen domains that make you fluent in modern software engineering —
          from clean code and distributed systems to security and release discipline.
        </p>
      </header>

      <div className="mt-6 max-w-md">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search domains — systems, security, release…"
          icon={<Search className="h-4 w-4" aria-hidden />}
          aria-label="Search learning domains"
        />
      </div>

      {domainsQuery.isLoading ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<Search className="h-5 w-5" aria-hidden />}
            title={query.trim() ? `No domains match “${query.trim()}”` : "No domains available yet"}
            description={query.trim() ? "Try a different keyword — or clear the search to browse all sixteen." : undefined}
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((domain) => (
            <button
              key={domain.id}
              type="button"
              onClick={() => setActiveDomain(domain.id)}
              className="group block rounded-card text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label={`Open domain ${domain.title}`}
            >
              <Card className="h-full transition-all duration-200 ease-swift group-hover:border-border-strong group-hover:shadow-card">
                <CardBody className="flex h-full flex-col gap-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[14px] font-semibold text-foreground">{domain.title}</h3>
                    <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  </div>
                  <p className="line-clamp-3 text-[12.5px] leading-relaxed text-muted-foreground">
                    {domain.summary}
                  </p>
                  <p className="mt-auto pt-2 text-[11px] text-muted-foreground">
                    {domain.chapters.length} chapters · ~{domain.chapters.reduce((total, chapter) => total + chapter.minutes, 0)} minutes
                  </p>
                </CardBody>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DomainDetail({
  domain,
  onBack,
}: {
  domain: NonNullable<ReturnType<typeof useLearnDomains>["data"]>[number];
  onBack: () => void;
}) {
  const [openChapter, setOpenChapter] = useState<string | null>(domain.chapters[0]?.id ?? null);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-24 pt-10 md:px-8">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        All domains
      </button>

      <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-foreground">{domain.title}</h1>
      <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted-foreground">{domain.summary}</p>

      <div className="mt-8 flex flex-col gap-3">
        {domain.chapters.map((chapter) => {
          const open = openChapter === chapter.id;
          return (
            <div key={chapter.id} className="rounded-card border border-border bg-card">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenChapter(open ? null : chapter.id)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
              >
                {open ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium text-foreground">{chapter.title}</span>
                  <span className="block text-[11px] text-muted-foreground">~{chapter.minutes} minutes</span>
                </span>
              </button>
              {open ? (
                <div className="border-t border-border px-4 py-4">
                  <p className="text-[13px] leading-relaxed text-muted-foreground">{chapter.summary}</p>
                  {chapter.code ? (
                    <div className="mt-3">
                      <span className="text-[10.5px] font-medium uppercase tracking-wide text-subtle-foreground">
                        {chapter.code.language}
                      </span>
                      <pre className="mt-1.5 overflow-x-auto rounded-lg bg-muted p-3.5 font-mono text-[11.5px] leading-relaxed text-foreground">
                        {chapter.code.snippet}
                      </pre>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {domain.related.length > 0 ? (
        <div className="mt-6 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Related domains:</span>
          {domain.related.map((slug) => (
            <Badge key={slug} variant="outline">{slug}</Badge>
          ))}
        </div>
      ) : null}

      <p className="mt-8 flex items-center gap-1.5 text-[11.5px] text-subtle-foreground">
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        Next up in the curriculum is yours to choose — every domain stands alone.
      </p>
    </div>
  );
}
