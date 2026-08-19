//! Checks every quote in a generated digest against the real thread.
//!
//! A quote that cannot be found in the comment it claims to come from is the
//! one failure mode that would make this whole app untrustworthy, so it is
//! checked mechanically rather than hoped about.

use crate::hn::Thread;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    /// Quote found verbatim in the cited comment.
    Exact,
    /// Found, but the model tidied whitespace or elided with an ellipsis.
    Loose,
    /// The comment exists but does not contain this text.
    Mismatch,
    /// No comment with that id in this thread.
    Unknown,
    /// Right text, wrong author attached.
    WrongAuthor,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Citation {
    pub comment_id: u64,
    pub claimed_author: String,
    pub actual_author: Option<String>,
    pub quote: String,
    pub status: Status,
}

/// A synthesis carries no verbatim quotes, so there is nothing to match. What
/// can still be proved is that every source it points at is real, which is what
/// catches an invented citation.
pub fn check_references(markdown: &str, thread: &Thread) -> Report {
    let known: std::collections::HashSet<u64> = crate::hn::flatten(&thread.comments)
        .into_iter()
        .map(|comment| comment.id)
        .collect();

    let mut citations: Vec<Citation> = Vec::new();
    let mut cursor = 0usize;
    while let Some(at) = markdown[cursor..].find("](hn:") {
        let start = cursor + at + 5;
        let end = match markdown[start..].find(')') {
            Some(offset) => start + offset,
            None => break,
        };
        cursor = end + 1;

        let comment_id: u64 = match markdown[start..end].trim().parse() {
            Ok(id) => id,
            Err(_) => continue,
        };
        if citations.iter().any(|c| c.comment_id == comment_id) {
            continue;
        }

        let exists = known.contains(&comment_id);
        citations.push(Citation {
            comment_id,
            claimed_author: String::new(),
            actual_author: None,
            quote: String::new(),
            status: if exists { Status::Exact } else { Status::Unknown },
        });
    }

    let exact = citations.iter().filter(|c| c.status == Status::Exact).count();
    let problems = citations.len() - exact;
    Report {
        citations,
        exact,
        loose: 0,
        problems,
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub citations: Vec<Citation>,
    pub exact: usize,
    pub loose: usize,
    pub problems: usize,
}

struct Indexed {
    author: Option<String>,
    normalized: String,
}

fn index(thread: &Thread) -> HashMap<u64, Indexed> {
    crate::hn::flatten(&thread.comments)
        .into_iter()
        .map(|comment| {
            (
                comment.id,
                Indexed {
                    author: comment.author.clone(),
                    normalized: normalize(&comment.text),
                },
            )
        })
        .collect()
}

/// Fold away everything a well-meaning model might change without changing
/// meaning: whitespace, smart punctuation, emphasis markers, case, markdown
/// link syntax, and HN's `[1]`-style footnote markers.
fn normalize(text: &str) -> String {
    let stripped = strip_markup(text);
    let mut out = String::with_capacity(stripped.len());
    let mut last_space = true;
    for ch in stripped.chars() {
        let ch = match ch {
            '\u{2018}' | '\u{2019}' | '\u{201B}' => '\'',
            '\u{201C}' | '\u{201D}' => '"',
            '\u{2013}' | '\u{2014}' | '\u{2212}' => '-',
            '\u{00A0}' => ' ',
            other => other,
        };
        if ch.is_whitespace() {
            if !last_space {
                out.push(' ');
                last_space = true;
            }
            continue;
        }
        if matches!(ch, '*' | '_' | '`' | '>') {
            continue;
        }
        last_space = false;
        for lower in ch.to_lowercase() {
            out.push(lower);
        }
    }
    out.trim().to_string()
}

/// Reduce `[label](url)` to `label`, `<url>` to `url`, and drop `[1]`-style
/// reference markers. Commenters use these constantly and a model quoting the
/// sentence around one will reasonably leave it out.
fn strip_markup(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut index = 0usize;

    while index < chars.len() {
        if chars[index] == '[' {
            if let Some(close) = find(&chars, index + 1, ']') {
                let label: String = chars[index + 1..close].iter().collect();
                let is_footnote =
                    !label.is_empty() && label.chars().all(|ch| ch.is_ascii_digit());
                let followed_by_link =
                    chars.get(close + 1) == Some(&'(') && find(&chars, close + 2, ')').is_some();

                if is_footnote && !followed_by_link {
                    index = close + 1;
                    continue;
                }
                if followed_by_link {
                    let paren_close = find(&chars, close + 2, ')').unwrap();
                    out.push_str(&label);
                    index = paren_close + 1;
                    continue;
                }
            }
        }

        if chars[index] == '<' {
            if let Some(close) = find(&chars, index + 1, '>') {
                let inner: String = chars[index + 1..close].iter().collect();
                if inner.starts_with("http") {
                    out.push_str(&inner);
                    index = close + 1;
                    continue;
                }
            }
        }

        out.push(chars[index]);
        index += 1;
    }

    out
}

fn find(chars: &[char], from: usize, needle: char) -> Option<usize> {
    // Bounded so a stray bracket cannot make this quadratic over a long comment.
    let limit = (from + 400).min(chars.len());
    (from..limit).find(|&index| chars[index] == needle)
}

/// Pull `> quote` blocks followed by a `— [@author](hn:id)` attribution.
fn extract(markdown: &str) -> Vec<(String, String, u64)> {
    let lines: Vec<&str> = markdown.lines().collect();
    let mut found = Vec::new();
    let mut index = 0usize;

    while index < lines.len() {
        if !lines[index].trim_start().starts_with('>') {
            index += 1;
            continue;
        }

        let mut quote = String::new();
        while index < lines.len() {
            let line = lines[index].trim_start();
            if !line.starts_with('>') {
                break;
            }
            let body = line.trim_start_matches('>').trim();
            if !body.is_empty() {
                if !quote.is_empty() {
                    quote.push(' ');
                }
                quote.push_str(body);
            }
            index += 1;
        }

        // The attribution follows within a couple of lines.
        let mut lookahead = index;
        let limit = (index + 3).min(lines.len());
        while lookahead < limit {
            if let Some((author, id)) = parse_attribution(lines[lookahead]) {
                if !quote.is_empty() {
                    found.push((quote.clone(), author, id));
                }
                break;
            }
            lookahead += 1;
        }
    }

    found
}

/// A model writing markdown will escape characters that would otherwise mean
/// something — `throwaway\_333` for an author called `throwaway_333`. That is
/// correct markdown, so the escapes come off before anything is compared.
fn unescape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars();
    while let Some(ch) = chars.next() {
        if ch != '\\' {
            out.push(ch);
            continue;
        }
        match chars.next() {
            // Only markdown's own escapes; a backslash in a name is kept.
            Some(next) if next.is_ascii_punctuation() => out.push(next),
            Some(next) => {
                out.push('\\');
                out.push(next);
            }
            None => out.push('\\'),
        }
    }
    out
}

