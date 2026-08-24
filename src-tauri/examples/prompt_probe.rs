//! Show exactly what a rundown prompt contains for a real story.
use sift_lib::{article, hn, prompts};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let id: u64 = std::env::args().nth(1).unwrap_or_else(|| "49408550".into()).parse()?;
    let thread = hn::thread(id).await?;
    let art = match thread.url.as_deref() {
        Some(url) => article::extract(url).await.ok(),
        None => None,
    };

    println!("story    : {}", thread.title);
    println!("url      : {:?}", thread.url);
    match &art {
        Some(a) if a.note.is_some() => println!("article  : NOT EXTRACTED — {:?}", a.note),
        Some(a) => println!("article  : {} words, degraded={}", a.word_count, a.degraded),
        None => println!("article  : none"),
    }
    println!("comments : {}", thread.comment_count);

    let prompt = prompts::rundown_prompt(&thread, art.as_ref());
    let stats = prompts::pack_stats(&thread, art.as_ref());

    let has_article_block = prompt.contains("<article>");
    let has_thread_block = prompt.contains("<thread>");
    let article_len = prompt
        .find("</article>")
        .and_then(|end| prompt.find("<article>").map(|start| end - start))
        .unwrap_or(0);
    let thread_len = prompt.len().saturating_sub(article_len);

    println!("\n--- prompt ---");
    println!("<article> block present : {has_article_block}  ({article_len} chars)");
    println!("<thread>  block present : {has_thread_block}  (~{thread_len} chars)");
    println!("comments packed         : {} of {}", stats.included, stats.total);
    println!("total                   : {} chars (~{}k tokens)", prompt.len(), prompt.len() / 4000);
    Ok(())
}
