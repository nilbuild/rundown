//! Hacker News data access.
//!
//! Two upstreams are used deliberately:
//! - the official Firebase API for feed ordering, because it is real-time
//! - Algolia for comment trees, because `items/<id>` returns the whole nested
//!   thread in a single request instead of N+1 walks over `kids`

use anyhow::{anyhow, Result};
use futures::future::join_all;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use std::time::Duration;

const FIREBASE: &str = "https://hacker-news.firebaseio.com/v0";
const ALGOLIA: &str = "https://hn.algolia.com/api/v1";

pub fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent("sift/0.1 (macOS Hacker News client)")
            .timeout(Duration::from_secs(25))
            .build()
            .expect("http client")
    })
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Story {
    pub id: u64,
    pub title: String,
    pub url: Option<String>,
    pub domain: Option<String>,
    pub by: String,
    pub score: i64,
    pub descendants: i64,
    pub time: i64,
    pub text: Option<String>,
    pub kind: String,
}

#[derive(Deserialize)]
struct FirebaseItem {
    id: u64,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    by: Option<String>,
    #[serde(default)]
    score: Option<i64>,
    #[serde(default)]
    descendants: Option<i64>,
    #[serde(default)]
    time: Option<i64>,
    #[serde(default)]
    text: Option<String>,
    #[serde(rename = "type", default)]
    kind: Option<String>,
}

impl From<FirebaseItem> for Story {
    fn from(item: FirebaseItem) -> Self {
        let domain = item.url.as_deref().and_then(domain_of);
        Story {
            id: item.id,
            title: item.title.unwrap_or_else(|| "(untitled)".into()),
            url: item.url,
            domain,
            by: item.by.unwrap_or_else(|| "unknown".into()),
            score: item.score.unwrap_or(0),
            descendants: item.descendants.unwrap_or(0),
            time: item.time.unwrap_or(0),
            text: item.text,
            kind: item.kind.unwrap_or_else(|| "story".into()),
        }
    }
}

pub fn domain_of(url: &str) -> Option<String> {
    let rest = url.split_once("://").map(|(_, r)| r).unwrap_or(url);
    let host = rest.split('/').next()?;
    let host = host.split('@').next_back()?;
    let host = host.split(':').next()?;
    let host = host.strip_prefix("www.").unwrap_or(host);
    if host.is_empty() {
        return None;
    }
    Some(host.to_string())
}

fn feed_path(feed: &str) -> Result<&'static str> {
    match feed {
        "top" => Ok("topstories"),
        "best" => Ok("beststories"),
        "new" => Ok("newstories"),
        "ask" => Ok("askstories"),
        "show" => Ok("showstories"),
        "jobs" => Ok("jobstories"),
        other => Err(anyhow!("unknown feed: {other}")),
    }
}

pub async fn feed_ids(feed: &str) -> Result<Vec<u64>> {
    let url = format!("{FIREBASE}/{}.json", feed_path(feed)?);
    let ids: Vec<u64> = client().get(url).send().await?.json().await?;
    Ok(ids)
}

pub async fn story(id: u64) -> Result<Story> {
    let url = format!("{FIREBASE}/item/{id}.json");
    let item: FirebaseItem = client().get(url).send().await?.json().await?;
    Ok(item.into())
}

