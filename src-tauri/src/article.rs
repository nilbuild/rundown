//! Fetch a linked page and reduce it to readable markdown.

use anyhow::{anyhow, Result};
use dom_query::Document;
use dom_smoothie::{Config, Readability, TextMode};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Article {
    pub url: String,
    pub title: String,
    pub byline: Option<String>,
    pub site_name: Option<String>,
    pub excerpt: Option<String>,
    pub published_time: Option<String>,
    pub markdown: String,
    pub word_count: usize,
    /// Set when the page could not be reduced to an article body — a PDF, a
    /// video page, a login wall. The UI shows this instead of pretending.
    pub note: Option<String>,
    /// True when readability failed and this is the whole page's text instead
    /// of a clean article body. Worth reading, worth saying so.
    #[serde(default)]
    pub degraded: bool,
}

const MAX_BYTES: usize = 6 * 1024 * 1024;

/// Elements that never carry article text and only confuse the converter.
const JUNK: &str = "script, style, noscript, svg, iframe, form, button, input, \
                    select, textarea, canvas, video, audio, object, embed, \
                    template, aside[role=complementary]";

/// Block-level tags that a markdown link cannot legally wrap.
const BLOCKS: &str = "p, div, figure, figcaption, blockquote, table, ul, ol, li, \
                      h1, h2, h3, h4, h5, h6, article, section, header, footer, \
                      pre, hr, br";

pub async fn extract(url: &str) -> Result<Article> {
    let response = crate::hn::client()
        .get(url)
        .header("Accept", "text/html,application/xhtml+xml")
        .send()
        .await?;

    let final_url = response.url().to_string();
    let status = response.status();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();

    if !status.is_success() {
        return Err(anyhow!("{} returned HTTP {}", final_url, status.as_u16()));
    }

    if !content_type.is_empty() && !content_type.contains("html") && !content_type.contains("xml") {
        return Ok(unreadable(
            &final_url,
            format!("This link is {content_type}, not an article page."),
        ));
    }

    let bytes = response.bytes().await?;
    if bytes.len() > MAX_BYTES {
        return Ok(unreadable(
            &final_url,
            "Page is too large to extract.".into(),
        ));
    }
    let html = String::from_utf8_lossy(&bytes).to_string();

    let mut config = Config {
        text_mode: TextMode::Formatted,
        ..Default::default()
    };
    config.max_elements_to_parse = 60_000;

    let mut readability = match Readability::new(html.as_str(), Some(&final_url), Some(config)) {
        Ok(readability) => readability,
        Err(err) => return Ok(unreadable(&final_url, format!("Could not parse page: {err}"))),
    };

    // Readability looks for one dominant article body. Plenty of real pages do
    // not have one, and giving up there throws away text the reader can use.
    let parsed = match readability.parse() {
        Ok(parsed) => parsed,
        Err(_) => return Ok(whole_page(&html, &final_url)),
    };

    let cleaned = tidy_html(&parsed.content, &final_url);
    let markdown = match htmd::convert(&cleaned) {
        Ok(markdown) => markdown,
        Err(err) => {
            return Ok(unreadable(
                &final_url,
                format!("Could not convert the page to text ({err})."),
            ))
        }
    };
    let markdown = tidy_markdown(&markdown);
    let word_count = crate::text::word_count(&markdown);

    if word_count < 25 {
        return Ok(whole_page(&html, &final_url));
    }

    Ok(Article {
        url: final_url,
        title: parsed.title.clone(),
        byline: parsed.byline.clone(),
        site_name: parsed.site_name.clone(),
        excerpt: parsed.excerpt.clone(),
        published_time: parsed.published_time.clone(),
        markdown,
        word_count,
        note: None,
        degraded: false,
    })
}

/// Last resort when readability finds no article: convert the whole body, minus
/// the furniture. Noisier than a clean extraction, but a noisy page beats an
/// empty one, and the caller is told which it got.
fn whole_page(html: &str, url: &str) -> Article {
    let doc = Document::from(html);
    doc.select("nav, header, footer, aside, script, style, noscript, svg, iframe, form")
        .remove();

    let title = doc
        .select("title")
        .first()
        .text()
        .trim()
        .to_string();

    let body = match doc.select("body").first().try_html() {
        Some(html) => html.to_string(),
        None => return unreadable(url, "The page has no body content.".into()),
    };

    let cleaned = tidy_html(&body, url);
    let markdown = match htmd::convert(&cleaned) {
        Ok(markdown) => tidy_markdown(&markdown),
        Err(err) => return unreadable(url, format!("Could not convert the page to text ({err}).")),
    };
    let word_count = crate::text::word_count(&markdown);

    if word_count < 25 {
        return unreadable(
            url,
            "The page had almost no extractable text — it may be a video, an app, or paywalled."
                .into(),
        );
    }

    Article {
        url: url.to_string(),
        title,
        byline: None,
        site_name: crate::hn::domain_of(url),
        excerpt: None,
        published_time: None,
        markdown,
        word_count,
        note: None,
        degraded: true,
    }
}

