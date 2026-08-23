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

/// Algolia serves a whole comment tree in one request, which is why it is the
/// first choice. Its index lags behind Hacker News by some minutes to hours, so
/// a story from the front page is often missing from it entirely — at the time
/// of writing, 21 of the top 30. Firebase always has the data and costs one
/// request per comment, so it is the fallback rather than the default.
pub async fn thread(id: u64) -> Result<Thread> {
    match thread_via_algolia(id).await {
        Ok(thread) => Ok(thread),
        Err(_) => thread_via_firebase(id).await,
    }
}

async fn thread_via_algolia(id: u64) -> Result<Thread> {
    let url = format!("{ALGOLIA}/items/{id}");
    let response = client().get(url).send().await?;
    if !response.status().is_success() {
        return Err(anyhow!("algolia has not indexed {id} yet"));
    }
    let root: AlgoliaItem = response.json().await?;

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

#[derive(Deserialize, Default)]
struct FirebaseComment {
    #[serde(default)]
    id: u64,
    #[serde(default)]
    by: Option<String>,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    time: Option<i64>,
    #[serde(default)]
    kids: Vec<u64>,
    #[serde(default)]
    deleted: bool,
    #[serde(default)]
    dead: bool,
}

/// Bounded so a thousand-comment thread cannot turn into a thousand requests
/// before the reader sees anything.
const MAX_FIREBASE_COMMENTS: usize = 600;

async fn thread_via_firebase(id: u64) -> Result<Thread> {
    let story = story(id).await?;

    let root: FirebaseComment = client()
        .get(format!("{FIREBASE}/item/{id}.json"))
        .send()
        .await?
        .json()
        .await?;

    // Breadth-first, one level at a time, so the fetches inside a level run
    // together and the cap trims the deepest replies rather than a whole branch.
    let mut fetched: std::collections::HashMap<u64, FirebaseComment> =
        std::collections::HashMap::new();
    let mut frontier = root.kids.clone();

    while !frontier.is_empty() && fetched.len() < MAX_FIREBASE_COMMENTS {
        let room = MAX_FIREBASE_COMMENTS - fetched.len();
        let batch: Vec<u64> = frontier.iter().copied().take(room).collect();

        let results = join_all(batch.iter().map(|kid| {
            let url = format!("{FIREBASE}/item/{kid}.json");
            async move {
                client()
                    .get(url)
                    .send()
                    .await
                    .ok()?
                    .json::<FirebaseComment>()
                    .await
                    .ok()
            }
        }))
        .await;

        let mut next = Vec::new();
        for comment in results.into_iter().flatten() {
            next.extend(comment.kids.iter().copied());
            fetched.insert(comment.id, comment);
        }
        frontier = next;
    }

    let comments = build_firebase(&root.kids, &fetched, 0);
    let comment_count = comments.iter().map(|c| c.subtree_size).sum();

    Ok(Thread {
        id,
        title: story.title,
        url: story.url,
        domain: story.domain,
        author: Some(story.by),
        points: Some(story.score),
        created_at: iso_from_unix(story.time),
        text: story
            .text
            .filter(|t| !t.trim().is_empty())
            .map(|t| crate::text::html_to_text(&t)),
        comments,
        comment_count,
    })
}

fn build_firebase(
    ids: &[u64],
    fetched: &std::collections::HashMap<u64, FirebaseComment>,
    depth: u32,
) -> Vec<Comment> {
    let mut out = Vec::new();
    for id in ids {
        let comment = match fetched.get(id) {
            Some(comment) => comment,
            None => continue,
        };
        let children = build_firebase(&comment.kids, fetched, depth + 1);
        let html = comment.text.clone().unwrap_or_default();

        // A removed comment can still have live replies, so it is spliced out
        // rather than taken down with its branch.
        if comment.deleted || comment.dead || (comment.by.is_none() && html.trim().is_empty()) {
            out.extend(children);
            continue;
        }

        let subtree_size = 1 + children.iter().map(|c| c.subtree_size).sum::<u32>();
        out.push(Comment {
            id: comment.id,
            author: comment.by.clone(),
            text: crate::text::html_to_text(&html),
            html,
            created_at: iso_from_unix(comment.time.unwrap_or(0)),
            depth,
            children,
            subtree_size,
        });
    }
    out
}

fn iso_from_unix(seconds: i64) -> String {
    chrono::DateTime::from_timestamp(seconds, 0)
        .map(|when| when.to_rfc3339())
        .unwrap_or_default()
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn comment(id: u64, by: Option<&str>, text: &str, kids: Vec<u64>) -> FirebaseComment {
        FirebaseComment {
            id,
            by: by.map(str::to_string),
            text: Some(text.to_string()),
            time: Some(1_700_000_000),
            kids,
            deleted: false,
            dead: false,
        }
    }

    #[test]
    fn firebase_replies_nest_and_count_their_subtrees() {
        let mut fetched = HashMap::new();
        fetched.insert(1, comment(1, Some("alice"), "top", vec![2, 3]));
        fetched.insert(2, comment(2, Some("bob"), "reply", vec![4]));
        fetched.insert(3, comment(3, Some("carol"), "another", vec![]));
        fetched.insert(4, comment(4, Some("dan"), "deep", vec![]));

        let built = build_firebase(&[1], &fetched, 0);
        assert_eq!(built.len(), 1);
        assert_eq!(built[0].subtree_size, 4);
        assert_eq!(built[0].children.len(), 2);
        assert_eq!(built[0].children[0].depth, 1);
        assert_eq!(built[0].children[0].children[0].depth, 2);
    }

    #[test]
    fn a_deleted_comment_is_spliced_out_but_keeps_its_replies() {
        let mut fetched = HashMap::new();
        let mut removed = comment(1, None, "", vec![2]);
        removed.deleted = true;
        fetched.insert(1, removed);
        fetched.insert(2, comment(2, Some("bob"), "still here", vec![]));

        let built = build_firebase(&[1], &fetched, 0);
        assert_eq!(built.len(), 1, "the reply should survive its parent");
        assert_eq!(built[0].author.as_deref(), Some("bob"));
    }

    #[test]
    fn a_reply_that_was_never_fetched_is_skipped_rather_than_faked() {
        // The walk is capped, so the deepest ids can be missing from the map.
        let mut fetched = HashMap::new();
        fetched.insert(1, comment(1, Some("alice"), "top", vec![999]));

        let built = build_firebase(&[1], &fetched, 0);
        assert_eq!(built[0].children.len(), 0);
        assert_eq!(built[0].subtree_size, 1);
    }
}
