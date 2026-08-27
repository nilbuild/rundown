use super::*;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PackStats {
    pub included: usize,
    pub total: usize,
    pub chars: usize,
}

/// Build the material block. When a thread exceeds the budget, comments are
/// dropped by a score that favours shallow, substantial, well-replied-to
/// comments — the ones a human would read first.
pub fn pack(
    thread: &Thread,
    article: Option<&crate::article::Article>,
    budget: usize,
) -> String {
    pack_with_stats(thread, article, budget).0
}

fn pack_with_stats(
    thread: &Thread,
    article: Option<&crate::article::Article>,
    budget: usize,
) -> (String, PackStats) {
    let mut out = String::with_capacity(budget.min(64 * 1024));

    if let Some(article) = article {
        if !article.markdown.is_empty() {
            out.push_str("<article>\n");
            out.push_str(&format!("title: {}\n", article.title));
            out.push_str(&format!("url: {}\n", article.url));
            if let Some(byline) = &article.byline {
                out.push_str(&format!("byline: {byline}\n"));
            }
            out.push('\n');
            out.push_str(&crate::text::truncate_chars(
                &article.markdown,
                ARTICLE_BUDGET,
            ));
            out.push_str("\n</article>\n\n");
        } else if let Some(note) = &article.note {
            out.push_str(&format!(
                "<article>\nurl: {}\nThe linked page could not be extracted: {note}\n</article>\n\n",
                article.url
            ));
        }
    }

    out.push_str("<thread>\n");
    out.push_str(&format!("title: {}\n", thread.title));
    out.push_str(&format!(
        "https://news.ycombinator.com/item?id={}\n",
        thread.id
    ));
    if let Some(points) = thread.points {
        out.push_str(&format!("{points} points\n"));
    }
    if let Some(author) = &thread.author {
        out.push_str(&format!("submitted by {author}\n"));
    }
    out.push_str(&format!("{} comments\n", thread.comment_count));

    if let Some(text) = &thread.text {
        out.push_str("\nSubmission text:\n");
        out.push_str(&crate::text::truncate_chars(text, 20_000));
        out.push('\n');
    }

    out.push_str("\nComments, in thread order. Indentation shows reply depth.\n\n");

    let remaining = budget.saturating_sub(out.len());
    let flat = crate::hn::flatten(&thread.comments);
    let keep = select(&flat, remaining);

    for comment in &flat {
        if !keep.contains(&comment.id) {
            continue;
        }
        out.push_str(&render(comment));
    }

    out.push_str("</thread>\n");

    let stats = PackStats {
        included: keep.len(),
        total: flat.len(),
        chars: out.len(),
    };
    (out, stats)
}

fn render(comment: &Comment) -> String {
    let indent = "  ".repeat(comment.depth.min(8) as usize);
    let author = comment.author.as_deref().unwrap_or("unknown");
    let body = comment
        .text
        .lines()
        .map(|line| format!("{indent}  {line}"))
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "{indent}[id={} by={author} depth={}]\n{body}\n\n",
        comment.id, comment.depth
    )
}

/// Pick which comments survive the budget. Cheap and deterministic.
fn select(flat: &[&Comment], budget: usize) -> std::collections::HashSet<u64> {
    let total: usize = flat.iter().map(|c| render(c).len()).sum();
    let mut keep = std::collections::HashSet::with_capacity(flat.len());

    if total <= budget {
        for comment in flat {
            keep.insert(comment.id);
        }
        return keep;
    }

    let mut ranked: Vec<(&&Comment, i64)> = flat
        .iter()
        .map(|comment| {
            let length = comment.text.len() as i64;
            // Substance, engagement, and shallowness all count for something.
            // Very short comments are almost always agreement or jokes.
            let substance = length.min(1_200);
            let engagement = (comment.subtree_size as i64 - 1) * 90;
            let depth_penalty = comment.depth as i64 * 55;
            let stub_penalty = if length < 90 { 400 } else { 0 };
            (comment, substance + engagement - depth_penalty - stub_penalty)
        })
        .collect();

    ranked.sort_by_key(|(_, score)| std::cmp::Reverse(*score));

    let mut used = 0usize;
    for (comment, _) in ranked {
        let size = render(comment).len();
        if used + size > budget {
            continue;
        }
        used += size;
        keep.insert(comment.id);
    }
    keep
}

pub fn pack_stats(thread: &Thread, article: Option<&crate::article::Article>) -> PackStats {
    pack_with_stats(thread, article, DEFAULT_BUDGET).1
}
