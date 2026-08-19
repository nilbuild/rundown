//! Dump the extracted markdown for a URL, so conversion bugs are visible.
//!
//! cargo run --release --example extract -- <url>

use sift_lib::article;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let url = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "https://example.com".into());

    let found = article::extract(&url).await?;
    eprintln!("title: {}", found.title);
    eprintln!("byline: {:?}", found.byline);
    eprintln!("words: {}", found.word_count);
    eprintln!("note: {:?}", found.note);
    eprintln!("─────────────────────────────");
    println!("{}", found.markdown);
    Ok(())
}