fn parse_attribution(line: &str) -> Option<(String, u64)> {
    let start = line.find("[@")?;
    let rest = &line[start + 2..];
    let close = rest.find(']')?;
    let author = unescape(&rest[..close]);
    let after = &rest[close + 1..];
    if !after.starts_with("(hn:") {
        return None;
    }
    let tail = &after[4..];
    let end = tail.find(')')?;
    let id: u64 = tail[..end].trim().parse().ok()?;
    Some((author, id))
}

pub fn check(markdown: &str, thread: &Thread) -> Report {
    let comments = index(thread);
    let mut citations = Vec::new();

    for (quote, claimed_author, comment_id) in extract(markdown) {
        let normalized_quote = normalize(&quote);
        let status = match comments.get(&comment_id) {
            None => Status::Unknown,
            Some(comment) => {
                let author_ok = comment
                    .author
                    .as_deref()
                    .map(|actual| actual.eq_ignore_ascii_case(claimed_author.trim()))
                    .unwrap_or(false);

                if comment.normalized.contains(&normalized_quote) {
                    if author_ok {
                        Status::Exact
                    } else {
                        Status::WrongAuthor
                    }
                } else if nearly_present(&normalized_quote, &comment.normalized) {
                    if author_ok {
                        Status::Loose
                    } else {
                        Status::WrongAuthor
                    }
                } else {
                    Status::Mismatch
                }
            }
        };

        citations.push(Citation {
            comment_id,
            claimed_author: claimed_author.clone(),
            actual_author: comments
                .get(&comment_id)
                .and_then(|comment| comment.author.clone()),
            quote,
            status,
        });
    }

    let exact = citations.iter().filter(|c| c.status == Status::Exact).count();
    let loose = citations.iter().filter(|c| c.status == Status::Loose).count();
    let problems = citations.len() - exact - loose;

    Report {
        citations,
        exact,
        loose,
        problems,
    }
}