/// Fetch one page of a feed. Item lookups run concurrently; a story that fails
/// to load is dropped rather than failing the whole page.
pub async fn feed_page(feed: &str, offset: usize, limit: usize) -> Result<Vec<Story>> {
    let ids = feed_ids(feed).await?;
    let slice: Vec<u64> = ids.into_iter().skip(offset).take(limit).collect();
    let stories = join_all(slice.into_iter().map(story)).await;
    Ok(stories.into_iter().filter_map(|s| s.ok()).collect())
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Comment {
    pub id: u64,
    pub author: Option<String>,
    /// Original HN markup, kept for faithful rendering
    pub html: String,
    /// Flattened plain text, used when building AI context
    pub text: String,
    pub created_at: String,
    pub depth: u32,
    pub children: Vec<Comment>,
    /// Total comments in this subtree including itself
    pub subtree_size: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Thread {
    pub id: u64,
    pub title: String,
    pub url: Option<String>,
    pub domain: Option<String>,
    pub author: Option<String>,
    pub points: Option<i64>,
    pub created_at: String,
    /// Self-post body (Ask HN, Show HN, Tell HN)
    pub text: Option<String>,
    pub comments: Vec<Comment>,
    pub comment_count: u32,
}

#[derive(Deserialize)]
struct AlgoliaItem {
    id: u64,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    author: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    points: Option<i64>,
    #[serde(default)]
    children: Vec<AlgoliaItem>,
}

fn build_comment(item: AlgoliaItem, depth: u32) -> Option<Comment> {
    // Deleted and flagged comments arrive with no author and no body. Their
    // children are still worth keeping, so they are spliced into the parent
    // rather than dropped with the subtree.
    let html = item.text.unwrap_or_default();
    let children: Vec<Comment> = item
        .children
        .into_iter()
        .filter_map(|c| build_comment(c, depth + 1))
        .collect();

    if item.author.is_none() && html.trim().is_empty() {
        return None;
    }

    let subtree_size = 1 + children.iter().map(|c| c.subtree_size).sum::<u32>();
    Some(Comment {
        id: item.id,
        author: item.author,
        text: crate::text::html_to_text(&html),
        html,
        created_at: item.created_at.unwrap_or_default(),
        depth,
        children,
        subtree_size,
    })
}

pub async fn thread(id: u64) -> Result<Thread> {
    let url = format!("{ALGOLIA}/items/{id}");
    let root: AlgoliaItem = client().get(url).send().await?.json().await?;

    let title = root.title.clone().unwrap_or_else(|| "(untitled)".into());
    let story_url = root.url.clone();
    let domain = story_url.as_deref().and_then(domain_of);
    let text = root
        .text
        .clone()
        .filter(|t| !t.trim().is_empty())
        .map(|t| crate::text::html_to_text(&t));

    let comments: Vec<Comment> = root
        .children
        .into_iter()
        .filter_map(|c| build_comment(c, 0))
        .collect();
    let comment_count = comments.iter().map(|c| c.subtree_size).sum();

    Ok(Thread {
        id: root.id,
        title,
        url: story_url,
        domain,
        author: root.author,
        points: root.points,
        created_at: root.created_at.unwrap_or_default(),
        text,
        comments,
        comment_count,
    })
}

#[derive(Deserialize)]
struct SearchResponse {
    hits: Vec<SearchHit>,
}

#[derive(Deserialize)]
struct SearchHit {
    #[serde(rename = "objectID")]
    object_id: String,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    author: Option<String>,
    #[serde(default)]
    points: Option<i64>,
    #[serde(default)]
    num_comments: Option<i64>,
    #[serde(default)]
    created_at_i: Option<i64>,
    #[serde(default)]
    story_text: Option<String>,
}

pub async fn search(query: &str, by_date: bool) -> Result<Vec<Story>> {
    let endpoint = if by_date { "search_by_date" } else { "search" };
    let url = format!(
        "{ALGOLIA}/{endpoint}?query={}&tags=story&hitsPerPage=40",
        urlencoding::encode(query)
    );
    let response: SearchResponse = client().get(url).send().await?.json().await?;

    Ok(response
        .hits
        .into_iter()
        .filter_map(|hit| {
            let id: u64 = hit.object_id.parse().ok()?;
            let domain = hit.url.as_deref().and_then(domain_of);
            Some(Story {
                id,
                title: hit.title.unwrap_or_else(|| "(untitled)".into()),
                url: hit.url,
                domain,
                by: hit.author.unwrap_or_else(|| "unknown".into()),
                score: hit.points.unwrap_or(0),
                descendants: hit.num_comments.unwrap_or(0),
                time: hit.created_at_i.unwrap_or(0),
                text: hit.story_text,
                kind: "story".into(),
            })
        })
        .collect())
}

/// Flatten a comment forest depth-first, which is the order a reader sees.
pub fn flatten(comments: &[Comment]) -> Vec<&Comment> {
    let mut out = Vec::new();
    fn walk<'a>(nodes: &'a [Comment], out: &mut Vec<&'a Comment>) {
        for node in nodes {
            out.push(node);
            walk(&node.children, out);
        }
    }
    walk(comments, &mut out);
    out
}
