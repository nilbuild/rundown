//! HN comment markup -> markdown.
//!
//! Comments are converted rather than rendered as raw HTML so the frontend can
//! use the same markdown renderer everywhere and never needs `innerHTML`.

use scraper::{ElementRef, Html, Node};

pub fn html_to_text(html: &str) -> String {
    if html.trim().is_empty() {
        return String::new();
    }
    let fragment = Html::parse_fragment(html);
    let mut out = String::new();
    for child in fragment.root_element().children() {
        walk(child, &mut out);
    }
    tidy(&out)
}

fn walk(node: ego_tree::NodeRef<'_, Node>, out: &mut String) {
    match node.value() {
        Node::Text(text) => {
            out.push_str(text);
        }
        Node::Element(element) => {
            let name = element.name();
            let el = match ElementRef::wrap(node) {
                Some(el) => el,
                None => return,
            };
            match name {
                "p" => {
                    out.push_str("\n\n");
                    for child in el.children() {
                        walk(child, out);
                    }
                }
                "br" => out.push('\n'),
                "i" | "em" => wrap_inline(el, "*", out),
                "b" | "strong" => wrap_inline(el, "**", out),
                "code" => {
                    // A <code> inside <pre> is handled by the <pre> arm.
                    let inner = inner_text(el);
                    out.push('`');
                    out.push_str(inner.trim_end_matches('\n'));
                    out.push('`');
                }
                "pre" => {
                    let inner = inner_text(el);
                    let body = dedent(inner.trim_end_matches('\n'));
                    out.push_str("\n\n```\n");
                    out.push_str(&body);
                    out.push_str("\n```\n\n");
                }
                "a" => {
                    let href = element.attr("href").unwrap_or_default();
                    let label = inner_text(el);
                    let label = label.trim();
                    if href.is_empty() || label.is_empty() {
                        out.push_str(label);
                    } else if label == href || href.starts_with(label.trim_end_matches("...")) {
                        // HN truncates long link text; the href is the real value.
                        out.push('<');
                        out.push_str(href);
                        out.push('>');
                    } else {
                        out.push('[');
                        out.push_str(label);
                        out.push_str("](");
                        out.push_str(href);
                        out.push(')');
                    }
                }
                _ => {
                    for child in el.children() {
                        walk(child, out);
                    }
                }
            }
        }
        _ => {}
    }
}

fn wrap_inline(el: ElementRef<'_>, marker: &str, out: &mut String) {
    let inner = inner_text(el);
    let trimmed = inner.trim();
    if trimmed.is_empty() {
        return;
    }
    out.push_str(marker);
    out.push_str(trimmed);
    out.push_str(marker);
}

fn inner_text(el: ElementRef<'_>) -> String {
    let mut buffer = String::new();
    for child in el.children() {
        collect_text(child, &mut buffer);
    }
    buffer
}

fn collect_text(node: ego_tree::NodeRef<'_, Node>, out: &mut String) {
    match node.value() {
        Node::Text(text) => out.push_str(text),
        Node::Element(_) => {
            if let Some(el) = ElementRef::wrap(node) {
                if el.value().name() == "br" {
                    out.push('\n');
                    return;
                }
                for child in el.children() {
                    collect_text(child, out);
                }
            }
        }
        _ => {}
    }
}

/// HN indents code blocks by two spaces. Strip the common prefix so fenced
/// blocks do not render with phantom indentation.
fn dedent(text: &str) -> String {
    let indent = text
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| line.len() - line.trim_start().len())
        .min()
        .unwrap_or(0);
    if indent == 0 {
        return text.to_string();
    }
    text.lines()
        .map(|line| {
            if line.len() >= indent {
                &line[indent..]
            } else {
                line.trim_start()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn tidy(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut blank_run = 0usize;
    for line in text.lines() {
        let trimmed = line.trim_end();
        if trimmed.trim().is_empty() {
            blank_run += 1;
            if blank_run > 1 {
                continue;
            }
            out.push('\n');
        } else {
            blank_run = 0;
            out.push_str(trimmed);
            out.push('\n');
        }
    }
    out.trim().to_string()
}

/// Cheap word count used for reading-time estimates.
pub fn word_count(text: &str) -> usize {
    text.split_whitespace().count()
}

/// Truncate on a character boundary, appending a marker when cut.
pub fn truncate_chars(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let mut out: String = text.chars().take(max).collect();
    out.push_str("\n\n[… truncated …]");
    out
}
