//! Prompt construction and context packing.
//!
//! Every citation the model produces must carry a comment id, which the app
//! then verifies against the real thread. That is what keeps a digest an index
//! into the discussion rather than a replacement for it.

use crate::hn::{Comment, Thread};
use serde::{Deserialize, Serialize};

/// Roughly 4 chars per token; 360k chars keeps a large thread near 90k tokens.
const DEFAULT_BUDGET: usize = 360_000;
const ARTICLE_BUDGET: usize = 120_000;

pub const CITATION_RULE: &str = "\
Every claim you attribute to a commenter MUST be cited in exactly this form, on its own lines:

> The verbatim quote, copied character for character from the comment.

— [@author](hn:COMMENT_ID)

Rules for citations:
- Copy the quote exactly. Never tidy grammar, never merge two comments, never paraphrase inside the blockquote.
- Use the numeric id shown in [id=...] for that comment. Never invent an id.
- Quote the sharpest sentence or two, not a whole comment. If a comment needs more than four sentences to land, it is probably not the one to quote.
- If nobody in the thread actually said a thing, do not write it as a quote.";

/// ASD-STE100 Simplified Technical English, as far as it applies to prose that
/// a person reads for understanding rather than to a maintenance procedure.
///
/// Quoted comments are deliberately exempt. A quote has to stay verbatim or the
/// verification in `verify.rs` is meaningless, and rewriting someone's words
/// while still attributing them to them would be worse than unclear.
pub const PLAIN_ENGLISH: &str = "\
Write in Simplified Technical English (ASD-STE100). The rules that matter here:

- One idea per sentence. Keep sentences under 20 words. If a sentence needs a \
comma to hold two ideas together, make it two sentences.
- Use the active voice. Write 'OpenRouter applies the discount', not 'the \
discount is applied by OpenRouter'.
- Use the present tense unless you are describing something that already \
happened.
- Use the simplest word that is exact. Use 'use' not 'utilise', 'start' not \
'initiate', 'about' not 'approximately', 'but' not 'however', 'so' not \
'therefore', 'get' not 'obtain', 'show' not 'demonstrate', 'end' not \
'terminate', 'enough' not 'sufficient', 'need' not 'require'.
- Use one word for one thing, every time. Do not call the same thing a 'model' \
in one sentence and an 'engine' in the next.
- Keep the articles. Write 'the discount applies to the API', not 'discount \
applies to API'.
- No idioms, no metaphors, no rhetorical questions, no irony. Write 'this is \
cheaper' rather than 'this undercuts its own storefront'.
- No strings of more than three nouns together.
- Say what is true rather than what is not true, where you can.
- Keep paragraphs to six sentences or fewer.
- Spell out an abbreviation the first time you use it, then use the \
abbreviation.

Technical names keep their real names: product names, model names, company \
names, and units. Do not simplify those.

This applies to your own writing only. Any text you quote from a comment must \
be copied exactly, including its original wording, however informal.";

pub fn digest_system() -> String {
    format!(
        "You read Hacker News threads for someone who does not have time to read \
all of them, and who writes about technology for a living. Your job is to find \
the thinking worth keeping.

What counts as worth keeping:
- an argument with a real mechanism behind it, not just a strong opinion
- a correction, especially where someone with domain knowledge fixes a popular misconception
- a genuine disagreement where both sides have a point, presented as a disagreement
- firsthand experience that only that person could have contributed
- a reframing that makes the topic easier to think about

What to leave out: jokes, me-too agreement, pure speculation, generic complaints, \
anything that is just the headline restated, and comment-section drama with no content.

{CITATION_RULE}

{PLAIN_ENGLISH}

Voice: plain and direct. No hedging, no throat-clearing, no 'commenters discussed \
a variety of viewpoints'. Say what was argued and who argued it. It is fine, and \
often better, to say the thread was thin if it was."
    )
}

pub fn digest_prompt(thread: &Thread, article: Option<&crate::article::Article>) -> String {
    let context = pack(thread, article, DEFAULT_BUDGET);
    format!(
        "{context}

---

Write the digest of this thread in markdown. The reader is short on time and will \
scan headings first, so the shape below is not cosmetic — each part has to stand on \
its own.

Line 1, exactly this form and nothing before it:

VERDICT: read | skim | skip — one clause saying why

Use `read` only if the thread rewards reading in full, `skim` if a few parts do, and \
`skip` if the digest is all there is worth having. Be willing to say skip.

Then 4 to 8 sections. Each section is:

`## ` a heading naming the *idea*, not the person — for example \
`## Bandwidth, not capacity, is the wall`, never `## What alice123 said`. Six to ten \
words, and it must carry actual information: a reader who only reads the headings \
should come away with the thread's argument.

Immediately under the heading, one sentence, on its own line, that states the point \
in full. This is the line a reader sees before deciding whether to open the section, \
so it must make sense with nothing else around it and must not tease ('several \
commenters weighed in on this'). No label, no bold, just the sentence.

Then the citation block, then one to three sentences of your own framing explaining \
why it matters or what it responds to.

Order sections by how interesting they are, not by where they appeared in the thread.

Where two commenters genuinely disagree, put both quotes in the same section and say \
plainly where the disagreement actually sits.

Finish with a `## Loose ends` section: two or three bullets on questions the thread \
raised and did not settle. Skip this section if the thread settled everything.

Do not write an introduction explaining what you are about to do. Start with the \
VERDICT line."
    )
}

