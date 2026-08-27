use super::*;

#[derive(Default)]
pub struct Registry {
    running: Mutex<HashMap<String, Child>>,
}

impl Registry {
    pub(super) fn insert(&self, run_id: &str, child: Child) {
        if let Ok(mut map) = self.running.lock() {
            map.insert(run_id.to_string(), child);
        }
    }

    pub(super) fn take(&self, run_id: &str) -> Option<Child> {
        self.running.lock().ok()?.remove(run_id)
    }

    pub fn cancel(&self, run_id: &str) -> bool {
        match self.take(run_id) {
            Some(mut child) => {
                let _ = child.start_kill();
                true
            }
            None => false,
        }
    }

    pub fn cancel_all(&self) {
        let ids: Vec<String> = self
            .running
            .lock()
            .map(|map| map.keys().cloned().collect())
            .unwrap_or_default();
        for id in ids {
            self.cancel(&id);
        }
    }
}
