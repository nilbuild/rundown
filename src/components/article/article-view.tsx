import "./article-view.css";

import { useApp } from "~/stores/app";
import { Markdown } from "~/components/markdown/markdown";
import { ArticleSkeleton, SkeletonLines } from "~/components/ui/skeleton";
import { ErrorState } from "~/components/ui/error-state";
import { openExternal } from "~/lib/api";
import { readingTime } from "~/utils/format";

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
        <div className="empty-state">
          <h2>No linked article</h2>
          <p>This is a discussion post, so everything is in the comments.</p>
        </div>
      );
    }
    return (
      <article className="reading" data-selection-source="article">
        <h1>{thread.title}</h1>
        <div className="byline">
          <span>{thread.author}</span>
        </div>
        <Markdown source={thread.text} />
      </article>
    );
  }

  if (loading && !article) {
    return (
      <article className="reading">
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
    <article className="reading">
      <h1>{article.title || thread.title}</h1>
      <div className="byline">
        {article.byline ? <span>{article.byline}</span> : null}
        {article.site_name ? <span>{article.site_name}</span> : null}
        <span>{readingTime(article.word_count)}</span>
        <button type="button" className="link" onClick={() => openExternal(article.url)}>
          Original ↗
        </button>
      </div>

      <section className="brief">
        <div className="brief-head">
          <span className="label">Brief</span>
          {brief.streaming ? (
            <button type="button" className="ghost-button" onClick={() => stopOutput("brief")}>
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="ghost-button"
              onClick={() => runOutput("brief", Boolean(brief.text))}
            >
              {brief.text ? "Regenerate" : "Summarise this article"}
            </button>
          )}
        </div>

        {brief.error ? (
          <div className="brief-error">
            <span>{brief.error}</span>
            <button type="button" onClick={() => runOutput("brief", true)}>
              Retry
            </button>
          </div>
        ) : null}

        {brief.streaming && !brief.text ? (
          <div className="brief-loading">
            <span className="pulse" />
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