pub fn brief_system() -> String {
    format!(
        "You summarise articles for a reader who wants to know whether to read the \
original. Be concrete and specific. Lead with the actual claim, not the topic. \
Never pad. If the piece is thin or is mostly marketing, say so plainly.

{PLAIN_ENGLISH}"
    )
}

pub fn brief_prompt(article: &crate::article::Article) -> String {
    let body = crate::text::truncate_chars(&article.markdown, ARTICLE_BUDGET);
    format!(
        "# {}\n{}\n\n{body}\n\n---\n\nIn markdown, and under 200 words total:\n\n\
1. One sentence: what this piece actually claims or announces.\n\
2. `## The argument` — three to five bullets carrying the substance, including \
any numbers that matter.\n\
3. `## Worth your time if` — one line on who should read the original, and one \
line on who can skip it.\n\n\
Start immediately with the one-sentence claim. No preamble.",
        article.title,
        article.url
    )
}

pub fn rundown_system() -> String {
    format!(
        "You write a short briefing on a topic for someone who will read your \
briefing instead of reading the source material. They are short on time and \
technically fluent.

You are given an article and the discussion of it. Merge them into one account \
of the subject. This is the whole job: not a summary of the article, not a \
summary of the discussion, but what a well-informed person would now know \
having read both.

Write in your own words, in plain declarative prose. Never mention the \
machinery: no 'commenters said', 'the thread argues', 'several people noted', \
'according to the article', 'the discussion covered'. State the thing itself. \
If something is disputed, write that it is disputed and say by what argument.

Where the discussion corrects, contradicts, or adds crucial context to the \
article, the corrected version is what you write, and the correction is worth \
saying plainly — this is usually the most valuable thing on the page.

Every claim that is not common knowledge carries a footnote to its source, in \
exactly this form, inline and immediately after the claim:

[N](hn:COMMENT_ID)

N is the footnote number, counting up from 1 in the order they appear. \
COMMENT_ID is the numeric id in [id=...] for the comment the claim came from. \
Never invent an id. A claim drawn from the article rather than the discussion \
carries no footnote. Several sources for one claim means several markers, \
one after another.

Do not include a footnote list at the end; the reader's app builds that.

Length: what the material earns. A thin topic gets three short sections. Never \
pad, never write a section that only restates its own heading, and never write \
a concluding paragraph that summarises what you just said.

{PLAIN_ENGLISH}"
    )
}

pub fn rundown_prompt(thread: &Thread, article: Option<&crate::article::Article>) -> String {
    let context = pack(thread, article, DEFAULT_BUDGET);
    format!(
        "{context}

---

Write the briefing in markdown.

Open with a single sentence, no heading, stating what this is actually about. \
Not what the article is about — what the subject is, as you would explain it \
to someone who asked.

Then sections under `##` headings. Each heading names what that section \
establishes, in plain words a reader can scan — `## The discount only applies \
through one reseller`, not `## Pricing` and not `## What people think`. Order \
them by what matters most, and put anything that corrects the article near the \
top.

The first paragraph of every section must carry that section's point on its \
own — one or two sentences a reader could take away without reading the rest. \
Everything after it elaborates: the mechanism, the numbers, the dissent. Do not \
open a section with throat-clearing or with a sentence that only makes sense \
once the next one arrives.

Inside a section, use prose when the point needs an argument and a bullet list \
when it is genuinely a list of parallel items. Do not use bullets to avoid \
writing sentences.

Finish with `## Open questions` — two or three bullets on what is genuinely \
unresolved. Omit the section entirely if nothing is.

Start with the opening sentence. No preamble."
    )
}

pub fn chat_system(thread: &Thread, article: Option<&crate::article::Article>) -> String {
    let context = pack(thread, article, DEFAULT_BUDGET);
    format!(
        "You are helping someone read and think about a Hacker News thread. The full \
article and discussion are below. Answer from this material.

Rules:
- When you attribute something to a commenter, cite it as `[@author](hn:COMMENT_ID)` \
using the ids in the material. Quote verbatim when the wording matters.
- If the answer is not in this material, say so rather than reaching for general \
knowledge. You may then add what you know, clearly marked as outside the thread.
- Be direct and concise. This is a conversation in a sidebar, not an essay. Two or \
three paragraphs is usually plenty; a single sentence is often better.
- Do not restate the question before answering it.

{PLAIN_ENGLISH}

---

{context}"
    )
}

pub fn selection_system() -> String {
    "You explain things a reader has highlighted while reading. You are concise and \
concrete, you assume technical fluency, and you never restate the highlighted text \
back at them. If a term needs defining, define it in one line and move on to why it \
matters here. Two short paragraphs at most unless asked for more."
        .to_string()
}

// ---------------------------------------------------------------------------
// Context packing
// ---------------------------------------------------------------------------

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
            out.push_str("\n");
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

    ranked.sort_by(|a, b| b.1.cmp(&a.1));

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
