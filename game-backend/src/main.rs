mod websockets;
mod state;
use state::GameState;
use std::sync::{Arc, Mutex};


#[tokio::main]
async fn main() {
    let game_state = Arc::new(Mutex::new(GameState::new()));
    websockets::run(game_state).await;
}
