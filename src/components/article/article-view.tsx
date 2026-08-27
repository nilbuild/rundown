import { useApp } from "~/stores/app";
import { Markdown } from "~/components/markdown/markdown";
import { ArticleSkeleton } from "~/components/ui/article-skeleton";
import { SkeletonLines } from "~/components/ui/skeleton-lines";
import { ErrorState } from "~/components/ui/error-state";
import { openExternal } from "~/lib/api/shell";
import { readingTime } from "~/utils/format";
import { GhostButton } from "~/components/ui/ghost-button";
import { LinkButton } from "~/components/ui/link-button";

export function ArticleView() {
  const thread = useApp((state) => state.thread);
  const article = useApp((state) => state.article);
  const loading = useApp((state) => state.articleLoading);
  const error = useApp((state) => state.articleError);
  const brief = useApp((state) => state.outputs.brief);
  const runOutput = useApp((state) => state.runOutput);
  const stopOutput = useApp((state) => state.stopOutput);
  const retryArticle = useApp((state) => state.retryArticle);

  if (!thread) {
    return null;
  }

  if (!thread.url) {
    if (!thread.text) {
      return (
        <div className="mx-auto max-w-[420px] px-8 py-[90px] text-center text-balance [&_h2]:mb-2 [&_h2]:font-serif [&_h2]:text-[22px] [&_h2]:font-semibold [&_h2]:tracking-[-0.015em] [&_p]:mb-5 [&_p]:text-[13.5px] [&_p]:leading-[1.6] [&_p]:text-muted">
          <h2>No linked article</h2>
          <p>This is a discussion post, so everything is in the comments.</p>
        </div>
      );
    }
    return (
      <article className="mx-auto max-w-[660px] px-8 pt-[34px] pb-[120px] [&>h1]:mb-3 [&>h1]:font-serif [&>h1]:text-[30px] [&>h1]:leading-[1.2] [&>h1]:font-semibold [&>h1]:tracking-[-0.02em] [&_.md]:font-serif [&_.md]:text-[16.5px] [&_.md]:leading-[1.68] [&_.md]:text-fg-soft [&_.md_p]:mb-[1.05em] [&_.md_h1]:mt-[1.9em] [&_.md_h1]:mb-[0.6em] [&_.md_h1]:font-ui [&_.md_h1]:tracking-[-0.014em] [&_.md_h1]:text-fg [&_.md_h2]:mt-[1.9em] [&_.md_h2]:mb-[0.6em] [&_.md_h2]:font-ui [&_.md_h2]:text-lg [&_.md_h2]:tracking-[-0.014em] [&_.md_h2]:text-fg [&_.md_h3]:mt-[1.9em] [&_.md_h3]:mb-[0.6em] [&_.md_h3]:font-ui [&_.md_h3]:text-[15px] [&_.md_h3]:tracking-[-0.014em] [&_.md_h3]:text-fg [&_.md_img]:my-3 [&_.md_img]:rounded-lg [&_.md_blockquote]:my-[1.2em] [&_.md_blockquote]:border-l-2 [&_.md_blockquote]:border-line [&_.md_blockquote]:pl-[18px] [&_.md_blockquote]:text-muted" data-selection-source="article">
        <h1>{thread.title}</h1>
        <div className="mb-[30px] flex flex-wrap gap-3.5 text-xs text-muted">
          <span>{thread.author}</span>
        </div>
        <Markdown source={thread.text} />
      </article>
    );
  }

  if (loading && !article) {
    return (
      <article className="mx-auto max-w-[660px] px-8 pt-[34px] pb-[120px] [&>h1]:mb-3 [&>h1]:font-serif [&>h1]:text-[30px] [&>h1]:leading-[1.2] [&>h1]:font-semibold [&>h1]:tracking-[-0.02em] [&_.md]:font-serif [&_.md]:text-[16.5px] [&_.md]:leading-[1.68] [&_.md]:text-fg-soft [&_.md_p]:mb-[1.05em] [&_.md_h1]:mt-[1.9em] [&_.md_h1]:mb-[0.6em] [&_.md_h1]:font-ui [&_.md_h1]:tracking-[-0.014em] [&_.md_h1]:text-fg [&_.md_h2]:mt-[1.9em] [&_.md_h2]:mb-[0.6em] [&_.md_h2]:font-ui [&_.md_h2]:text-lg [&_.md_h2]:tracking-[-0.014em] [&_.md_h2]:text-fg [&_.md_h3]:mt-[1.9em] [&_.md_h3]:mb-[0.6em] [&_.md_h3]:font-ui [&_.md_h3]:text-[15px] [&_.md_h3]:tracking-[-0.014em] [&_.md_h3]:text-fg [&_.md_img]:my-3 [&_.md_img]:rounded-lg [&_.md_blockquote]:my-[1.2em] [&_.md_blockquote]:border-l-2 [&_.md_blockquote]:border-line [&_.md_blockquote]:pl-[18px] [&_.md_blockquote]:text-muted">
        <ArticleSkeleton />
      </article>
    );
  }

  if (error && !article) {
    return (
      <ErrorState
        title="Could not fetch the article"
        message={error}
        onRetry={() => retryArticle()}
        secondary={{ label: "Open in browser", onClick: () => openExternal(thread.url!) }}
      />
    );
  }

  if (!article) {
    return (
      <ErrorState
        title="Nothing to show"
        message="The article has not been loaded."
        onRetry={() => retryArticle()}
        secondary={{ label: "Open in browser", onClick: () => openExternal(thread.url!) }}
      />
    );
  }

  if (article.note) {
    return (
      <ErrorState
        title="This page is not readable text"
        message={article.note}
        onRetry={() => retryArticle()}
        retryLabel="Try again"
        secondary={{ label: "Open the original", onClick: () => openExternal(article.url) }}
      />
    );
  }

  return (
    <article className="mx-auto max-w-[660px] px-8 pt-[34px] pb-[120px] [&>h1]:mb-3 [&>h1]:font-serif [&>h1]:text-[30px] [&>h1]:leading-[1.2] [&>h1]:font-semibold [&>h1]:tracking-[-0.02em] [&_.md]:font-serif [&_.md]:text-[16.5px] [&_.md]:leading-[1.68] [&_.md]:text-fg-soft [&_.md_p]:mb-[1.05em] [&_.md_h1]:mt-[1.9em] [&_.md_h1]:mb-[0.6em] [&_.md_h1]:font-ui [&_.md_h1]:tracking-[-0.014em] [&_.md_h1]:text-fg [&_.md_h2]:mt-[1.9em] [&_.md_h2]:mb-[0.6em] [&_.md_h2]:font-ui [&_.md_h2]:text-lg [&_.md_h2]:tracking-[-0.014em] [&_.md_h2]:text-fg [&_.md_h3]:mt-[1.9em] [&_.md_h3]:mb-[0.6em] [&_.md_h3]:font-ui [&_.md_h3]:text-[15px] [&_.md_h3]:tracking-[-0.014em] [&_.md_h3]:text-fg [&_.md_img]:my-3 [&_.md_img]:rounded-lg [&_.md_blockquote]:my-[1.2em] [&_.md_blockquote]:border-l-2 [&_.md_blockquote]:border-line [&_.md_blockquote]:pl-[18px] [&_.md_blockquote]:text-muted">
      <h1>{article.title || thread.title}</h1>
      <div className="mb-[30px] flex flex-wrap gap-3.5 text-xs text-muted">
        {article.byline ? <span>{article.byline}</span> : null}
        {article.site_name ? <span>{article.site_name}</span> : null}
        <span>{readingTime(article.word_count)}</span>
        <LinkButton onClick={() => openExternal(article.url)}>
          Original ↗
        </LinkButton>
      </div>

      <section className="mt-1 mb-9 rounded-[10px] border border-[color-mix(in_srgb,var(--accent)_26%,transparent)] bg-[color-mix(in_srgb,var(--accent)_7%,var(--panel))] px-[18px] pt-3.5 pb-4 [&_.md]:mt-2.5 [&_.md]:font-ui [&_.md]:text-[13.5px] [&_.md]:leading-[1.6] [&_.md]:text-fg-soft [&_.md_p]:mb-2 [&_.md_ul]:mb-2 [&_.md_ol]:mb-2 [&_.md_h2]:mt-3.5 [&_.md_h2]:mb-[5px] [&_.md_h2]:font-ui [&_.md_h2]:text-[12.5px] [&_.md_h2]:font-semibold [&_.md_h2]:text-fg [&_.md_h3]:mt-3.5 [&_.md_h3]:mb-[5px] [&_.md_h3]:font-ui [&_.md_h3]:text-[12.5px] [&_.md_h3]:font-semibold [&_.md_h3]:text-fg [&_.md_code]:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-semibold tracking-[0.06em] text-accent uppercase">Brief</span>
          {brief.streaming ? (
            <GhostButton onClick={() => stopOutput("brief")}>
              Stop
            </GhostButton>
          ) : (
            <GhostButton
             
             
              onClick={() => runOutput("brief", Boolean(brief.text))}
            >
              {brief.text ? "Regenerate" : "Summarise this article"}
            </GhostButton>
          )}
        </div>

        {brief.error ? (
          <div className="mt-2.5 flex items-center gap-2.5 text-[12.5px] text-bad [&_button]:text-inherit [&_button]:underline">
            <span>{brief.error}</span>
            <button type="button" onClick={() => runOutput("brief", true)}>
              Retry
            </button>
          </div>
        ) : null}

        {brief.streaming && !brief.text ? (
          <div className="mt-3 flex items-start gap-2.5">
            <span className="size-[7px] shrink-0 rounded-full bg-accent animate-pulse-dot" />
            <SkeletonLines widths={[96, 88, 54]} height={11} gap={8} className="flex-1" />
          </div>
        ) : null}

        {brief.text ? <Markdown source={brief.text} /> : null}
      </section>

      <div data-selection-source="article">
        <Markdown source={article.markdown} />
      </div>
    </article>
  );
}