/// A quote that is not literally present may still be faithful: models elide
/// with an ellipsis and drop parentheticals. Accept it when nearly all of its
/// words appear in order inside a span not much longer than the quote itself.
///
/// The span guard is what stops this from rubber-stamping a fabricated
/// sentence assembled from common words scattered across a long comment.
fn nearly_present(quote: &str, haystack: &str) -> bool {
    let needle: Vec<&str> = quote.split_whitespace().collect();
    let hay: Vec<&str> = haystack.split_whitespace().collect();

    if needle.len() < 5 || hay.is_empty() {
        return false;
    }

    let mut cursor = 0usize;
    let mut matched = 0usize;
    let mut first: Option<usize> = None;
    let mut last = 0usize;

    for word in &needle {
        let found = hay[cursor..].iter().position(|candidate| candidate == word);
        let at = match found {
            Some(offset) => cursor + offset,
            None => continue,
        };
        if first.is_none() {
            first = Some(at);
        }
        last = at;
        matched += 1;
        cursor = at + 1;
    }

    let ratio = matched as f32 / needle.len() as f32;
    if ratio < 0.9 {
        return false;
    }

    let start = match first {
        Some(start) => start,
        None => return false,
    };

    // An ellipsis is the model declaring an omission, so each one buys slack in
    // how far the match may spread. Without one, the quote must be compact —
    // that is what stops scattered common words from passing as a sentence.
    let elisions = quote.matches("...").count() + quote.matches('\u{2026}').count();
    let allowed = (1.8 + 2.5 * elisions as f32).min(8.0);
    let span = last.saturating_sub(start) + 1;
    (span as f32 / needle.len() as f32) <= allowed
}

#[cfg(test)]
mod tests {
    use super::*;

    fn thread_with(id: u64, author: &str, text: &str) -> Thread {
        Thread {
            id: 1,
            title: "t".into(),
            url: None,
            domain: None,
            author: None,
            points: None,
            created_at: String::new(),
            text: None,
            comment_count: 1,
            comments: vec![crate::hn::Comment {
                id,
                author: Some(author.into()),
                html: String::new(),
                text: text.into(),
                created_at: String::new(),
                depth: 0,
                children: vec![],
                subtree_size: 1,
            }],
        }
    }

    fn digest(quote: &str, author: &str, id: u64) -> String {
        format!("> {quote}\n\n— [@{author}](hn:{id})\n")
    }

    #[test]
    fn exact_quote_passes() {
        let thread = thread_with(7, "alice", "Bandwidth is the wall, not capacity.");
        let report = check(&digest("Bandwidth is the wall, not capacity.", "alice", 7), &thread);
        assert_eq!(report.citations[0].status, Status::Exact);
    }

    #[test]
    fn dropped_footnote_marker_still_passes() {
        let thread = thread_with(7, "tinco", "From my evaluation[1] neither K3 nor Qwen is best.");
        let report = check(
            &digest("From my evaluation neither K3 nor Qwen is best.", "tinco", 7),
            &thread,
        );
        assert_eq!(report.citations[0].status, Status::Exact);
    }

    #[test]
    fn elided_middle_is_loose_not_a_failure() {
        let thread = thread_with(
            7,
            "bob",
            "The government said it would be better for us if we did more open models and \
             collaborated, and then the labs (according to me) changed their tune entirely.",
        );
        let report = check(
            &digest(
                "The government said it would be better for us if we did more open models and \
                 collaborated, and then the labs changed their tune entirely.",
                "bob",
                7,
            ),
            &thread,
        );
        assert_eq!(report.citations[0].status, Status::Loose);
    }