/// Normalise the extracted HTML before conversion.
///
/// Two problems make converters emit broken markdown, and both are fixed here
/// rather than patched up afterwards:
/// - an `<a>` wrapping block content (embeds, cards) has no markdown spelling,
///   so it must be unwrapped or the whole block ends up inside `[...]`
/// - `<img>` carrying `srcset`, sizing and framework attributes survives as a
///   raw tag, which then shows up as literal text in the reader
fn tidy_html(html: &str, base: &str) -> String {
    let doc = Document::fragment(html);

    doc.select(JUNK).remove();

    for image in doc.select("img").iter() {
        image.retain_attrs(&["src", "alt"]);
        match image.attr("src") {
            Some(src) => {
                if let Some(absolute) = absolutise(&src, base) {
                    image.set_attr("src", &absolute);
                }
            }
            None => image.remove(),
        }
    }

    for anchor in doc.select("a").iter() {
        match anchor.attr("href") {
            Some(href) => {
                if let Some(absolute) = absolutise(&href, base) {
                    anchor.set_attr("href", &absolute);
                }
                anchor.retain_attrs(&["href"]);
            }
            None => {
                let inner = anchor.inner_html();
                anchor.replace_with_html(inner);
                continue;
            }
        }

        if anchor.select(BLOCKS).exists() {
            let inner = anchor.inner_html();
            anchor.replace_with_html(inner);
        }
    }

    // Attributes the converter does not read but that bloat the tree.
    doc.select("*").remove_attrs(&["class", "style", "id", "data-testid", "role"]);

    doc.inner_html().to_string()
}

fn absolutise(candidate: &str, base: &str) -> Option<String> {
    let trimmed = candidate.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return None;
    }
    let base = reqwest::Url::parse(base).ok()?;
    base.join(trimmed).ok().map(|url| url.to_string())
}

fn unreadable(url: &str, note: String) -> Article {
    Article {
        url: url.to_string(),
        title: String::new(),
        byline: None,
        site_name: crate::hn::domain_of(url),
        excerpt: None,
        published_time: None,
        markdown: String::new(),
        word_count: 0,
        note: Some(note),
        degraded: false,
    }
}

/// Last line of defence: no raw tag should ever reach the reader as text.
fn tidy_markdown(text: &str) -> String {
    let stripped = strip_stray_tags(text);
    let mut out = String::with_capacity(stripped.len());
    let mut blank_run = 0usize;
    let mut in_fence = false;

    for line in stripped.lines() {
        if line.trim_start().starts_with("```") {
            in_fence = !in_fence;
        }
        let trimmed = if in_fence {
            line.to_string()
        } else {
            line.trim_end().to_string()
        };
        if trimmed.trim().is_empty() && !in_fence {
            blank_run += 1;
            if blank_run > 1 {
                continue;
            }
        } else {
            blank_run = 0;
        }
        out.push_str(&trimmed);
        out.push('\n');
    }
    out.trim().to_string()
}

fn strip_stray_tags(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut index = 0usize;
    let mut in_fence = false;

    while index < chars.len() {
        if chars[index] == '`' {
            let run = chars[index..].iter().take_while(|c| **c == '`').count();
            if run >= 3 {
                in_fence = !in_fence;
            }
            for _ in 0..run {
                out.push('`');
            }
            index += run;
            continue;
        }

        if !in_fence && chars[index] == '<' {
            if let Some(close) = looks_like_tag(&chars, index) {
                index = close + 1;
                continue;
            }
        }

        out.push(chars[index]);
        index += 1;
    }
    out
}

/// Only treat `<...>` as a tag when it opens with a tag name, so autolinks
/// (`<https://example.com>`) and stray comparisons survive untouched.
fn looks_like_tag(chars: &[char], start: usize) -> Option<usize> {
    let mut cursor = start + 1;
    if chars.get(cursor) == Some(&'/') {
        cursor += 1;
    }
    let name_start = cursor;
    while cursor < chars.len() && (chars[cursor].is_ascii_alphanumeric() || chars[cursor] == '-') {
        cursor += 1;
    }
    if cursor == name_start {
        return None;
    }
    let name: String = chars[name_start..cursor].iter().collect::<String>().to_lowercase();
    if !KNOWN_TAGS.contains(&name.as_str()) {
        return None;
    }
    // A tag can carry attributes with `>` inside quotes, so scan with awareness.
    let mut quote: Option<char> = None;
    while cursor < chars.len() {
        let ch = chars[cursor];
        match quote {
            Some(open) if ch == open => quote = None,
            Some(_) => {}
            None if ch == '"' || ch == '\'' => quote = Some(ch),
            None if ch == '>' => return Some(cursor),
            None if ch == '<' => return None,
            None => {}
        }
        cursor += 1;
    }
    None
}

