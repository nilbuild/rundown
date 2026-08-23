//! Load a thread the way the app does and report which upstream served it.
use sift_lib::hn;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    for arg in std::env::args().skip(1) {
        let id: u64 = arg.parse()?;
        let started = std::time::Instant::now();
        match hn::thread(id).await {
            Ok(t) => println!(
                "ok   {id}  {:>4} comments  {:>5.1}s  {}",
                t.comment_count,
                started.elapsed().as_secs_f32(),
                &t.title.chars().take(46).collect::<String>()
            ),
            Err(e) => println!("FAIL {id}  {e}"),
        }
    }
    Ok(())
}