    #[test]
    fn fabricated_quote_is_caught() {
        let thread = thread_with(7, "alice", "I think the model is quite good for the price.");
        let report = check(
            &digest("The model is dangerously overhyped and nobody should use it.", "alice", 7),
            &thread,
        );
        assert_eq!(report.citations[0].status, Status::Mismatch);
    }

    #[test]
    fn scattered_words_do_not_count_as_a_quote() {
        let long = (0..80)
            .map(|index| {
                if index % 20 == 0 {
                    "model"
                } else if index % 20 == 7 {
                    "is"
                } else if index % 20 == 13 {
                    "good"
                } else {
                    "filler"
                }
            })
            .collect::<Vec<_>>()
            .join(" ");
        let thread = thread_with(7, "alice", &long);
        let report = check(&digest("model is good model is good", "alice", 7), &thread);
        assert_eq!(report.citations[0].status, Status::Mismatch);
    }

    #[test]
    fn declared_elisions_buy_span_but_do_not_excuse_invention() {
        let source = "unsloth started as a finetuning library with lots of optimisations so you \
                      could finetune on lower end hardware. Kind of OGs of the local community. \
                      Started by two brothers, a math wiz and a community builder. They have since \
                      gotten some VC backing, are active in quantising lots of models on release \
                      day, known for their optimised quants. They are really cool people and known \
                      in the local model places.";
        let thread = thread_with(7, "nl", source);

        let condensed = "unsloth started as a finetuning library with lots of optimisations so you \
                         could finetune on lower end hardware... known for their optimised \
                         quants... They are really cool people and known in the local model places.";
        let report = check(&digest(condensed, "nl", 7), &thread);
        assert_eq!(report.citations[0].status, Status::Loose);

        let invented = "unsloth started as a finetuning library... and the founders have since \
                        admitted their quants are unreliable and should not be trusted at all.";
        let report = check(&digest(invented, "nl", 7), &thread);
        assert_eq!(report.citations[0].status, Status::Mismatch);
    }

    #[test]
    fn reference_check_accepts_real_ids_and_flags_invented_ones() {
        let thread = thread_with(7, "alice", "Bandwidth is the wall.");
        let report = check_references(
            "Throughput is the constraint [1](hn:7), not capacity [2](hn:999).",
            &thread,
        );
        assert_eq!(report.citations.len(), 2);
        assert_eq!(report.exact, 1);
        assert_eq!(report.problems, 1);
        assert_eq!(report.citations[1].status, Status::Unknown);
    }

    #[test]
    fn reference_check_counts_each_source_once() {
        let thread = thread_with(7, "alice", "Bandwidth is the wall.");
        let report = check_references("One [1](hn:7) and again [2](hn:7).", &thread);
        assert_eq!(report.citations.len(), 1);
        assert_eq!(report.problems, 0);
    }

    #[test]
    fn an_escaped_underscore_in_a_name_is_not_a_wrong_author() {
        // `throwaway_333` has to be written `throwaway\_333` in markdown, and
        // comparing the escaped form against the real one flagged every such
        // author as a misattribution.
        let thread = thread_with(7, "throwaway_333", "Bandwidth is the wall.");
        let report = check(
            "> Bandwidth is the wall.\n\n— [@throwaway\\_333](hn:7)\n",
            &thread,
        );
        assert_eq!(report.citations[0].status, Status::Exact);
        assert_eq!(report.problems, 0);
    }

    #[test]
    fn wrong_author_is_flagged() {
        let thread = thread_with(7, "alice", "Bandwidth is the wall.");
        let report = check(&digest("Bandwidth is the wall.", "bob", 7), &thread);
        assert_eq!(report.citations[0].status, Status::WrongAuthor);
    }

    #[test]
    fn unknown_id_is_flagged() {
        let thread = thread_with(7, "alice", "Bandwidth is the wall.");
        let report = check(&digest("Bandwidth is the wall.", "alice", 999), &thread);
        assert_eq!(report.citations[0].status, Status::Unknown);
    }
}
