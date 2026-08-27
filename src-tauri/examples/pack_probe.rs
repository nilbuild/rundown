//! How often does packing actually drop comments, and what does it drop?
use rundown_lib::{hn, prompts, store::Store};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let store = Store::open()?;
    let mut binding = 0;
    let mut total = 0;

    for (key, raw) in store.cache_rows("thread")? {
        let thread: hn::Thread = match serde_json::from_str(&raw) {
            Ok(t) => t,
            Err(_) => continue,
        };
        let _ = key;
        let stats = prompts::pack_stats(&thread, None);
        total += 1;
        if stats.included < stats.total {
            binding += 1;
            println!(
                "{:>4}/{:<4} packed  {:>6}k chars  {}",
                stats.included,
                stats.total,
                stats.chars / 1000,
                &thread.title.chars().take(44).collect::<String>()
            );
        }
    }
    println!("\n{binding} of {total} cached threads exceed the budget");
    Ok(())
}