const KNOWN_TAGS: &[&str] = &[
    "a", "abbr", "address", "area", "article", "aside", "audio", "b", "base", "bdi", "bdo", "big",
    "blockquote", "body", "br", "button", "canvas", "caption", "cite", "code", "col", "colgroup",
    "data", "datalist", "dd", "del", "details", "dfn", "dialog", "div", "dl", "dt", "em", "embed",
    "fieldset", "figcaption", "figure", "font", "footer", "form", "h1", "h2", "h3", "h4", "h5",
    "h6", "head", "header", "hgroup", "hr", "html", "i", "iframe", "img", "input", "ins", "kbd",
    "label", "legend", "li", "link", "main", "map", "mark", "menu", "meta", "meter", "nav",
    "noscript", "object", "ol", "optgroup", "option", "output", "p", "param", "picture", "pre",
    "progress", "q", "rp", "rt", "ruby", "s", "samp", "script", "section", "select", "small",
    "source", "span", "strong", "style", "sub", "summary", "sup", "svg", "table", "tbody", "td",
    "template", "textarea", "tfoot", "th", "thead", "time", "title", "tr", "track", "u", "ul",
    "var", "video", "wbr",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn block_level_anchor_is_unwrapped() {
        let html = r#"<div><a href="https://x.com/a/1"><div><img src="/pic.png" alt="pic"><p>Some embedded card text</p></div></a></div>"#;
        let markdown = htmd::convert(&tidy_html(html, "https://example.com/post")).unwrap();
        assert!(!markdown.contains("<img"), "raw img leaked: {markdown}");
        assert!(
            !markdown.contains("](https://x.com/a/1)"),
            "block content stayed inside a link: {markdown}"
        );
        assert!(markdown.contains("Some embedded card text"));
        assert!(markdown.contains("https://example.com/pic.png"));
    }

    #[test]
    fn images_keep_only_src_and_alt() {
        let html = r#"<p><img src="/a.png" alt="a" srcset="/a.png 1x, /b.png 2x" width="40" height="40" draggable="false"></p>"#;
        let cleaned = tidy_html(html, "https://example.com/");
        assert!(!cleaned.contains("srcset"));
        assert!(!cleaned.contains("draggable"));
        let markdown = htmd::convert(&cleaned).unwrap();
        assert!(markdown.contains("![a](https://example.com/a.png)"), "{markdown}");
    }

    #[test]
    fn inline_anchor_survives() {
        let html = r#"<p>Read <a href="/post">this post</a> now.</p>"#;
        let markdown = htmd::convert(&tidy_html(html, "https://example.com/x")).unwrap();
        assert!(markdown.contains("[this post](https://example.com/post)"), "{markdown}");
    }

    #[test]
    fn a_page_with_no_single_article_body_still_yields_its_text() {
        // Readability wants one dominant block. A page of equal-weight sections
        // has none, and giving up there loses text the reader can use.
        let sections: String = (0..6)
            .map(|i| {
                format!(
                    "<section><h2>Part {i}</h2><p>{}</p></section>",
                    "This sentence carries real content that a reader would want to keep. "
                        .repeat(3)
                )
            })
            .collect();
        let html = format!(
            "<html><head><title>Many parts</title></head><body><nav>skipnav</nav>{sections}<footer>skipfoot</footer></body></html>"
        );

        let article = whole_page(&html, "https://example.com/p");
        assert!(article.degraded, "should be marked as a rough extraction");
        assert!(article.note.is_none(), "it is readable, so no failure note");
        assert!(article.word_count > 50, "got {} words", article.word_count);
        assert_eq!(article.title, "Many parts");
        assert!(!article.markdown.contains("skipnav"), "nav should be gone");
        assert!(!article.markdown.contains("skipfoot"), "footer should be gone");
    }

    #[test]
    fn a_page_with_no_text_is_reported_rather_than_faked() {
        let article = whole_page(
            "<html><head><title>App</title></head><body><div id=\"root\"></div></body></html>",
            "https://example.com/app",
        );
        assert!(article.note.is_some());
        assert_eq!(article.word_count, 0);
    }

    #[test]
    fn stray_tags_are_stripped_but_autolinks_are_not() {
        let input = "Text <img src=\"x.png\"> more <span>and</span> <https://example.com> end";
        let out = strip_stray_tags(input);
        assert!(!out.contains("<img"));
        assert!(!out.contains("<span>"));
        assert!(out.contains("<https://example.com>"), "{out}");
    }

    #[test]
    fn comparisons_and_code_fences_are_left_alone() {
        let input = "if a < b and c > d\n\n```\nlet x: Vec<String> = vec![];\n<img not stripped>\n```";
        let out = strip_stray_tags(input);
        assert!(out.contains("a < b"));
        assert!(out.contains("Vec<String>"));
        assert!(out.contains("<img not stripped>"), "fenced code was altered: {out}");
    }
}
